import type { Express, Request, RequestHandler, Response } from "express";
import {
  aggregateProductLedgerRows,
  findSelectedLedgerCard,
  isInventoryCardLinkedToPurchase,
  ledgerItemMatchesSelectedInventoryCards,
} from "../productLedger.ts";
import type { AppState } from "../store.ts";
import type { CardInventory, ProductLedgerRow } from "../../src/types.ts";
import { matchesKeyword, normalizeSearchText } from "../../src/utils/search.ts";
import { createProductIdentityIndex, sameProductIdentity } from "../../src/utils/productIdentity.ts";
import { parseHttpDto, productLedgerListQueryDto } from "../httpDto.ts";
import type { z } from "zod";

type ProductLedgerDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  getState: () => AppState;
  permissionsForRequest: (req: Request) => { showCost?: boolean };
  ok: (data: unknown) => unknown;
};

type ProductLedgerQuery = z.output<typeof productLedgerListQueryDto>;

const normalizedText = (value?: string | number | null) => normalizeSearchText(value);

function inventoryProductKey(card: AppState["inventory"][number]) {
  return [
    card.category || "显卡",
    card.productName,
    card.brand,
    card.model,
    card.version,
    card.vram,
  ].join("::");
}

function productTemplateKey(product: AppState["products"][number]) {
  return [
    product.category || "显卡",
    product.name,
    product.brand,
    product.model,
    product.version,
    product.vram,
  ].join("::");
}

