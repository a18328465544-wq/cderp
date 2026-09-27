/**
 * Seed data for the demo store, kept by domain so the bootstrap contract
 * can stay stable while each dataset remains independently maintainable.
 */
import type {Vendor} from "../../types";

export const initialVendors: Vendor[] = [
  {
    id: "GY-001",
    name: "飞跃硬件批发部",
    partnerCategory: "同行",
    contactPerson: "飞哥",
    phone: "13800293110",
    type: "上游供应商",
    totalBuyAmount: 320000,
    totalCount: 24,
    avgProfit: 850,
    aftersalesCount: 2,
    aftersalesRate: 8.3,
    lastDealTime: "2026-05-29",
    accountPayable: 18000,
    accountPaid: 302000,
    remarks: "主要货源供应商，质量有保证，可以走账期周结"
  },
  {
    id: "GY-002",
    name: "宏达电竞设备回收",
    partnerCategory: "同行",
    contactPerson: "周老板",
    phone: "13911048821",
    type: "上游供应商",
    totalBuyAmount: 145000,
    totalCount: 18,
    avgProfit: 450,
    aftersalesCount: 4,
    aftersalesRate: 22.2, // Mining cards has high failures
    lastDealTime: "2026-05-28",
    accountPayable: 0,
    accountPaid: 145000,
    remarks: "经常有批量矿包出货，价格极香核心低阻，但是售后率较高，质保极度简短"
  },
  {
    id: "GY-003",
    name: "闲鱼黄牛团伙-小胖",
    partnerCategory: "同行",
    contactPerson: "江小胖",
    phone: "15549022312",
    type: "下游采购方",
    totalBuyAmount: 68000,
    totalCount: 4,
    avgProfit: 1200,
    aftersalesCount: 0,
    aftersalesRate: 0,
    lastDealTime: "2026-05-12",
    accountPayable: 0,
    accountPaid: 68000,
    remarks: "抢官方首发新卡货源，能拿到第一手没拆封的高端货，但利润率被黄牛压缩"
  }
];
