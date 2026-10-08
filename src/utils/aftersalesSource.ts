/** Match the current physical ownership, not every historical use of an SN. */
export function matchesAftersalesSource(
  claim: {salesInvoiceNo: string; inventoryNo?: string; sn?: string},
  invoice: {id: string; invoiceNo?: string},
  card: {id: string; sn?: string},
) {
  const sameSale = Boolean(claim.salesInvoiceNo) && (claim.salesInvoiceNo === invoice.id || claim.salesInvoiceNo === invoice.invoiceNo);
  const sameCard = claim.inventoryNo ? claim.inventoryNo === card.id : Boolean(claim.sn && claim.sn === card.sn);
  return sameSale && sameCard && (!claim.sn || claim.sn === card.sn);
}
