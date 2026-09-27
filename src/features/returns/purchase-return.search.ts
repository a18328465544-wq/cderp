import type {SelectOption} from "@/src/components/ui";
import {formatCurrency} from "@/src/lib/format";
import type {PurchaseInvoice} from "@/src/types/purchase";

/**
 * Keep the purchase-order picker searchable by business identifiers, not only
 * by the short label shown in the selected field.
 */
export function purchaseInvoiceSearchOption(invoice: PurchaseInvoice): SelectOption {
  const productSummary = invoice.items
    .map((item) => [item.productName, item.brand, item.model, item.version, item.sn].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" · ");
  const source = invoice.supplierName || "未记录来源";
  return {
    value: invoice.invoiceNo,
    label: `${invoice.invoiceNo} · ${source}`,
    labelText: `${invoice.invoiceNo} · ${source}`,
    description: `${invoice.date || "未记录日期"} · ${productSummary || "未记录商品"} · ${formatCurrency(invoice.totalCost)}`,
    searchText: [invoice.id, invoice.invoiceNo, source, invoice.contact, invoice.sourceType, invoice.date, invoice.remarks, productSummary].filter(Boolean).join(" "),
  };
}
