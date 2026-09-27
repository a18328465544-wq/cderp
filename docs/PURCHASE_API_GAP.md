# Purchase API Gap（Frontend V2 Phase 2）

以下是对当前接口能力的记录，不代表本轮要修改后端。

| 缺口 | 当前事实 | 前端兼容方式 | 后续建议 |
| --- | --- | --- | --- |
| 采购列表/详情仍是领域快照而非 SQL 分页 | 列表使用 `/api/purchase-invoices`，详情使用 `/api/purchase-invoices/detail?id=...`，创建响应有 `data/stateMerge` | V2 在 API 边界把领域快照转换为最小 Domain Model；列表明确采用前端筛选、排序和分页 | 将列表与详情改为参数化 SQL 查询，避免采购与库存增长后整集合传输 |
| 供应商搜索接口缺失 | 供应商候选来自状态快照 | `adaptPurchaseReferenceData` 只提取采购需要的最小字段 | 数据量增大后提供带权限的供应商搜索/分页接口 |
| 仓库目录接口缺失 | 状态快照中只能观察到库存已有 `warehouseLocation` | 仅生成去重后的观察库位；标记 `hasWarehouseEndpoint: false` | 增加仓库字典接口，避免把库存快照当作权威字典 |
| 结算账户参考数据有两种来源 | 独立 Endpoint 存在，但采购参考数据当前仍沿用状态快照 | 通过 `canReadSettlementAccounts` 裁剪；页面未在 Phase 1 接入 | Phase 2 统一调用独立账户 Endpoint，并保留 403 降级 |
| 新建页没有服务端单号预留接口 | 服务端只在 `POST /api/purchase-invoices` 的原子写入中按当日最大序号生成最终单号，且忽略客户端单号 | V2 从页面加载时的采购快照投影并显示下一单号；提交仍以服务端返回的最终单号为准，并发开单时服务端可顺延 | 后续提供只读预览或带过期机制的单号预留契约；在此之前前端不得把预生成号宣称为已占用 |
| 权限响应没有采购专用结构 | 当前由 `allowedMenus`、`showCost`、`showProfit` 和 `settlement_accounts` 等权限组合 | Adapter 接收显式 `PurchaseReferencePermissions`，不猜字段 | 后续若后端提供字段级采购能力，可在 Auth Adapter 中统一映射 |
| 轻量登录状态不返回角色权限模板 | 普通账号的 `/api/auth/login` 与 `/api/state?mode=initial` 可能裁掉 `customPermissions`，但账号仍返回角色和 `permissionOverrides` | V2 Auth Adapter 以本地角色默认权限作为保守兜底，并优先应用服务端返回的账号覆盖项；老板仍强制完整权限 | 后端应在认证响应中返回最终生效权限快照，尤其是自定义角色，避免前端维护默认权限副本 |
| 创建响应的状态补丁不是采购 Domain Model | `stateMerge/stateDelete` 可能存在，且服务端还会持久化媒体 | Adapter 只返回已适配单据，并保留补丁供 Query 失效/同步 | Phase 2 创建成功后按现有 Query 策略失效状态缓存 |
| 图片上传与采购提交的时序需在页面阶段确认 | 服务端会剥离 `images/imageUrls` 并写入 SQL 媒体 | Phase 1 只保留 DTO 可选字段，不显示假上传成功 | Phase 3 复用统一压缩/媒体组件，验证失败保留表单 |
| `/api/purchase-invoices/reference` 是采购参考数据聚合接口 | 商品、客户、供应商、账户和观察库位一次返回，可能包含页面不需要的集合 | `PurchaseReferencePermissions` 在 Adapter 内只暴露采购最小 Domain Model；前端不把原始快照写入表单或 Zustand | 数据量增大后拆分商品/客户/供应商/账户搜索接口，并在服务端按字段权限裁剪响应 |
| 商品读取权限没有独立后端字段 | 当前权限仍由 `allowedMenus` 组合推导 `products`，成本/利润由 `showCost/showProfit` 控制 | 页面无 `products` 菜单时不展示商品候选；Adapter 支持 `canReadProducts: false` | 后端提供字段级采购参考权限，尤其确保未授权用户不会在原始 state 响应中看到成本/利润 |
| 结算账户仍随采购参考快照读取 | Phase 2 没有复制账户查询逻辑，沿用 `purchaseApi.referenceData` 的最小账户投影 | 无 `settlement_accounts` 时隐藏账户候选并阻止现金付款提交；409/403 保留表单 | 接入独立结算账户 Endpoint，增加账户余额实时校验和更细粒度错误码 |
| 仓库目录仍不是权威数据源 | 只能从库存行去重得到已有 `warehouseLocation`，采购创建后端会按品类决定待检测区 | 采购页不再让用户选择最终库位；只由 Request Adapter 发送待检测兼容值，真实库位在检测质检阶段确认 | 提供仓库/检测区目录接口和权限，供检测质检页使用 |
| 采购创建 DTO 仍要求检测质检字段 | 现有 `POST /api/purchase-invoices` 明细仍包含 `sn/condition/inWarranty/warrantyDate/repaired/gpuRisk/fullBox/warehouseLocation`，但这些数据的业务权威阶段实际为检测质检 | 采购页不再展示或粘贴这些字段；`toPurchaseRequestDto()` 强制发送空 SN、待检测区和其他中性兼容值，后续由检测提交覆盖 | 后端将这些字段在采购创建 DTO 中改为可选，并在服务端统一创建“待检测”状态，避免前端发送占位值 |
| 当前成本录入权限未单独返回 | 服务端采购创建路由只要求 `purchase_add`；`showCost` 主要用于历史成本、参考成本和利润数据裁剪，没有阻止本次采购价录入 | Phase 3A 沿用 Phase 2 的手工录入语义：具备 `purchase_add` 即可录入本单采购价；`showCost` 仍只裁剪参考/历史成本字段 | 后端未来若增加字段级“录入采购价”权限，再由 Auth Adapter 映射，届时不在页面内猜测 |

