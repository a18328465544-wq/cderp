import type { PoolClient } from "pg";
import { acquireStateWriteLock, withDatabaseTransaction } from "./db.ts";
import { ConflictError } from "./errors.ts";
import {
  buildReturnFinanceRepairPlan,
  inspectReturnFinancialConsistency,
  RETURN_PURCHASE_REFUND_TYPE,
  type ReturnFinanceIssue,
  type ReturnFinanceRepair,
  type ReturnFinanceStateLike,
} from "./returnFinanceInvariants.ts";

/**
 * Legacy return-finance repair is deliberately operator-run. The normal request
 * path uses the same domain invariant, while this module only reads the aggregate
 * and applies unambiguous JSONB relabels inside one database transaction.
 */
const RETURN_FINANCE_TABLES = {
  returnOrders: "gpu_return_orders",
  paymentInRecords: "gpu_payment_in_records",
  paymentOutRecords: "gpu_payment_out_records",
  settlementLedger: "gpu_settlement_ledger",
  financeLedger: "gpu_finance_ledger",
} as const;

export type ReturnFinanceMigrationReport = {
  dryRun: boolean;
  inspectedReturns: number;
  issues: ReturnFinanceIssue[];
  plannedRepairs: ReturnFinanceRepair[];
  appliedRepairCount: number;
  remainingIssues: ReturnFinanceIssue[];
};

async function readCollection<T>(client: PoolClient, table: string): Promise<T[]> {
  const result = await client.query<{ data: T }>(`SELECT data FROM ${table} ORDER BY id ASC`);
  return result.rows.map((row) => row.data);
}

export async function readReturnFinanceAuditState(client: PoolClient): Promise<ReturnFinanceStateLike> {
  // pg does not allow concurrent statements on one PoolClient. Keep the reads
  // sequential so the audit sees one transaction snapshot consistently.
  return {
    returnOrders: await readCollection(client, RETURN_FINANCE_TABLES.returnOrders),
    paymentInRecords: await readCollection(client, RETURN_FINANCE_TABLES.paymentInRecords),
    paymentOutRecords: await readCollection(client, RETURN_FINANCE_TABLES.paymentOutRecords),
    settlementLedger: await readCollection(client, RETURN_FINANCE_TABLES.settlementLedger),
    financeLedger: await readCollection(client, RETURN_FINANCE_TABLES.financeLedger),
  };
}

function sourceBusinessType(repair: ReturnFinanceRepair) {
  return repair.fromBusinessType || "";
}

function linkedDocumentNumbers(repair: ReturnFinanceRepair) {
  return Array.from(new Set([repair.returnId, repair.returnNo, repair.paymentInId].filter(Boolean)));
}

async function assertOneRow(result: { rowCount: number | null }, message: string) {
  if (result.rowCount !== 1) throw new ConflictError(message);
}

/** Apply only repairs produced by buildReturnFinanceRepairPlan. */
export async function applyReturnFinanceRepairPlan(client: PoolClient, repairs: ReturnFinanceRepair[]) {
  for (const repair of repairs) {
    if (!repair.settlementLedgerId || !repair.financeLedgerId) {
      throw new ConflictError(`退货 ${repair.returnNo} 的安全修复缺少完整流水关联，已中止`);
    }

    const sourceType = sourceBusinessType(repair);
    const documentNumbers = linkedDocumentNumbers(repair);
    const paymentResult = await client.query(
      `UPDATE ${RETURN_FINANCE_TABLES.paymentInRecords}
          SET data = jsonb_set(
                    jsonb_set(
                      jsonb_set(data, '{businessType}', to_jsonb($1::text), true),
                      '{relatedDocType}', to_jsonb($2::text), true
                    ),
                    '{relatedDocNo}', to_jsonb($3::text), true
                  ),
              updated_at = NOW()
        WHERE id = $4
          AND COALESCE(data->>'relatedDocType', '') = '退货单'
          AND COALESCE(data->>'relatedDocNo', '') = ANY($5::text[])
          AND COALESCE(data->>'businessType', '') = $6`,
      [RETURN_PURCHASE_REFUND_TYPE, "退货单", repair.returnNo, repair.paymentInId, documentNumbers, sourceType],
    );
    await assertOneRow(paymentResult, `退货 ${repair.returnNo} 的收款流水 ${repair.paymentInId} 状态已变化，安全修复已中止`);

    const settlementResult = await client.query(
      `UPDATE ${RETURN_FINANCE_TABLES.settlementLedger}
          SET data = jsonb_set(
                    jsonb_set(data, '{businessType}', to_jsonb($1::text), true),
                    '{relatedDocNo}', to_jsonb($2::text), true
                  ),
              updated_at = NOW()
        WHERE id = $3
          AND COALESCE(data->>'relatedDocNo', '') = ANY($4::text[])
          AND COALESCE(data->>'businessType', '') = $5`,
      [RETURN_PURCHASE_REFUND_TYPE, repair.returnNo, repair.settlementLedgerId, documentNumbers, sourceType],
    );
    await assertOneRow(settlementResult, `退货 ${repair.returnNo} 的账户流水 ${repair.settlementLedgerId} 状态已变化，安全修复已中止`);

    const financeResult = await client.query(
      `UPDATE ${RETURN_FINANCE_TABLES.financeLedger}
          SET data = jsonb_set(
                    jsonb_set(
                      jsonb_set(data, '{type}', to_jsonb($1::text), true),
                      '{relatedDocType}', to_jsonb($2::text), true
                    ),
                    '{relatedId}', to_jsonb($3::text), true
                  ),
              updated_at = NOW()
        WHERE id = $4
          AND COALESCE(data->>'relatedId', '') = ANY($5::text[])
          AND COALESCE(data->>'type', '') = $6`,
      [RETURN_PURCHASE_REFUND_TYPE, "退货单", repair.returnNo, repair.financeLedgerId, documentNumbers, sourceType],
    );
    await assertOneRow(financeResult, `退货 ${repair.returnNo} 的财务流水 ${repair.financeLedgerId} 状态已变化，安全修复已中止`);
  }
  return repairs.length;
}

export async function runReturnFinanceMigration(dryRun = true): Promise<ReturnFinanceMigrationReport> {
  // Keep the audit/repair from racing with normal aggregate writes in another
  // Node process. The transaction makes the complete repair set all-or-nothing.
  const releaseLock = await acquireStateWriteLock();
  try {
    return await withDatabaseTransaction(async (client) => {
      const before = await readReturnFinanceAuditState(client);
      const issues = inspectReturnFinancialConsistency(before);
      const plannedRepairs = buildReturnFinanceRepairPlan(before);
      let appliedRepairCount = 0;
      let remainingIssues = issues;

      if (!dryRun && plannedRepairs.length) {
        appliedRepairCount = await applyReturnFinanceRepairPlan(client, plannedRepairs);
        const after = await readReturnFinanceAuditState(client);
        remainingIssues = inspectReturnFinancialConsistency(after);
      }

      return {
        dryRun,
        inspectedReturns: before.returnOrders.length,
        issues,
        plannedRepairs,
        appliedRepairCount,
        remainingIssues,
      };
    });
  } finally {
    await releaseLock();
  }
}
