import type { AppState } from "./store.ts";
import {
  buildCustomerFundsRows,
  buildFundsTrend,
  getCustomerFundsCounts,
  getFundsBalanceAtDate,
  getFundsCashTotals,
  type CustomerFundsSnapshot,
} from "./customerFundsUtils.ts";
import {endOfMonth, shiftMonth, startOfMonth} from "../src/lib/dateRangePickerUtils.ts";
import { storeDateTime } from "../src/utils/storeTime.ts";

export interface CustomerFundsQuery {
  today: string;
  startDate: string;
  endDate: string;
  trendStartDate: string;
  trendEndDate: string;
}

export interface CustomerFundsCollections {
  purchaseInvoices: AppState["purchaseInvoices"];
  salesInvoices: AppState["salesInvoices"];
  customers: AppState["customers"];
  vendors: AppState["vendors"];
  paymentInRecords: AppState["paymentInRecords"];
  paymentOutRecords: AppState["paymentOutRecords"];
}

function sumCurrentBalance(rows: ReturnType<typeof buildCustomerFundsRows>) {
  const payable = rows.reduce((sum, row) => sum + row.payable, 0);
  const receivable = rows.reduce((sum, row) => sum + row.receivable, 0);
  return { payable, receivable, net: receivable - payable };
}

/**
 * Builds the read-only customer funds projection on the server. The browser receives only the
 * fields required by the page and never needs direct access to payment or settlement collections.
 */
export function buildCustomerFundsSnapshot(state: AppState, query: CustomerFundsQuery): CustomerFundsSnapshot {
  return buildCustomerFundsSnapshotFromCollections(state, query);
}

export function buildCustomerFundsSnapshotFromCollections(state: CustomerFundsCollections, query: CustomerFundsQuery): CustomerFundsSnapshot {
  const rows = buildCustomerFundsRows({
    invoices: state.purchaseInvoices,
    salesInvoices: state.salesInvoices,
    customers: state.customers,
    vendors: state.vendors,
    paymentInRecords: state.paymentInRecords,
    paymentOutRecords: state.paymentOutRecords,
    today: query.today,
  });
  const previousMonth = shiftMonth(query.today.slice(0, 7), -1);
  return {
    rows,
    counts: getCustomerFundsCounts(rows),
    currentBalance: sumCurrentBalance(rows),
    previousBalance: getFundsBalanceAtDate(rows, endOfMonth(previousMonth)),
    cashTotals: getFundsCashTotals(state.paymentInRecords, state.paymentOutRecords, query.startDate, query.endDate),
    previousCashTotals: getFundsCashTotals(
      state.paymentInRecords,
      state.paymentOutRecords,
      startOfMonth(previousMonth),
      endOfMonth(previousMonth),
    ),
    trend: buildFundsTrend(rows, query.trendStartDate, query.trendEndDate),
    generatedAt: storeDateTime(),
  };
}
