/**
 * Seed data for the demo store, kept by domain so the bootstrap contract
 * can stay stable while each dataset remains independently maintainable.
 */
import type {AuditLog} from "../../types";

export const initialLogs: AuditLog[] = [
  {
    id: "L-001",
    user: "王小明 (店员)",
    time: "2026-05-29 16:11",
    module: "销售管理",
    type: "销售出库",
    target: "XS-20260529-001",
    beforeVal: "库存: 已上架",
    afterVal: "库存: 已售出, 销售价 8350"
  },
  {
    id: "L-002",
    user: "老默 (质检组长)",
    time: "2026-05-28 15:40",
    module: "质检管理",
    type: "质检通过",
    target: "KC-20260528-003",
    beforeVal: "待检测",
    afterVal: "质检通过, 进入[已入库]备货区"
  },
  {
    id: "L-003",
    user: "张经理 (老板)",
    time: "2026-05-28 11:20",
    module: "商品库",
    type: "修改回收参考价",
    target: "RTX 4090 华硕 ROG 猛禽 24G",
    beforeVal: "参考回收价: 18200",
    afterVal: "参考回收价: 18000"
  },
  {
    id: "L-004",
    user: "王小明 (店员)",
    time: "2026-05-27 10:11",
    module: "采购管理",
    type: "提交进货单",
    target: "JH-20260527005",
    beforeVal: "草稿",
    afterVal: "已入库入档, SN: SN5080MT2026A"
  }
];
