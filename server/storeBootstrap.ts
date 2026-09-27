import {createHash} from "node:crypto";
import type {FinanceLedger, SystemUserAccount} from "../src/types.ts";
import {
  initialAftersales,
  initialCustomers,
  initialCrmFollowUps,
  initialCrmQuotes,
  initialCrmRequirements,
  initialInspections,
  initialInventory,
  initialLogs,
  initialMarketQuotes,
  initialProducts,
  initialPurchaseInvoices,
  initialSalesInvoices,
  initialVendors,
} from "../src/data/demoData.ts";
import {defaultPermissions, initialSystemUsers} from "../src/data/systemDefaults.ts";
import {DEFAULT_COMMISSION_RULES} from "../src/utils/commissionRules.ts";
import {hashPassword, isPasswordHash} from "./security.ts";
import {normalizeStateConditions, syncProductCurrentStock} from "./storeStateNormalization.ts";
import type {AppState} from "./store.ts";

export const initialFinanceLedger: FinanceLedger[] = [
  {
    id: "LS-20260529-001",
    time: "2026-05-29 11:20",
    relatedId: "XS-20260529-001",
    type: "销售收入",
    paymentWay: "微信",
    amount: 35500,
    operator: "店长 阿强",
    status: "已复核",
  },
  {
    id: "LS-20260529-002",
    time: "2026-05-29 10:45",
    relatedId: "JH-20260529-001",
    type: "进货支出",
    paymentWay: "对公账户",
    amount: -30500,
    operator: "店长 阿强",
    status: "已复核",
  },
  {
    id: "LS-20260529-003",
    time: "2026-05-29 14:15",
    type: "杂费支出",
    paymentWay: "门市现金",
    amount: -500,
    operator: "店员",
    status: "已复核",
  },
  {
    id: "LS-20260528-001",
    time: "2026-05-28 16:30",
    relatedId: "SH-20260528-001",
    type: "售后退款",
    paymentWay: "支付宝商机",
    amount: -3500,
    operator: "店长 阿强",
    status: "已复核",
  },
  {
    id: "LS-20260527-001",
    time: "2026-05-27 18:00",
    type: "员工提成",
    paymentWay: "银行卡",
    amount: -1200,
    operator: "店长 阿强",
    status: "未复核",
  },
];

const secureInitialUsersByEnvironment = new Map<string, SystemUserAccount[]>();

function secureInitialSystemUsers() {
  const configuredAdminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
  const production = process.env.NODE_ENV === "production";
  const cacheKey = createHash("sha256")
    .update(`${production ? "production" : "development"}:${configuredAdminPassword || "default"}`)
    .digest("hex");
  const cached = secureInitialUsersByEnvironment.get(cacheKey);
  if (cached) return structuredClone(cached);
  const secured = initialSystemUsers.map((user) => {
    const password = user.role === "老板" && configuredAdminPassword ? configuredAdminPassword : user.password;
    return {
      ...structuredClone(user),
      password: isPasswordHash(password || "") ? password || "" : hashPassword(password || ""),
      enabled: production && user.role !== "老板" ? false : user.enabled,
    };
  });
  secureInitialUsersByEnvironment.set(cacheKey, secured);
  return structuredClone(secured);
}