function buildProductLedger(state: AppState, canShowCost: boolean, query: ProductLedgerQuery) {
  const productSkuId = query.productSkuId;
  const page = query.page;
  const pageSize = query.pageSize;
  const documentNo = query.documentNo;
  const createdBy = query.createdBy;
  const documentType = query.documentType;
  const startDate = query.startDate;
  const endDate = query.endDate;

  const productIdentityIndex = createProductIdentityIndex(state.products || []);
  const selectedProduct = (state.products || []).find((product) =>
    product.id === productSkuId || productTemplateKey(product) === productSkuId,
  );

  const matchedCards = state.inventory.filter((card) =>
    inventoryProductKey(card) === productSkuId ||
    card.productId === productSkuId ||
    card.id === productSkuId ||
    Boolean(selectedProduct && sameProductIdentity(card, selectedProduct, productIdentityIndex)),
  );
  const snSet = new Set(matchedCards.map((card) => normalizedText(card.sn)).filter(Boolean));

  const itemMatches = (
    item: { productId?: string; inventoryId?: string; sn?: string; productName?: string; partName?: string; model?: string; brand?: string; version?: string; vram?: string },
    relatedDocumentNo?: string,
  ) => ledgerItemMatchesSelectedInventoryCards(item, matchedCards, relatedDocumentNo, productIdentityIndex);

  const cleanLedgerRemark = (value?: string | null) => {
    const text = String(value || "").trim();
    if (!text) return "";
    const parts = text
      .split(/[；;]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) =>
        !part.startsWith("进货单:") &&
        !part.startsWith("销售单:") &&
        !part.startsWith("快递单号:") &&
        !["显卡待检测入库", "其他配件待检测入库", "配件扫码确认入库"].includes(part),
      );
    return parts.join("；") || text;
  };
  const firstRemark = (...values: Array<string | undefined | null>) =>
    values.map(cleanLedgerRemark).find(Boolean) || "";
  const findLedgerCard = (
    item: { productId?: string; inventoryId?: string; sn?: string; productName?: string; partName?: string; model?: string; brand?: string; version?: string; vram?: string },
    documentNo?: string,
  ) => findSelectedLedgerCard(item, matchedCards, documentNo, productIdentityIndex);
  const getDocumentRemark = (invoice: { remarks?: string; outboundRemarks?: string; note?: string }, relatedCard?: CardInventory) =>
    firstRemark(invoice.remarks, invoice.outboundRemarks, invoice.note, relatedCard?.remarks);

  const rows: ProductLedgerRow[] = [];
  const pushRow = (row: ProductLedgerRow) => rows.push(row);

  state.purchaseInvoices.forEach((invoice) => {
    const currentDocumentNo = invoice.invoiceNo || invoice.id;
    invoice.items.filter((item) => itemMatches(item, currentDocumentNo)).forEach((item, index) => {
      const relatedCard = findLedgerCard(item, currentDocumentNo);
      const unitPrice = canShowCost ? Number(item.buyPrice || 0) : 0;
      pushRow({
        id: `purchase-${invoice.id}-${index}`,
        storeName: "主门店",
        operatedAt: invoice.date,
        documentType: "采购入库",
        documentNo: invoice.invoiceNo || invoice.id,
        operationType: "增加",
        customerName: "",
        supplierName: invoice.supplierName || "",
        quantity: 1,
        unitPrice,
        amount: unitPrice,
        createdBy: invoice.handleBy || invoice.paymentHandler || "",
        productRemarks: firstRemark(item.remarks, relatedCard?.remarks),
        documentRemarks: getDocumentRemark(invoice, relatedCard),
      });
    });
  });

  state.salesInvoices.forEach((invoice) => {
    const currentDocumentNo = invoice.invoiceNo || invoice.id;
    invoice.items.filter((item) => itemMatches(item, currentDocumentNo)).forEach((item, index) => {
      const relatedCard = findLedgerCard(item, currentDocumentNo);
      const unitPrice = Number(item.sellPrice || 0);
      pushRow({
        id: `sales-${invoice.id}-${index}`,
        storeName: "主门店",
        operatedAt: invoice.outboundTime || invoice.date,
        documentType: "销售出库",
        documentNo: invoice.invoiceNo || invoice.id,
        operationType: "减少",
        customerName: invoice.customerName || "",
        supplierName: "",
        quantity: -1,
        unitPrice,
        amount: -unitPrice,
        createdBy: invoice.outboundHandler || invoice.handleBy || invoice.paymentHandler || "",
        productRemarks: firstRemark(item.remarks, relatedCard?.remarks, item.aftersalesTerms),
        documentRemarks: getDocumentRemark(invoice, relatedCard),
      });
    });
  });

  state.returnOrders.filter((order) => order.status === "已完成").forEach((order) => {
    const matches = itemMatches({
      productId: order.productId,
      inventoryId: order.sourceInventoryId,
      sn: order.sn,
      productName: order.productName,
    }, order.relatedDocNo || order.returnNo || order.id);
    if (!matches) return;
    const isSalesReturn = order.type === "销售退货";
    pushRow({
      id: `return-${order.id}`,
      storeName: "主门店",
      operatedAt: order.completedAt || order.date,
      documentType: order.type,
      documentNo: order.returnNo || order.id,
      operationType: isSalesReturn ? "增加" : "减少",
      customerName: order.partyType === "customer" || isSalesReturn ? order.partyName || "" : "",
      supplierName: order.partyType === "vendor" || !isSalesReturn ? order.partyName || "" : "",
      quantity: isSalesReturn ? 1 : -1,
      unitPrice: Number(order.amount || 0),
      amount: isSalesReturn ? Number(order.amount || 0) : -Number(order.amount || 0),
      createdBy: order.handler || "",
      productRemarks: order.reason || "",
      documentRemarks: order.remarks || "",
    });
  });

  state.assemblyOperations.forEach((operation) => {
    const time = operation.time;
    if (operation.type === "拆卸" && operation.beforeSn && snSet.has(normalizedText(operation.beforeSn))) {
      pushRow({
        id: `assembly-before-${operation.id}`,
        storeName: "主门店",
        operatedAt: time,
        documentType: "组装拆卸",
        documentNo: operation.id,
        operationType: "减少",
        customerName: "",
        supplierName: "",
        quantity: -1,
        unitPrice: 0,
        amount: 0,
        createdBy: operation.handler,
        productRemarks: operation.beforeProductName || "",
        documentRemarks: operation.remarks || "",
      });
    }
    operation.afterParts.filter((part) => itemMatches(part, operation.id)).forEach((part, index) => {
      const unitPrice = canShowCost ? Number(part.costPrice || 0) : 0;
      pushRow({
        id: `assembly-after-${operation.id}-${index}`,
        storeName: "主门店",
        operatedAt: time,
        documentType: "组装拆卸",
        documentNo: operation.id,
        operationType: operation.type === "拆卸" ? "增加" : "减少",
        customerName: "",
        supplierName: "",
        quantity: operation.type === "拆卸" ? 1 : -1,
        unitPrice,
        amount: operation.type === "拆卸" ? unitPrice : -unitPrice,
        createdBy: operation.handler,
        productRemarks: part.remarks || "",
        documentRemarks: operation.remarks || "",
      });
    });
    if (operation.type === "组装" && operation.afterSn && snSet.has(normalizedText(operation.afterSn))) {
      pushRow({
        id: `assembly-product-${operation.id}`,
        storeName: "主门店",
        operatedAt: time,
        documentType: "组装拆卸",
        documentNo: operation.id,
        operationType: "增加",
        customerName: "",
        supplierName: "",
        quantity: 1,
        unitPrice: 0,
        amount: 0,
        createdBy: operation.handler,
        productRemarks: operation.afterProductName || "",
        documentRemarks: operation.remarks || "",
      });
    }
  });

  const purchaseDocumentNos = new Set(
    state.purchaseInvoices.flatMap((invoice) => [invoice.invoiceNo, invoice.id]).filter(Boolean),
  );
  matchedCards
    .filter((card) => !isInventoryCardLinkedToPurchase(card, purchaseDocumentNos))
    .forEach((card) => {
      const unitPrice = canShowCost ? Number(card.costPrice || 0) : 0;
      pushRow({
        id: `inventory-${card.id}`,
        storeName: "主门店",
        operatedAt: card.entryTime,
        documentType: "其他入库",
        documentNo: card.id,
        operationType: "增加",
        customerName: "",
        supplierName: card.supplierName || "",
        quantity: 1,
        unitPrice,
        amount: unitPrice,
        createdBy: card.purchaseHandler || "",
        productRemarks: firstRemark(card.remarks),
        documentRemarks: firstRemark(card.remarks),
      });
    });

  const filtered = aggregateProductLedgerRows(rows)
    .filter((row) => matchesKeyword(row.documentNo, documentNo))
    .filter((row) => matchesKeyword(row.createdBy, createdBy))
    .filter((row) => !documentType || documentType === "全部类型" || row.documentType === documentType)
    .filter((row) => !startDate || String(row.operatedAt || "").slice(0, 10) >= startDate)
    .filter((row) => !endDate || String(row.operatedAt || "").slice(0, 10) <= endDate)
    .sort((a, b) => String(b.operatedAt || "").localeCompare(String(a.operatedAt || "")) || b.id.localeCompare(a.id));

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    rows: filtered.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

export function registerProductLedgerRoutes(app: Express, dependencies: ProductLedgerDependencies) {
  app.get("/api/inventory/product-ledger", dependencies.requireMenu("inventory"), (req, res: Response) => {
    const permissions = dependencies.permissionsForRequest(req);
    const query = parseHttpDto(productLedgerListQueryDto, req.query);
    res.json(dependencies.ok(buildProductLedger(dependencies.getState(), Boolean(permissions.showCost), query)));
  });
}
