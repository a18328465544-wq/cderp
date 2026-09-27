import type { AppState } from "./store.ts";
import { storeDate } from "../src/utils/storeTime.ts";
import { ValidationError } from "./errors.ts";

// Server-side CSV export. Cost/profit columns are gated by the showCost permission so that
// a seller without cost visibility cannot exfiltrate margins through the export endpoint.

export type CsvCell = string | number | boolean | null | undefined;

export function csvEscape(value: CsvCell): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safeText = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\r\n");
}

export const EXPORT_DATASETS = ["inventory", "sales", "purchases", "ledger", "customers"] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];
const EXPORT_FILENAME_PREFIX = "成都显卡一号店";

export function isExportDataset(value: string): value is ExportDataset {
  return (EXPORT_DATASETS as readonly string[]).includes(value);
}

interface ExportOptions {
  showCost: boolean;
}

function exportFilename(name: string) {
  return name.startsWith(EXPORT_FILENAME_PREFIX) ? name : `${EXPORT_FILENAME_PREFIX}${name}`;
}

export function buildExport(state: AppState, dataset: string, options: ExportOptions): { filename: string; csv: string } {
  if (!isExportDataset(dataset)) {
    throw new ValidationError(`不支持的导出数据集: ${dataset}`);
  }
  const stamp = storeDate();
  const { showCost } = options;

  switch (dataset) {
    case "inventory": {
      const headers = ["库存ID", "商品名称", "品类", "型号", "品牌", "SN", "状态", "成色", "库位", "供应商", "入库日期"];
      if (showCost) headers.push("成本价", "预计售价");
      const rows = state.inventory.map((card) => {
        const base: CsvCell[] = [card.id, card.productName, card.category, card.model, card.brand, card.sn, card.status, card.condition, card.warehouseLocation, card.supplierName, card.entryTime];
        if (showCost) base.push(card.costPrice, card.estSellPrice);
        return base;
      });
      return { filename: exportFilename(`库存明细_${stamp}.csv`), csv: toCsv(headers, rows) };
    }
    case "sales": {
      const headers = ["销售单号", "日期", "客户", "渠道", "数量", "销售金额", "已收", "未收", "出库状态"];
      if (showCost) headers.push("成本合计", "毛利");
      const rows = state.salesInvoices.map((invoice) => {
        const base: CsvCell[] = [invoice.invoiceNo, invoice.date, invoice.customerName, invoice.channel, invoice.totalCount, invoice.totalAmount, invoice.paidAmount, invoice.unpaidAmount, invoice.outboundStatus];
        if (showCost) base.push(invoice.totalCost, invoice.totalProfit);
        return base;
      });
      return { filename: exportFilename(`销售单_${stamp}.csv`), csv: toCsv(headers, rows) };
    }
    case "purchases": {
      const headers = ["进货单号", "日期", "供应商", "来源", "数量", "采购金额", "已付", "未付"];
      const rows = state.purchaseInvoices.map((invoice) => [invoice.invoiceNo, invoice.date, invoice.supplierName, invoice.sourceType, invoice.totalCount, invoice.totalCost, invoice.paidAmount, invoice.unpaidAmount] as CsvCell[]);
      return { filename: exportFilename(`进货单_${stamp}.csv`), csv: toCsv(headers, rows) };
    }
    case "ledger": {
      const headers = ["流水ID", "时间", "类型", "关联单据", "金额", "支付方式", "经办人", "状态"];
      const rows = state.financeLedger.map((item) => [item.id, item.time, item.type, item.relatedId, item.amount, item.paymentWay, item.operator, item.status] as CsvCell[]);
      return { filename: exportFilename(`财务流水_${stamp}.csv`), csv: toCsv(headers, rows) };
    }
    case "customers": {
      const headers = ["客户ID", "姓名", "电话", "类型", "成交次数", "成交金额", "欠款余额", "最近成交"];
      if (showCost) headers.push("累计毛利");
      const rows = state.customers.map((customer) => {
        const base: CsvCell[] = [customer.id, customer.name, customer.phone, customer.type, customer.buyCount, customer.totalAmount, customer.debtBalance || 0, customer.lastDealTime];
        if (showCost) base.push(customer.totalProfit);
        return base;
      });
      return { filename: exportFilename(`客户档案_${stamp}.csv`), csv: toCsv(headers, rows) };
    }
  }
}
