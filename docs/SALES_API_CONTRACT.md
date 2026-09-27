# 销售模块 API Contract Map

本文件记录 Frontend V2 新建销售单纵向切片实际使用的后端契约。只描述现有接口，不修改 FastAPI、数据库或权限规则。

| 能力 | 方法与路径 | 请求参数/载荷 | 前端适配 | 权限 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 客户搜索 | `GET /api/gpu_erp/crm/accounts` | `page`、`pageSize`、`keyword` | `SalesCustomerDto -> SalesCustomerOption` | `crm` | 优先使用标准 CRM 主体；通过 `legacyCustomer`/`legacyVendor` 映射销售单所需 ID |
| 库存候选 | `GET /api/inventory/items` | `page`、`pageSize`、`keyword`、`activeOnly=true`、`includeSold=false`、排序参数 | `InventoryItemDto -> InventoryListItem -> SalesInventoryCandidate` | `inventory` | 页面只允许选择 `已入库`、`已上架`；真实 SN 在出库阶段绑定 |
| 收款账户 | `GET /api/gpu_erp/finance/settlement-accounts` | `page`、`pageSize` | `SalesSettlementAccountDto -> SalesSettlementAccountOption` | `settlement_accounts` | 仅启用账户可选择 |
| 新建销售单 | `POST /api/sales-invoices` | 销售单请求 DTO，含客户、支付、物流、售后和商品明细 | `SalesFormValues -> SalesCreateRequestDto`；响应 `data -> SalesInvoiceResult` | `sales_add` | 服务端生成单号、重算库存均价成本、金额和利润；创建后状态为待出库 |
| 销售单据列表兼容读取 | `GET /api/sales-invoices` | 无销售专用筛选参数 | 状态快照先经过 `SalesListStateResponseDto -> adaptSalesListState -> SalesListDataset`，页面仅消费 Domain Model | `sales_list` | 当前只支持前端 URL 筛选、排序和分页，页面明确标注兼容模式 |
| 销售出库池领域读取 | `GET /api/sales-invoices/outbound` | 无出库专用筛选参数 | `SalesListStateResponseDto -> adaptSalesOutboundState -> SalesOutboundDataset`；仅暴露待出库单和可售库存的最小字段 | `sales_outbound` | 前端核验仅用于即时反馈，服务端仍是库存匹配的最终权威 |
| 确认销售出库 | `POST /api/sales-invoices/:id/outbound` | `handler`、去重后的 `codes`、`manual`、可选 `remarks` | `SalesOutboundRequest -> toSalesOutboundRequestDto`；响应 `data -> SalesOutboundResult` | `sales_outbound`；手动模式额外要求 `canManualOutbound` | 服务端原子绑定物理库存、写入 SN/成本/利润、更新库存状态、销售单、提成和日志 |

## 页面字段与接口边界

- 销售渠道和支付方式沿用旧销售单已经存在的固定业务枚举；当前 FastAPI 没有独立的枚举读取接口，因此前端不把它们伪装成远程配置。
- 商品数量、销售金额、已收金额和欠款金额由 RHF 表单与纯计算函数展示；服务端仍是最终金额、库存和利润的权威来源。
- 当前销售创建接口没有折扣、运费、其他费用、税费、手续费或独立收款备注字段，页面不新增这些费用类型。销售备注会沿用既有 `remarks` 字段。
- 当前销售创建接口没有附件字段或上传契约，页面仅展示“接口待补充”说明，不上传或伪造附件数据。
- 当前没有独立销售单详情接口，本轮提交成功后只展示创建响应摘要，不虚构详情或编辑流程。
- 销售出库的扫码枪、粘贴和摄像头结果只形成前端核验状态；页面不会提前修改库存或声称已经绑定。点击确认后必须由既有出库接口重新核验全部销售行。
- 手动出库沿用现有高风险权限 `canManualOutbound`，且必须填写原因；前端隐藏/禁用只是交互保护，服务端中间件继续执行最终 403 校验。
- 待出库池的商品、客户、物流和金额来自销售出库领域快照；适配后的出库 Domain Model 不包含成本或利润字段。

## 响应与错误

- 列表接口使用 `{ data, meta: { page, pageSize, total } }`。
- 创建接口使用 `{ data, stateMerge, stateDelete }`，页面只消费 `data`，不把状态补丁当作页面领域模型。
- 错误统一读取 `{ error: { code, message } }`，401/403 由 API Client 转成标准 `ApiError`。
- 库存不足、客户档案不存在、重复绑定等业务校验由服务端返回错误；前端保留表单输入并展示错误。
- 出库接口 409/400/403/500 不会清空扫码、备注或当前选择；401 会清理现有令牌并回到统一登录状态。
