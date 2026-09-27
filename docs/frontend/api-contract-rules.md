# API Contract 规则

## 读取方向

```text
FastAPI Response
    ↓
src/services/api/dto/*.dto.ts
    ↓
src/services/api/adapters/*.adapter.ts
    ↓
src/types/*.ts
    ↓
Feature / Domain Component
```

页面只调用 `src/services/api/endpoints` 的领域方法。原始字段、响应 envelope 和兼容字段都在 Adapter 内消化。

## 写入方向

```text
React Hook Form Model
    ↓
Request Adapter
    ↓
Request DTO
    ↓
Endpoint + apiRequest
```

服务端是金额、库存状态和业务规则的最终权威。前端计算只用于即时预览和校验提示。

## 现有实现

- 库存：`inventory.dto.ts` → `inventory.adapter.ts` → `InventoryListItem` / `InventoryJourney`
- 销售：`sales.dto.ts` → `sales.adapter.ts` → `SalesCustomerOption`、`SalesInventoryCandidate`、`SalesInvoiceResult`
- 统一错误：`services/api/errors/index.ts` → `ApiError`
- 统一缓存键：`services/api/query-keys/index.ts`

## 规则

1. 页面不得拼接接口地址或直接调用 `fetch`。
2. 页面不得导入 `services/api/dto`。
3. Query Key 必须集中定义，不能在 Feature 中写匿名数组。
4. 新字段先进入 DTO 和 Adapter，再进入 Domain Model。
5. 不支持的字段保持 `undefined`，不以默认值伪造业务事实。
6. 后端接口不足必须新增模块 API Gap 文档，不得修改后端以迁就页面。
7. 创建响应中的 `stateMerge` 只用于缓存失效或后续同步，不直接当 Domain Model 展示。
