# 架构规则

## 目标

Frontend V2 采用“应用壳层 + 分层组件 + Feature 纵向切片 + API 边界”的结构。页面只组合业务能力，不复制基础交互和请求解析。

## 当前目录

```text
src/
├── app/                 # Router、Providers、App Shell
├── components/
│   ├── ui/              # 无业务含义的基础原语
│   ├── common/          # ERP 通用页面能力
│   └── domain/          # 客户、库存、账户等实体能力
├── features/
│   ├── inventory/       # 库存纵向切片
│   └── sales/           # 销售开单纵向切片
├── services/api/        # Client、DTO、Adapter、Endpoint、Query Key
├── stores/              # 全局界面状态
├── hooks/               # 通用 React Hooks
├── schemas/             # 可跨 Feature 的校验 Schema（如有）
├── styles/              # Token 和全局样式
├── types/               # 前端 Domain Model
├── config/              # 导航和运行配置
└── lib/                 # 无业务副作用的工具
```

## 依赖图

```text
components/ui
      ↑
components/common
      ↑
components/domain
      ↑
features/<module>
      ↑
app
```

数据流单独遵循：

```text
FastAPI Response → API DTO → Adapter → Domain Model → Feature / Component
Form Model → Request Adapter → Request DTO → API Endpoint
```

## 规则

1. Layout 只规定区域和状态，不包含具体业务数据；Page Frame 不得重新实现 QuickStatus 布局。
2. Feature 只通过公开出口使用其他层，不读取 legacy 目录。
3. Feature 之间不通过深层内部路径互相引用。
4. 业务页面不直接使用 `fetch`、原始 DTO 或接口 URL。
5. 派生金额、标签和显示状态优先计算，不复制到全局状态。
6. 每个模块必须有自己的 Contract、Gap 和测试；缺口不能靠前端猜测。
7. 新模块必须先完成一个可运行的纵向切片，再扩大范围。
8. QuickStatusGroup 是 Common 层的全局状态摘要，默认 `compact`；Feature 只负责把业务事实映射为 `label`、`value`、`icon`、`tone`、`tooltip` 和 `action`。

## 路由加载边界

- `src/app/router.tsx` 只静态保留 App Shell、路由定义和统一加载态。
- 业务页面通过 TanStack Router 的 `lazyRouteComponent` 从具体页面文件按路由加载，禁止在 Router 中恢复对 Feature barrel 的静态页面导入。
- 路由路径、权限检查、API Query 和页面内部状态不因分包改变；代码分包只改变资源加载时机。
- 全局使用同一个 `defaultPendingComponent`，业务页面不得各自新增路由级加载骨架。
- 新增业务路由时必须在生产构建中确认生成独立页面 chunk，并验证直接访问路由可以正常加载。

## 已验证的切片

库存页验证了服务端分页、URL 筛选、详情抽屉和权限字段；销售页验证了 RHF/Zod、Field Array、客户/库存/账户选择器、提交错误和未保存离开保护。后续模块应复用这些边界，而不是复制页面实现。
