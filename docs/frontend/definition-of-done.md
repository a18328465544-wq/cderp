# Definition of Done

一个新的 Frontend V2 业务模块只有满足以下条件才算完成：

- [ ] 页面模板已声明并复用统一骨架。
- [ ] API Contract Map 和 API Gap 已更新。
- [ ] Response → DTO → Adapter → Domain → Feature 链路完整。
- [ ] Query Key 集中管理，状态归属符合规则。
- [ ] TypeScript Strict 通过。
- [ ] Vite Build 和完整构建通过。
- [ ] 全量测试通过，关键业务边界有测试。
- [ ] 组件边界检查通过。
- [ ] UI 契约检查通过。
- [ ] 无新增 `any`、legacy 导入、Mock 正式路径或页面直接 fetch。
- [ ] Loading、Empty、Error、Retry、401、403 和业务冲突完整。
- [ ] 敏感字段和操作权限正确处理。
- [ ] 移动端降级行为已验证。
- [ ] AI 只保留合约允许的入口，没有假结果。
- [ ] 对应页面本地 HTTP 200，关键交互已人工检查。
- [ ] 未修改后端、数据库、权限规则和 ERP 业务逻辑。
