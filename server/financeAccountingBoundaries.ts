import {financeExpenseCategories} from "../src/types/finance-expense.ts";
import {financeIncomeCategories} from "../src/types/finance-income.ts";
import {ConflictError, ValidationError} from "./errors.ts";

export const NON_OPERATING_INCOME_TYPES = new Set<string>(financeIncomeCategories);
export const NON_OPERATING_EXPENSE_TYPES = new Set<string>(financeExpenseCategories);

export const RETURN_PURCHASE_REFUND_TYPE = "采购退款" as const;
export const RETURN_CUSTOMER_REFUND_TYPE = "客户退款" as const;
export const AFTERSALES_REPAIR_TYPE = "维修费" as const;

const RETURN_DOCUMENT_TYPE = "退货单";
const AFTERSALES_DOCUMENT_TYPE = "售后单";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim();
}

/**
 * Keep automatically generated business money movements away from the manual
 * non-operating income/expense buckets. This is deliberately shared by both
 * settlement-ledger and finance-ledger writers so a future caller cannot make
 * the two ledgers disagree by using a different validation path.
 */
export function assertAccountingMovementBoundary(input: {
  businessType?: string;
  relatedDocType?: string;
  direction?: string;
  amount?: number;
  signedAmount?: number;
}) {
  const businessType = text(input.businessType);
  const relatedDocType = text(input.relatedDocType);
  const direction = text(input.direction);
  const amount = input.amount === undefined ? undefined : Number(input.amount);
  const signedAmount = input.signedAmount === undefined ? undefined : Number(input.signedAmount);

  if (relatedDocType && (NON_OPERATING_INCOME_TYPES.has(businessType) || NON_OPERATING_EXPENSE_TYPES.has(businessType))) {
    throw new ValidationError("非经营收支不能绑定业务单据，请使用对应的业务收款、付款或退款流程");
  }

  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
    throw new ValidationError("业务资金流水金额必须大于 0");
  }

  const isReturnRefund = businessType === RETURN_PURCHASE_REFUND_TYPE || businessType === RETURN_CUSTOMER_REFUND_TYPE;
  if (isReturnRefund) {
    const validDocument = businessType === RETURN_CUSTOMER_REFUND_TYPE
      ? relatedDocType === RETURN_DOCUMENT_TYPE || relatedDocType === AFTERSALES_DOCUMENT_TYPE
      : relatedDocType === RETURN_DOCUMENT_TYPE;
    if (!validDocument) {
      throw new ConflictError("退货退款只能绑定退货单或售后单，不能作为独立收支登记");
    }
  }

  if (relatedDocType === AFTERSALES_DOCUMENT_TYPE) {
    if (businessType !== RETURN_CUSTOMER_REFUND_TYPE && businessType !== AFTERSALES_REPAIR_TYPE) {
      throw new ConflictError("售后单资金流水只能使用客户退款或维修费类型");
    }
    if (direction && direction !== "支出") {
      throw new ConflictError("售后单资金流水必须为支出方向");
    }
    if (signedAmount !== undefined && signedAmount >= 0) {
      throw new ConflictError("售后单资金流水必须为负数");
    }
    return;
  }

  if (relatedDocType !== RETURN_DOCUMENT_TYPE) return;

  if (!isReturnRefund) {
    throw new ConflictError("退货单资金流水必须使用采购退款或客户退款类型，不能记入其他收支");
  }

  if (businessType === RETURN_PURCHASE_REFUND_TYPE && direction && direction !== "收入") {
    throw new ConflictError("进货退货只能生成收入方向的采购退款流水");
  }
  if (businessType === RETURN_CUSTOMER_REFUND_TYPE && direction && direction !== "支出") {
    throw new ConflictError("销售退货只能生成支出方向的客户退款流水");
  }
  if (signedAmount !== undefined) {
    if (businessType === RETURN_PURCHASE_REFUND_TYPE && signedAmount <= 0) {
      throw new ConflictError("采购退款的财务流水必须为正数");
    }
    if (businessType === RETURN_CUSTOMER_REFUND_TYPE && signedAmount >= 0) {
      throw new ConflictError("客户退款的财务流水必须为负数");
    }
  }
}
