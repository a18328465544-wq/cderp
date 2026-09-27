# Frontend V2 商品库 API Contract

## 真实接口

| 能力 | 接口 | 权限 | V2 边界 |
| --- | --- | --- | --- |
| 商品库读取 | `GET /api/products` | `products`，或现有后端允许的关联菜单 | `ProductLibraryResponseDto -> adaptProductLibrary() -> ProductLibrarySnapshot` |
| 新建模板 | `POST /api/products` | `products` | `ProductTemplateFormValues -> toProductTemplateRequest() -> ProductTemplateRequestDto` |
| 编辑模板 | `PUT /api/products/:id` | `products` | 同一 Request Adapter；服务端同步有效库存和行情模板字段 |
| 删除模板 | `DELETE /api/products/:id` | `products` + `canDelete` | 被库存、采购或销售单据引用时由服务端拒绝 |
| CSV 批量导入 | `POST /api/products/import` | `products` | 确定性 CSV 解析后发送现有批量 Upsert 结构 |
| 商品图片预上传 | `POST /api/media` | 现有媒体权限 | `product_draft + product-image` 获得真实媒体 URL，商品 Request 只携带 URL |

## 响应链路

```text
Existing API Response
  -> Product DTO
  -> Product Adapter（字段标准化与成本/利润脱敏）
  -> ProductLibrarySnapshot
  -> Product Feature / ErpDataTable
```

页面不直接调用 `fetch`，不消费 `stateMerge`，也不读取原始 `/api/state`。

## 权限处理

- 页面入口使用 `products` 菜单权限。
- `showCost=false` 时 Adapter 不向页面提供参考回收价和最近买入价。
- `showProfit=false` 时 Adapter 不向页面提供参考销售价和最近卖出价。
- 缺少任一价格查看权限时，已有模板编辑入口关闭，避免用不可见的默认值覆盖真实价格。
- 删除按钮同时要求 `canDelete`；401/403 继续由统一 `ApiError` 处理。

## 分页与筛选

现有 `GET /api/products` 返回商品、库存和行情组成的整库快照，没有商品库专用服务端分页、筛选和排序参数。因此 V2 明确采用：

```text
真实整库读取 -> Domain Model -> 当前集合内筛选/排序/分页
```

页面文案明确说明这是契约降级，不把前端切片伪装成服务端分页。筛选状态同步 URL。
