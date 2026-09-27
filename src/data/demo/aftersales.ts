/**
 * Seed data for the demo store, kept by domain so the bootstrap contract
 * can stay stable while each dataset remains independently maintainable.
 */
import type {AftersalesRecord} from "../../types";

export const initialAftersales: AftersalesRecord[] = [
  {
    id: "SH-001",
    salesInvoiceNo: "XS-20260410-010",
    customerName: "周维(拼客同行)",
    contact: "18922031120",
    inventoryNo: "KC-20260312-045",
    productName: "RTX 3080 七彩虹 战斧 10G",
    sn: "SN3080AX885102Q",
    type: "维修",
    desc: "开机5分钟显卡无故死机蓝屏，满载测试核心瞬间突破85度并触发断电保护",
    status: "已维修",
    repairCost: 150,
    refundAmount: 0,
    finalResult: "更换核心导热硅脂和原厂导热贴，并除尘。烤机不蓝屏，已原物退回，并额外质保1个月",
    createTime: "2026-05-18",
    remarks: "同行友情精修，店里承担硅脂成本"
  },
  {
    id: "SH-002",
    salesInvoiceNo: "XS-20260510-018",
    customerName: "陆大飞",
    contact: "13144820199",
    inventoryNo: "KC-20260502-044",
    productName: "RX 6800 XT 公版 16G",
    sn: "SN6800XTREF89A",
    type: "退货",
    desc: "买回家测试HDMI和DP接口啸叫明显，游戏里经常闪烁黑屏，要求退款",
    status: "已退款",
    repairCost: 0,
    refundAmount: 3200,
    finalResult: "确认是电源冲突导致的电平电感嘯叫，办理全额退款。卡重置入库检测并扣减销售绩效",
    createTime: "2026-05-26",
    remarks: "损失快递往返费35元"
  }
];
