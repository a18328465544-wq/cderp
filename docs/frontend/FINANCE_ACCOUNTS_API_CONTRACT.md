# Finance Accounts API Contract

## 页面与权限

- V2 路由：`/finance/accounts`
- 页面权限：`settlement_accounts`
- 账户流水权限：`settlement_ledger`
- 删除权限：`canDelete`，服务端同时执行 `requireDeletePermission`
- 本页不使用 `showCost` / `showProfit` 代替财务菜单权限。

## 读取账户

```http
GET /api/gpu_erp/finance/settlement-accounts?page={page}&pageSize=200
```

响应：

```text
FastAPI/Express Response
→ FinanceAccountListResponseDto
→ adaptFinanceAccountPage()
→ FinanceAccountCollection
→ FinanceAccountsPage
```

由于接口单页最多 200 条且没有筛选参数，Endpoint 会依照 `meta.total` 完整读取所有页；页面搜索、类型、状态、排序与分页仅作用于已完整加载的账户 Domain Model，不伪装为服务端筛选。

## 新增账户

```http
POST /api/gpu_erp/finance/settlement-account/create
```

`toFinanceAccountCreateRequest()` 与 V1 保持一致：

- `owner = 门店`
- `platform = 账户名称`
- `balance = 0`
- `availableBalance = 0`
- `frozenAmount = 0`
- `enabled = true`
- `allowNegative = true`

前端不提供虚假的期初余额录入。

## 实盘核对

```http
PATCH /api/gpu_erp/finance/settlement-account/:id/reconcile
Content-Type: application/json

{"actualBalance": number}
```

核对只记录 `actualBalance`、核对时间和核对人；不会改账面余额，也不会生成账户流水。

## 删除账户

```http
DELETE /api/gpu_erp/finance/settlement-account/:id
```

服务端会阻止删除已被账户流水、收付款、调拨、财务流水、采购/销售单据或退货单引用的账户。

## 账户最近流水

```http
GET /api/gpu_erp/finance/settlement-ledger?accountId={id}&page=1&pageSize=20
```

详情抽屉使用独立 Query Key；切换账户时不会复用上一条账户的流水内容。无 `settlement_ledger` 权限时不发请求，并明确显示权限受限状态。

## 错误处理

- `401`：清理前端会话并进入现有登录流程。
- `403`：保留页面内容并显示服务端权限错误。
- `400/409/500`：保留弹窗输入和页面筛选，由统一 `ApiError` 显示真实可修复信息。
