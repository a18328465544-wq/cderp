# Purchase API Contract（Frontend V2 Phase 2）

本文件记录当前前端对既有 API 的消费边界。Phase 1 只建立 DTO、Adapter、表单模型和金额语义，不修改服务端。

## 现有接口

| 能力 | 方法与路径 | 权限 | 前端边界 |
| --- | --- | --- | --- |
| 采购参考数据 | `GET /api/purchase-invoices/reference` | 由服务端会话/菜单控制 | `PurchaseReferenceStateResponseDto` → `adaptPurchaseReferenceData`，只向采购域暴露商品、来源、账户和观察到的库位 |
| 采购列表 | `GET /api/purchase-invoices` | `purchase_list` | `PurchaseListStateResponseDto` → `adaptPurchaseListState`，只暴露采购列表领域模型 |
| 采购详情 | `GET /api/purchase-invoices/detail?id=:id` | `purchase_list` | 详情领域快照在 Adapter 中按 ID 投影并裁剪成本/利润字段 |
| 创建采购单 | `POST /api/purchase-invoices` | `purchase_add` | `PurchaseFormValues` → `toPurchaseRequestDto` → `PurchaseCreateRequestDto` |
| 编辑采购单 | `PUT /api/purchase-invoices/:id` | `purchase_list` | Phase 3 适配，Phase 1 不调用 |
| 结算账户 | `GET /api/gpu_erp/finance/settlement-accounts?page=1&pageSize=100` | `settlement_accounts` | 当前采购参考数据沿用状态快照；独立账户查询留在后续 API Gap |
| 快速新增客户 | `POST /api/customers` | `customers` | 采购专用 RHF/Zod 模型 → Customer DTO Adapter；成功后精确更新采购来源候选并自动选中 |
| 快速新增供应商 | `POST /api/vendors` | `vendors` | 采购专用 RHF/Zod 模型 → Vendor DTO Adapter；保留同行类型和后续供应商抵扣语义 |
| 快速新增商品模板 | `POST /api/products` | `products` | 采购专用 RHF/Zod 模型 → Product Template DTO Adapter；成功后只回填当前明细的模板字段 |

## 数据流

```text
FastAPI response
  -> Purchase DTO
  -> Purchase Adapter
  -> Purchase domain/reference model
  -> Feature / component

React Hook Form model
  -> Request Adapter
  -> Purchase request DTO
  -> POST /api/purchase-invoices
```

快速新增实体不进入采购 Request：

```text
Quick-create form model
  -> Entity DTO Adapter
  -> POST /api/customers | /api/vendors | /api/products
  -> Entity response DTO
  -> Purchase domain adapter
  -> precise purchase.referenceData cache update
  -> auto-select in the current purchase form
```

## 创建请求语义

- 明细行的 `quantity` 是编辑态数量；Request Adapter 将数量为 `n` 的行展开成 `n` 条物理库存明细，每条 `quantity: 1`。
- 不在采购创建阶段生成 SN 或虚构库存 ID；SN、成色、质保、最终库位和库存状态由检测质检阶段确认。
- 现有创建 API 仍要求部分检测字段；Request Adapter 只发送“待检测”中性兼容值，不采信采购表单内的物理商品状态。
- `paidAmount` 只代表现金付款，只有 `paidAmount > 0` 时才带 `settlementAccountId`。
- `vendorCreditAppliedAmount` 单独传输，不能并入现金付款，也不会在前端生成现金流水。
- `unpaidAmount`、`isPaid` 和 `paymentStatus` 由统一金额工具根据总成本、现金付款和供应商抵扣推导；后端仍是最终权威。
- 图片字段沿用现有媒体链路：Phase 3B 先以 `purchase_draft + purchase-evidence` 预上传，表单只保存返回的 `/api/media/assets/:id` URL；提交时由 Request Adapter 原样发送，服务端再绑定到正式采购单。

## 错误边界

`apiRequest` 统一转换 401、403、409、422/400、500 和网络错误为 `ApiError`。采购页面后续阶段必须保留表单内容处理错误，不得用本地默认值覆盖服务端结果。

## Phase 2 页面边界

- `NewPurchaseOrderPage` 只调用 `purchaseApi.referenceData` 与 `purchaseApi.create`，页面不直接调用 `fetch` 或解析原始快照。
- 来源类型切换由 `purchaseSourceTypeOptions` 决定客户/供应商候选，并清空上一次的 `sourcePartnerId`、联系人和供应商抵扣；未选择来源不能提交。
- 商品明细由 React Hook Form `useFieldArray` 管理；采购页只编辑商品、数量、价格和备注。数量为 1、2、5 等编辑态值，提交前由 Adapter 展开为每行 `quantity: 1`，不生成 SN 或库存 ID。
- 现金付款、供应商余额抵扣、未付款由 `calculatePurchaseSettlement` 独立计算；抵扣只写入 `vendorCreditAppliedAmount`，不创建现金流水。
- 创建成功后只失效采购、库存和采购参考数据缓存；若实际响应包含显卡且拥有 `inspections` 权限，跳转检测流程，否则回到采购单据列表。
- 批量粘贴已在 Phase 3A 接入，图片上传已在 Phase 3B 接入；采购编辑仍保持在后续 Phase，不在本页面伪造交互。

## Phase 3C 快速新增边界

- 客户沿用 V1 字段：`name`、`contact`、`type: 个人买家客户`、`firstChannel`、`remarks`、`tags: [个人客户]`。
- 供应商沿用 V1 字段：`name`、`contact`、`partnerCategory: 同行`、`type`、`remarks`。
- 商品模板沿用 V1 确定性名称规则：`brand + model + version + vram`；版本和显存为空时请求字段使用 `-`，不伪造业务数据。
- 商品创建成功后只更新当前明细的 `productId/productName/category/model/brand/version/vram`，空的参考价格才按既有选择商品语义补齐；`showCost/showProfit` 分别裁剪参考回收价/销售价；数量、已输入价格、备注、来源和付款字段保持不变。
- 快速新增弹窗不直接消费原始 DTO，不调用完整状态刷新，不写入 Zustand；403、409、400 均保留弹窗输入和采购主表单。

## Phase 3B 图片边界

- 预上传使用 `POST /api/media`，请求实体为 `purchase_draft`，关系用途为 `purchase-evidence`；同一关系是替换语义，前端通过串行队列携带完整已上传 URL 集合。
- 页面实例生成稳定 `purchaseDraftId`，不写入 Zustand、localStorage 或采购 Request DTO；页面刷新恢复草稿不在本轮范围。
- `File`、`Blob`、Data URL 和压缩二进制只存在于采购媒体 Hook 的瞬时状态，`PurchaseFormValues.images` 只接收真实媒体 URL。
- 采购提交失败时保留图片和表单；上传中或失败时不允许提交；单张失败可以单独重试。
- 后端没有媒体删除或草稿迁移接口，删除已上传图片通过剩余 URL 替换关系，潜在孤儿媒体记录见 `PURCHASE_API_GAP.md`。
