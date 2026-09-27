# 依赖边界

## 分层允许关系

| 层 | 可以依赖 | 禁止依赖 |
| --- | --- | --- |
| `components/ui` | React、Base UI、Lucide、`lib/cn`、Token | Common、Domain、Feature、API、Zustand |
| `components/common` | UI、lib、必要的全局 UI 状态 | 具体 Feature、原始 API DTO |
| `components/domain` | UI、Common、Domain Model、lib | 具体 Feature、API Endpoint、原始 DTO |
| `features/<module>` | UI、Common、Domain、公开 API、自己的内部文件 | 其他 Feature 内部文件、原始 DTO、直接 fetch |
| `services/api` | Client、DTO、Adapter、Domain Model | 页面和 UI |
| `app` | Shell、公开 Feature 出口、Router、Providers | Feature 内部实现细节 |

## 公共出口

- `src/components/ui/index.ts`
- `src/components/common/index.ts`
- `src/components/domain/index.ts`
- `src/features/<module>/index.ts`
- `src/services/api/index.ts`
- `src/types/index.ts`

跨模块复用必须先通过这些出口；如果只有一个业务流程使用，不要提前晋升。

## 自动检查

`scripts/check-component-boundaries.mjs` 检查组件层依赖，`scripts/check-frontend-rules.mjs` 检查：

- UI/Common/Domain 反向依赖
- Feature 深层跨模块导入
- 页面直接 `fetch`
- Feature / Component 直接导入 DTO
- legacy 和 Mock 导入
- 页面直接拼接 `/api/` 地址
- Query Key 未集中到 `queryKeys`
- 新增 `any`
- 明显的原始颜色值和内联颜色

检查必须保持可解释，不能为了追求覆盖率加入脆弱的业务猜测。

## 兼容目录

`src/components` 根目录仍有旧项目兼容工具文件。它们不是 V2 组件层，正式页面不得导入；迁移或删除它们必须另立任务，不能在新模块中扩大耦合。
