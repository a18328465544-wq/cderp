# 资金调拨 API Contract

## 实际链路

| 能力 | 现有接口 | V2 适配 |
| --- | --- | --- |
| 读取调拨记录 | `GET /api/gpu_erp/finance/account-transfers` | `financeTransfersApi.listAll()` 读取权限范围内的 `data.accountTransfers` |
| 新增调拨 | `POST /api/gpu_erp/finance/account-transfer/create` | `toFinanceTransferRequest()` 输出现有字段 |
| 编辑调拨 | `PUT /api/gpu_erp/finance/account-transfer/:id` | 复用同一请求适配器 |
| 删除调拨 | `DELETE /api/gpu_erp/finance/account-transfer/:id` | 服务端反向修正账户余额和关联流水 |
| 账户候选 | `GET /api/gpu_erp/finance/settlement-accounts` | 仅在 `settlement_accounts` 权限允许时请求 |

## 请求字段

```ts
{
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  fee: number;
  receivedAmount: number; // amount - fee
  handler: string;
  time: string; // YYYY-MM-DD 12:00:00
  remarks?: string;
}
```

页面不提交账户名称、前端生成的流水号或任何前端状态字段。服务端负责生成调拨编号、解析账户名称，并原子生成转出/转入账户流水和手续费财务流水。

## 权限

- 页面与调拨集合：`account_transfer`
- 账户候选与余额：`settlement_accounts`
- 编辑：沿用会话 `canEditHistory`
- 删除：沿用会话 `canDelete`

没有账户权限时，页面仍可展示权限范围内的调拨记录，但不请求账户余额、禁用新增和账户筛选。

## 金额语义

转出账户扣除 `amount`，转入账户增加 `receivedAmount`，手续费为 `amount - receivedAmount`，并由后端写入财务流水。前端只做输入校验和展示，最终校验以服务端为准。
