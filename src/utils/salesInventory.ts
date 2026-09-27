type SalesInventoryReservationRecord = {
  outboundStatus?: string;
  status?: string;
  returnStatus?: string;
  deletedAt?: string;
  isDeleted?: boolean;
};

export function shouldReserveSalesInvoiceInventory(invoice: SalesInventoryReservationRecord) {
  if (invoice.outboundStatus !== "待出库") return false;

  const status = String(invoice.status ?? "");
  const returnStatus = String(invoice.returnStatus ?? "");
  if (invoice.deletedAt || invoice.isDeleted) return false;
  if (/取消|删除|作废/.test(status)) return false;
  if (/已退货|退货完成/.test(returnStatus)) return false;

  return true;
}