## Phase 3B 媒体绑定事实

| 缺口 | 当前事实 | 前端兼容方式 | 后续建议 |
| --- | --- | --- | --- |
| 没有草稿转正式采购单迁移接口 | `/api/media` 接受通用 `entityType/entityId/relationRole`，但后端不会识别 `purchase_draft` 的特殊语义；`POST /api/purchase-invoices` 只按请求中的 `images/imageUrls` URL 在生成正式采购单后重新建立 `purchase_invoice/purchase-evidence` 关系 | 页面生命周期内使用 `purchase_draft + purchase-evidence` 预上传；Purchase Form 只保存 `/api/media/assets/:id` URL；最终由 `toPurchaseRequestDto()` 发送 URL，不发送 `draftId` | 后端未来可提供草稿关系迁移或媒体清理接口，但本轮不修改后端 |
| 媒体接口是替换关系而非追加关系 | 每次 `POST /api/media` 会按完整 `images` 列表替换同一实体和用途的关系 | V2 对同一 draft 串行上传，每次带上已成功 URL 与新压缩图片，避免多图互相覆盖 | 后端可增加追加/删除语义或幂等上传接口 |
| 没有媒体删除接口 | 当前只能通过 `POST /api/media` 以剩余 URL 替换关系；媒体资产本体可能保留 | 删除时从 Purchase Form 移除 URL，并尽力同步 draft 剩余关系；不实现媒体垃圾回收 | 增加受权限保护的媒体删除与孤儿资产清理任务 |
| 没有图片分类字段 | 后端只有 `relationRole`，采购提交固定使用 `purchase-evidence`，不存在 `category/purpose` 独立字段 | V2 使用“采购凭证与商品图片”统一区域和 `purchase-evidence` 用途，不伪造商品图片分类 | 后端若需要区分凭证和商品图，应增加稳定的关系用途契约 |
| 媒体接口没有独立权限 | `/api/media` 与 `/api/media/assets/:id` 复用菜单权限，其中采购使用 `purchase_add` | 页面沿用采购开单权限；403 只显示图片区域错误并保留其余表单 | 后端未来可提供字段级媒体权限 |
| 正式采购保存失败可能留下 draft 媒体 | 图片预上传和采购状态保存不是同一跨资源事务 | 采购提交失败保留 draft ID、URL 和预览，不重新上传；创建成功后仅尽力清理 draft 关系 | 后端可提供事务化媒体绑定或定期孤儿清理 |
| 媒体资源读取需要鉴权 | `/api/media/assets/:id` 返回私有缓存资源，普通 `<img>` 请求不会自动带 Authorization | 新建页预览使用本地 Blob URL；媒体 URL 仅作为表单引用，刷新恢复不在本轮范围 | 增加带鉴权的图片代理或统一媒体预览 Hook |

## Phase 3C 快速新增实体事实