export function createInitialState(options: {includeCrmDemoData?: boolean; includeDemoData?: boolean} = {}): AppState {
  // CRM 演示链路只允许在显式的测试/演示场景注入。生产库初始化默认保持 CRM 为空，
  // 避免首次启动把固定 KH-/CRM- 示例记录写进真实门店数据。
  // 其他业务演示数据也必须在生产环境默认关闭；测试和本地开发仍然可以通过默认值继续使用
  // 完整演示状态，或显式传入 includeDemoData: true。
  const includeDemoData = options.includeDemoData ?? process.env.NODE_ENV !== "production";
  const includeCrmDemoData = includeDemoData && options.includeCrmDemoData !== false;
  const state: AppState = {
    products: structuredClone(initialProducts),
    inventory: structuredClone(initialInventory),
    inspections: structuredClone(initialInspections),
    purchaseInvoices: structuredClone(initialPurchaseInvoices),
    salesInvoices: structuredClone(initialSalesInvoices),
    marketQuotes: structuredClone(initialMarketQuotes),
    aftersales: structuredClone(initialAftersales),
    customers: structuredClone(initialCustomers),
    crmFollowUps: includeCrmDemoData ? structuredClone(initialCrmFollowUps) : [],
    crmRequirements: includeCrmDemoData ? structuredClone(initialCrmRequirements) : [],
    crmQuotes: includeCrmDemoData ? structuredClone(initialCrmQuotes) : [],
    vendors: structuredClone(initialVendors),
    logs: structuredClone(initialLogs),
    financeLedger: structuredClone(initialFinanceLedger),
    settlementAccounts: [
      {
        id: "SA-CASH-001",
        name: "门市现金",
        type: "现金",
        owner: "门店",
        platform: "线下现金",
        balance: 12000,
        availableBalance: 12000,
        frozenAmount: 0,
        enabled: true,
        allowNegative: true,
        remarks: "门店备用现金",
        lastChangeTime: "2026-05-29 10:00",
      },
      {
        id: "SA-WECHAT-001",
        name: "老板微信",
        type: "微信",
        owner: "老板",
        platform: "微信支付",
        balance: 68000,
        availableBalance: 68000,
        frozenAmount: 0,
        enabled: true,
        allowNegative: true,
        remarks: "主要销售收款账户",
        lastChangeTime: "2026-05-29 11:20",
      },
      {
        id: "SA-ALIPAY-001",
        name: "财务支付宝",
        type: "支付宝",
        owner: "财务",
        platform: "支付宝",
        balance: 35000,
        availableBalance: 35000,
        frozenAmount: 0,
        enabled: true,
        allowNegative: true,
        remarks: "采购付款常用账户",
        lastChangeTime: "2026-05-29 10:45",
      },
      {
        id: "SA-BANK-001",
        name: "对公银行卡",
        type: "银行卡",
        owner: "成都显卡一号店",
        platform: "工商银行",
        balance: 128000,
        availableBalance: 128000,
        frozenAmount: 0,
        enabled: true,
        allowNegative: true,
        remarks: "公司对公账户",
        lastChangeTime: "2026-05-28 16:30",
      },
    ],
    settlementLedger: [],
    paymentInRecords: [],
    paymentOutRecords: [],
    accountTransfers: [],
    assemblyOperations: [],
    returnOrders: [],
    customerOrders: [],
    purchaseCommissions: [],
    commissionRules: structuredClone(DEFAULT_COMMISSION_RULES),
    currentRole: "老板",
    customPermissions: structuredClone(defaultPermissions),
    systemUsers: secureInitialSystemUsers(),
    currentUserId: undefined,
  };
  if (!includeDemoData) {
    // 生产空库只保留账号、权限和佣金规则配置，不把任何商品、订单、客户、余额或流水
    // 当作真实业务数据写入 PostgreSQL。正式数据必须由用户通过业务流程创建。
    state.products = [];
    state.inventory = [];
    state.inspections = [];
    state.purchaseInvoices = [];
    state.salesInvoices = [];
    state.purchaseCommissions = [];
    state.marketQuotes = [];
    state.aftersales = [];
    state.customers = [];
    state.crmFollowUps = [];
    state.crmRequirements = [];
    state.crmQuotes = [];
    state.vendors = [];
    state.logs = [];
    state.financeLedger = [];
    state.settlementAccounts = [];
    state.settlementLedger = [];
    state.paymentInRecords = [];
    state.paymentOutRecords = [];
    state.accountTransfers = [];
    state.assemblyOperations = [];
    state.returnOrders = [];
    state.customerOrders = [];
  }
  normalizeStateConditions(state);
  syncProductCurrentStock(state);
  return state;
}
