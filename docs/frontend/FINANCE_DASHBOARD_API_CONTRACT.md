# Finance Dashboard API Contract

## 读取链路

```text
GET /api/finance/dashboard
  → FinanceDashboardResponseDto
  → adaptFinanceDashboardDataset(access)
  → FinanceDashboardDataset
  → buildFinanceDashboard(range, today)
  → FinanceDashboardPage
```

当前后端没有资金驾驶舱专用接口。V2 只调用现有全量状态接口一次，并在 Adapter 边界立即投影成最小财务领域模型；页面不读取原始 state DTO。

## 权限

| 能力 | 现有权限来源 | V2 行为 |
| --- | --- | --- |
| 进入驾驶舱 | `finance` + `showProfit` | 沿用 V1 门槛 |
| 账户余额 | `settlement_accounts` | 无权限时显示“不可用”，不显示 0 |
| 收支趋势与事件 | `settlement_ledger` | 无权限时不构造趋势或近期事件 |
| 资金周转 | `showCost` | 无权限时不读取成本字段、不计算周转 |
| 毛利 | `showProfit` | Adapter 才保留利润字段 |
| 退货待结算 | 现有退货/对账菜单 | 无权限时不读取退货集合 |

服务端 `publicState` 仍是最终权限裁剪边界；前端 Adapter 的二次裁剪用于避免组件误消费，不替代服务端安全。

## 计算口径

- 当前可用资金：启用账户 `availableBalance` 合计。
- 今日收入/支出：账户流水按门店日期汇总。
- 应收/应付：未退款销售欠款、采购未付款合计。
- 健康度：沿用 V1 的资金、待复核、账户差额、退货、应收与应付扣分规则。
- 资金周转：本期实际出库成本 ÷ 平均占用资金；缺少每日库存快照时为估算值。
- 日期范围：URL `start` / `end`，最多 366 天。

资金驾驶舱本轮只读，不新增记账或对账写接口。页面操作只导航到既有财务子路由。
