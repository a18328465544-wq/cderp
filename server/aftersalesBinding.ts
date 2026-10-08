import type {AftersalesRecord, CardInventory, CustomerCard, ProductTemplate, SalesInvoice, Vendor} from "../src/types.ts";
import {ConflictError, NotFoundError} from "./errors.ts";
import {createProductIdentityIndex} from "../src/utils/productIdentity.ts";
import {salesReturnLineMatchesCard} from "./storeReturnPlanning.ts";
import {hasUniqueLegacyName} from "./storePartnerIdentity.ts";

type PhysicalReference = Pick<AftersalesRecord, "inventoryNo" | "sn" | "salesInvoiceNo" | "customerId">;
type SourceState = {inventory: CardInventory[]; salesInvoices: SalesInvoice[]; products: ProductTemplate[]; customers: CustomerCard[]; vendors: Vendor[]};

export function isAftersalesClosed(record: Pick<AftersalesRecord, "status" | "accountingStatus">) {
  return record.accountingStatus === "作废" || record.accountingStatus === "已入账"
    || ["已完成", "已维修", "已退款", "已解决", "已拒绝"].includes(record.status);
}

/** Stable IDs locate the physical unit; SN and the original sold line prove ownership. */
export function resolveAftersalesSource(state: SourceState, reference: PhysicalReference, phase: "create" | "resolve") {
  const invoices = state.salesInvoices.filter((invoice) => invoice.id === reference.salesInvoiceNo || invoice.invoiceNo === reference.salesInvoiceNo);
  const invoice = invoices[0];
  if (!invoice) throw new NotFoundError("售后原销售单不存在，请刷新后重新选择");
  if (invoices.length !== 1) throw new ConflictError("售后原销售单编号不唯一，请先核对单据");
  if (invoice.accountingStatus === "作废") throw new ConflictError("原销售单已作废，不能处理售后库存");
  if (invoice.outboundStatus === "待出库") throw new ConflictError("销售单尚未完成出库，不能登记售后");
  // New requests require an ID. Only an old record actually missing an ID may
  // use a unique SN; an explicit missing/wrong ID never falls back to the SN.
  const cards = reference.inventoryNo
    ? state.inventory.filter((card) => card.id === reference.inventoryNo)
    : phase === "resolve" && reference.sn ? state.inventory.filter((card) => card.sn === reference.sn) : [];
  const card = cards[0];
  if (!card) throw new NotFoundError("售后原库存不存在，请核对实物编号");
  if (cards.length !== 1) throw new ConflictError("售后库存序列号不唯一，请先核对实物编号");
  if (!card.sn || (phase === "create" && !reference.sn) || (reference.sn && reference.sn !== card.sn)) {
    throw new ConflictError("售后库存序列号已变更或不一致，请核对实物");
  }
  if (card.salesInvoiceId !== invoice.id && card.salesInvoiceId !== invoice.invoiceNo) {
    throw new ConflictError("售后库存不属于原销售单，可能已退货或再次销售");
  }
  const partners = invoice.customerPartnerType === "vendor" ? state.vendors : state.customers;
  const legacyPartner = !invoice.customerId && hasUniqueLegacyName<{name: string}>(partners, invoice.customerName)
    ? partners.find((partner) => partner.name.trim() === invoice.customerName.trim()) : undefined;
  const partnerId = invoice.customerId || legacyPartner?.id;
  if (reference.customerId && reference.customerId !== partnerId) {
    throw new ConflictError("售后客户与原销售单不一致");
  }
  const productIndex = createProductIdentityIndex(state.products);
  const lines = invoice.items.filter((item) => salesReturnLineMatchesCard(item, card, state.products, productIndex));
  const item = lines[0];
  if (lines.length !== 1 || !item) throw new ConflictError("原销售单明细与售后实物不一致，请核对库存编号、SN 和商品");
  const otherSale = state.salesInvoices.some((sale) => sale.id !== invoice.id && sale.accountingStatus !== "作废"
    && sale.items.some((item) => item.inventoryId ? item.inventoryId === card.id : Boolean(item.sn && item.sn === card.sn)));
  if (otherSale) throw new ConflictError("售后库存已有其他销售单关联，请先核对后续业务");
  const allowed = phase === "create" ? ["已售出"] : ["售后中", "维修中"];
  if (!allowed.includes(card.status)) throw new ConflictError(`库存状态为${card.status}，不能${phase === "create" ? "登记" : "结案"}售后`);
  return {invoice, card, item, partnerId};
}

export function assertAftersalesIdentityUnchanged(record: AftersalesRecord, updated: Partial<AftersalesRecord>) {
  const immutable = ["id", "salesInvoiceNo", "inventoryNo", "sn", "customerId", "type", "createTime",
    "accountingStatus", "accountingEventId", "repairPaymentOutId", "refundPaymentOutId"] as const;
  for (const key of immutable) {
    if (updated[key] !== undefined && updated[key] !== record[key]) throw new ConflictError("售后原单、实物和账务关联不能直接修改");
  }
}
