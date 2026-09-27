/**
 * Seed data for the demo store, kept by domain so the bootstrap contract
 * can stay stable while each dataset remains independently maintainable.
 */
import type {MarketQuote} from "../../types";

export const initialMarketQuotes: MarketQuote[] = [
  {
    id: "Q-001",
    date: "2026-05-29",
    productId: "SP-001",
    productName: "RTX 4090 华硕 ROG 猛禽 24G",
    model: "RTX 4090",
    brand: "华硕",
    version: "ROG 猛禽",
    yestBuyPrice: 18000,
    todayBuyPrice: 17800,
    todaySellPrice: 19100,
    maxPrice: 19600,
    minPrice: 17500,
    changeAmount: -200,
    changeRatio: -1.11,
    remarks: "新显卡泄露影响，超高端4090价格近日小幅下跌200，建议加快库存周转"
  },
  {
    id: "Q-002",
    date: "2026-05-29",
    productId: "SP-002",
    productName: "RTX 4080 SUPER 七彩虹 火神 16G",
    model: "RTX 4080 SUPER",
    brand: "七彩虹",
    version: "iGame Vulcan 火神",
    yestBuyPrice: 8200,
    todayBuyPrice: 8220,
    todaySellPrice: 8850,
    maxPrice: 8999,
    minPrice: 8150,
    changeAmount: 20,
    changeRatio: 0.24,
    remarks: "波动不大，火神热度比较稳定，价格抗压"
  },
  {
    id: "Q-003",
    date: "2026-05-29",
    productId: "SP-003",
    productName: "RTX 5080 影驰 金属大师 16G",
    model: "RTX 5080",
    brand: "影驰",
    version: "金属大师",
    yestBuyPrice: 7800,
    todayBuyPrice: 7600,
    todaySellPrice: 8200,
    maxPrice: 8550,
    minPrice: 7500,
    changeAmount: -200,
    changeRatio: -2.56,
    remarks: "5080系列由于货源供应恢复，溢价大幅回落，今日回收行情直降200"
  },
  {
    id: "Q-004",
    date: "2026-05-29",
    productId: "SP-004",
    productName: "RTX 4070 Ti SUPER 微星 魔龙 16G",
    model: "RTX 4070 Ti SUPER",
    brand: "微星",
    version: "Gaming X Slim 魔龙",
    yestBuyPrice: 6100,
    todayBuyPrice: 6180,
    todaySellPrice: 6850,
    maxPrice: 6950,
    minPrice: 6050,
    changeAmount: 80,
    changeRatio: 1.31,
    remarks: "网吧装机采购热，拿货量上升引起价格小幅上涨80"
  }
];