| 能力 / 缺口 | 当前事实 | 前端兼容方式 | 后续建议 |
| --- | --- | --- | --- |
| 采购内快速新增客户 | `POST /api/customers` 真实存在，仅要求 `customers` 菜单；成功响应为 `{data,stateMerge,stateDelete}`，服务端校验联系方式和无联系方式同名重复 | `partnersApi.createCustomer` 通过 DTO/Adapter 发送 V1 一致字段；成功后精确插入 `purchase.referenceData` 缓存并自动选中，失败保留弹窗与主表单 | 未来提供客户分页搜索接口，避免采购参考数据依赖采购领域快照 |
| 采购内快速新增供应商 | `POST /api/vendors` 真实存在，仅要求 `vendors` 菜单；联系方式或无联系方式同名重复会映射为 409 | `partnersApi.createVendor` 发送 `partnerCategory/type` 等真实字段；不重载完整状态，供应商余额由返回实体适配后进入当前采购表单 | 未来提供供应商候选分页和余额实时查询接口 |
| 采购内快速新增商品模板 | `POST /api/products` 真实存在，仅要求 `products` 菜单；当前服务端没有按品牌/型号/版本/规格的身份去重约束，创建响应返回新模板与状态补丁 | `productsApi.createTemplate` 通过独立 DTO/Adapter 创建；成功后精确更新商品候选并只带入模板字段，不覆盖当前行数量、价格、库位和备注 | 后端补充商品身份唯一约束或明确允许重复模板的规则，避免目录长期出现同义重复 |
| 商品模板字段级权限 | 商品创建路由只检查 `products`，没有单独的参考成本/售价字段权限 | V2 不用 `showCost/showProfit` 阻止采购员创建模板；两项权限只控制参考价字段的展示、适配和请求脱敏，采购员仍可完成模板创建 | 后端如增加字段级成本/售价权限，再由 Auth Adapter 统一映射，不能在页面猜测 |
| 商品参考价格未按账号权限裁剪 | `/api/purchase-invoices/reference` 和 `/api/products` 的商品投影仍可能包含 `refBuyPrice/refSellPrice`，服务端没有按 `showCost/showProfit` 做字段级裁剪 | V2 Adapter 不向无 `showCost/showProfit` 的采购表单暴露对应参考价；快速新增请求也将无权字段归零；真实后端响应仍需按 Gap 处理 | 后端应在商品候选与创建响应中按字段权限裁剪参考价格，避免仅依赖前端隐藏 |
| 状态快照同步 | 三个创建接口都返回 `stateMerge`，但采购页参考数据是采购领域快照的领域投影 | 只用返回 `data` 适配为最小 `PurchaseSourceOption/PurchaseProductOption`，通过 Query Client 精确更新 `purchase.referenceData`；不复制完整 state、不写 Zustand | 后续拆分实体候选查询和增量缓存失效策略 |
| 快速创建与采购事务 | 快速创建实体与采购提交不是同一事务 | 创建成功立即选中；采购主表单、供应商抵扣、批量粘贴、图片草稿和数量展开均保持原状态；采购提交仍由 `toPurchaseRequestDto()` 负责 | 如需跨实体回滚，后端未来提供事务命令；本轮不增加补偿逻辑 |

## Phase 3D-1 采购详情与编辑契约缺口

| 缺口 | 当前事实 | Phase 3D-1 前端处理 | 后续建议 |
| --- | --- | --- | --- |
| 采购详情仍是集合裁剪 | 采购单、关联库存、检测、付款与退货来自 `/api/purchase-invoices/detail?id=...` 的领域集合快照 | `purchaseApi.detail()` 在 API 边界按 ID 投影成最小只读 Domain Model；页面不消费原始快照 | 后端直接按 ID 查询并返回可编辑能力与关联摘要 |
| 编辑权限不独立 | `PUT /api/purchase-invoices/:id` 仅要求 `purchase_list` | Phase 3D-1 不调用 PUT，详情页明确标记只读 | 新增独立采购编辑权限，不用列表查看权限代替写权限 |
| 无字段白名单 | 当前 PUT 接收 `Partial<PurchaseInvoice>`，全量对象可覆盖多个库存 / 财务关联字段 | 编辑入口禁用，仅展示 Green / Yellow / Red 字段风险 | 提供低风险 PATCH，首批只允许 `remarks`、`expressNo` 等明确字段 |
| 无并发版本 | 采购详情没有 `version`、`updatedAt`、ETag 或 CAS | 不伪造前端本地锁，不开放保存操作 | 详情返回 version，写请求带 expectedVersion，冲突时返回 409 |
| 付款 / 退货事实可能对当前账号不可见 | `paymentOutRecords` 和采购退货按独立菜单权限裁剪 | 不可见时将编辑判断标记为“无法安全确认”，不将空数组当作“无历史” | 专用详情接口应返回可编辑能力标记，而不要求前端根据多个裁剪集合猜测 |
| 金额 / 商品参考字段的原始快照裁剪不完整 | 采购成本已按 `showCost` 清零，预计售价 / 利润的服务端字段级裁剪仍不完整 | Purchase Detail Adapter 再按 `showCost/showProfit` 投影，UI 不向无权账号展示；但不宣称前端隐藏等于数据安全 | 服务端在专用详情响应中彻底删除未授权字段 |

## V2 采购列表兼容模式

| 缺口 | 当前事实 | 前端处理 | 后续建议 |
| --- | --- | --- | --- |
| 无采购服务端分页和筛选 | `/api/purchase-invoices` 返回采购领域集合，尚无查询参数 | TanStack Query 缓存领域快照；DTO/Adapter 投影后在前端进行 URL 同步筛选、排序和分页，页面明确显示“前端筛选与分页” | 为现有接口增加分页、关键字、来源、付款状态、日期和排序参数 |
| 无采购列表摘要接口 | 总单数、件数、金额和待付款数量需从当前采购集合汇总 | 仅对已按权限裁剪后的 Domain Model 汇总；无成本/利润权限时金额指标不计算、不展示 | 服务端列表响应增加权限裁剪后的 summary，避免客户端下载全量后汇总 |
| 关联库存数量无列表字段 | 采购单只保存订单信息，实物库存另在库存集合 | Adapter 使用现有采购关联规则计算只读 `inventoryCount`，不修改库存业务 | 专用列表接口返回可信的关联实物数与阶段字段 |
