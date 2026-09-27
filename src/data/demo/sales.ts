/**
 * Seed data for the demo store, kept by domain so the bootstrap contract
 * can stay stable while each dataset remains independently maintainable.
 */
import type {SalesInvoice} from "../../types";

export const initialSalesInvoices: SalesInvoice[] = [
  {
    id: "XS-20260529-001",
    invoiceNo: "XS-20260529-001",
    date: "2026-05-29",
    customerName: "徐小龙（极客发烧友）",
    contact: "13522198842",
    channel: "闲鱼",
    paymentMethod: "支付宝",
    isPaid: true,
    paidAmount: 8350,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    expressCompany: "顺丰速运",
    expressNo: "SF1482930219",
    aftersalesTerms: "店保半年",
    handleBy: "王小明",
    remarks: "极客买家，指明顺丰包邮，保半年，附带购买测试跑分包",
    totalCount: 1,
    totalCost: 7750,
    totalAmount: 8350,
    totalProfit: 600,
    items: [
      {
        inventoryId: "KC-20260529-007",
        productId: "SP-003",
        productName: "RTX 5080 影驰 金属大师 16G",
        sn: "SN5080MT2026A",
        condition: "99新",
        costPrice: 7750,
        sellPrice: 8350,
        profit: 600,
        aftersalesTerms: "店保半年",
        remarks: "极速寄出"
      }
    ]
  },
  {
    id: "XS-20260529-002",
    invoiceNo: "XS-20260529-002",
    date: "2026-05-29",
    customerName: "刘毅然",
    contact: "17744319021",
    channel: "微信私域",
    paymentMethod: "微信",
    isPaid: true,
    paidAmount: 8700,
    unpaidAmount: 0,
    needInvoice: true,
    freeShipping: false,
    aftersalesTerms: "店保三个月",
    handleBy: "王小明",
    remarks: "自提出货，开具增值税普通发票，加点税费2%",
    totalCount: 1,
    totalCost: 8100,
    totalAmount: 8700,
    totalProfit: 600,
    items: [
      {
        inventoryId: "KC-20260529-008",
        productId: "SP-002",
        productName: "RTX 4080 SUPER 七彩虹 火神 16G",
        sn: "SN88VULC0042G",
        condition: "95新",
        costPrice: 8100,
        sellPrice: 8700,
        profit: 600,
        aftersalesTerms: "店保三个月",
        remarks: "自提带箱说"
      }
    ]
  }
];
