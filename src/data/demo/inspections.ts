/**
 * Seed data for the demo store, kept by domain so the bootstrap contract
 * can stay stable while each dataset remains independently maintainable.
 */
import type {InspectionRecord} from "../../types";

export const initialInspections: InspectionRecord[] = [
  {
    id: "JC-001",
    inventoryId: "KC-20260501-001",
    sn: "SN4090STRX8829A",
    inspector: "老默(质检组长)",
    inspectTime: "2026-05-01 14:22",
    exteriorCheck: "完美无瑕",
    fanCheck: "静音顺畅",
    portsCheck: "全部正常",
    gpuzCheck: "核对一致",
    furmarkResult: "甜甜圈25分钟，核心温度 68℃，风扇转速 42%，无掉电无啸叫",
    threedMarkResult: "3DMark TimeSpy 压力测试 99.1% 通过",
    vramResult: "全显存测试通过",
    temperature: 68,
    wattage: 450,
    noise: "静音",
    repaired: false,
    hiddenDefects: false,
    resultStatus: "通过",
    remarks: "顶级成色，几乎没有灰尘，甚至塑料防撕贴纸完整"
  },
  {
    id: "JC-002",
    inventoryId: "KC-20260515-002",
    sn: "SN4090STRX2102W",
    inspector: "小刘(技术员)",
    inspectTime: "2026-05-16 10:15",
    exteriorCheck: "挡板生锈",
    fanCheck: "轻微异响",
    portsCheck: "部分接口无信号",
    gpuzCheck: "核对一致",
    furmarkResult: "甜甜圈15分钟，核心 78℃，热点瞬间达到102℃，风扇异常狂转",
    threedMarkResult: "压力测试不通过，闪退并且出现花屏故障",
    vramResult: "某显卡测试通道错误",
    temperature: 78,
    wattage: 420,
    noise: "噪音明显",
    repaired: true,
    hiddenDefects: true,
    resultStatus: "需要维修",
    remarks: "显存颗粒可能曾高温过热。有一个HDMI接口严重磨损没有视频反馈信号。需要送修。已由质检降级。"
  },
  {
    id: "JC-003",
    inventoryId: "KC-20260420-006",
    sn: "SN3080TURB6543K",
    inspector: "老默(质检组长)",
    inspectTime: "2026-04-21 16:30",
    exteriorCheck: "氧化发黄",
    fanCheck: "抖动偏摆",
    portsCheck: "全部正常",
    gpuzCheck: "核对一致",
    furmarkResult: "烤机30分钟，核心 81℃，涡轮风扇像直升机起飞，噪声巨大但能撑住",
    threedMarkResult: "压力测试 97.2% 通过，刚好压线",
    vramResult: "全显存测试通过",
    temperature: 81,
    wattage: 320,
    noise: "噪音明显",
    repaired: true,
    hiddenDefects: true,
    resultStatus: "降价入库",
    remarks: "有明显的黄油防渗油痕迹，核心阻值异常，已被清洗。判定是洗白矿卡转入瑕疵分类。"
  }
];
