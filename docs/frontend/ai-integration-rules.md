# AI 前端规则

当前阶段只预留入口，不开发模型、接口或假数据。

## 统一入口

- 全局只允许一个 `ErpAiDrawer`。
- Header、Sidebar 和未来 Cmd+K 都调用同一份 Zustand UI 状态。
- Feature 页面不得各自创建多个 AI Drawer。
- 页面内的 AI 按钮若未接入必须禁用并明确“尚未接入”。

## Feature 合约

业务模块只声明：

- 可提供的 AI Context 类型。
- 允许的 Action 名称。
- 需要的权限。
- 失败和不可用状态。

业务模块不实现模型逻辑、不拼接模型请求、不绕过权限，也不把推测内容写入业务状态。

## 接入方向

未来 AI 请求仍走 `services/api` 的 DTO、Adapter、Endpoint 和统一错误处理，可对接 OpenAI、Claude、Qwen、DeepSeek 或 MCP，而不改页面骨架。
