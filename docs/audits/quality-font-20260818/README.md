# 质检检测页字体审查

日期：2026-08-18

## 审查步骤

1. 打开本地 V2 页面：页面可以打开，但当前 API `127.0.0.1:3011` 未启动。
2. 使用本地测试账号尝试进入质检页：登录请求返回 `Failed to fetch`，因此未能取得登录后的质检页面截图。
3. 对 `/src/features/inspections` 的页面、表格列和全局字体 token 做源码核对。

## 结论

高概率问题不是字体文件加载失败，而是质检页把中文业务文案大量套用了 `font-mono`，同时使用了 8–10px 微字号和 `tracking-wider`。这会造成中文与英文/数字分别走不同字体回退，字面宽度和粗细不一致，视觉上像“字体奇怪”。

重点位置：

- `src/features/inspections/pages/InspectionWorkspacePage.tsx:226`：中文待检数量文案使用 `font-mono`。
- `src/features/inspections/pages/InspectionWorkspacePage.tsx:232-243`：检测池标题使用 `uppercase tracking-wider`；候选卡片和归档信息大量使用 `font-mono`、8–10px 字号。
- `src/features/inspections/pages/InspectionWorkspacePage.tsx:263-265`：检测类型徽标和整块商品事实区使用 `font-mono`，其中包含中文。
- `src/features/inspections/pages/InspectionWorkspacePage.tsx:322-325`：所有表单字段标签为 10px 并带 `tracking-wider`，中文可读性偏差明显。
- `src/features/inspections/inspection.columns.tsx:16-34`：SN/编号、时间、温度等适合等宽，但当前混合文本边界需要继续拆开。

## 建议修复

- 中文标题、状态、说明、字段标签统一回到 `font-sans`；字段标签调整为至少 12px，去掉中文上的 `tracking-wider`。
- `font-mono` 只保留给 SN、库存编号、检测单号、时间、温度/功耗和纯数字测量值。
- 归档和候选卡片的辅助信息最低 11–12px，避免 8–10px 的中文微文本。
- 全局 sans 栈补充 `Segoe UI`、`Hiragino Sans GB`、`Noto Sans CJK SC` 等跨平台回退；不建议现在直接引入外部字体文件。

## 证据限制

当前本地 API 未启动，登录后质检页面无法通过真实浏览器复现；已保存的截图是登录失败阻塞态，不作为质检页视觉截图使用。源码证据足以确认上述字体使用问题，但修改后仍需在登录态下做一次桌面和手机视觉验收。

截图：`01-login-blocker.png`
