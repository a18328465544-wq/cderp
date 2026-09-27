# Frontend V2 商品库 API Gap

| Gap | 当前行为 | V2 降级 | 后端未来建议 |
| --- | --- | --- | --- |
| 商品库没有服务端分页、筛选和排序 | `GET /api/products` 返回全部商品，同时附带库存与行情集合 | 只在真实已加载集合内做 URL 筛选、排序和分页，并在 UI 标明 | 增加只返回商品投影的分页接口，支持 keyword/category/brand/sort/page/pageSize |
| 商品接口未按字段权限裁剪原始价格 | 原始响应可能仍包含 `refBuyPrice/refSellPrice/lastBuyPrice/lastSellPrice` | Adapter 在组件前脱敏；不完整权限下禁用已有模板编辑 | 服务端按 `showCost/showProfit` 移除敏感字段，不能只依赖前端隐藏 |
| 部分价格权限下缺少 PATCH 语义 | `PUT` 使用完整商品模板，前端无法安全保留不可见价格 | 仅允许具备完整价格权限的账号编辑已有模板；新建按可见字段提交 | 提供字段级 PATCH 或服务端保留请求中缺失的受限字段 |
| Draft 商品媒体没有垃圾回收契约 | 商品图片可通过 `product_draft` 预上传并把 URL 写入商品 Request | 删除时仅替换当前 Draft 引用；不新增清理 API | 增加安全、延迟的孤立 Draft 媒体清理策略 |
| CSV 导入仅支持整批 Upsert | 后端返回导入结果数组，没有行级错误结构 | 前端先做确定性表头/必填字段校验；服务端错误按整批展示 | 增加行号、错误码和部分成功结果，便于大批量修正 |
