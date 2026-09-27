# 状态归属

| 状态 | 唯一归属 | 示例 |
| --- | --- | --- |
| FastAPI 数据和请求缓存 | TanStack Query | 库存列表、销售客户候选、收款账户 |
| 分页、排序、搜索、可恢复筛选 | TanStack Router Search Params（兼容旧页时使用 URL History Adapter） | 库存筛选和详情 ID |
| 表单编辑数据和错误 | React Hook Form | 销售客户、明细、收款和备注 |
| 全局界面状态 | Zustand | Sidebar 折叠、全局 AI Drawer |
| 瞬时交互 | 组件本地 state | Picker 展开、输入 debounce、当前选中候选 |
| 派生数据 | `useMemo` 或纯函数 | 销售应收、未收和预计利润 |

## 禁止

- 不把 API 返回数据复制到 Zustand。
- 不把完整业务表单存入 Zustand。
- 不为同一类状态同时使用 Query、Zustand 和本地 state。
- 不把派生金额作为第二份可编辑事实保存。
- 不用 URL 保存密码、Token 或敏感金额明细。

## 迁移约定

库存页当前通过 URL History Adapter 兼容既有 Router 结构；新页面应优先使用 TanStack Router Search Params。兼容代码只能留在页面边界，不能让 Domain 组件知道 URL。
