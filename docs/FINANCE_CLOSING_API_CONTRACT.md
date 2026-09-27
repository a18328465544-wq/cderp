# 日结与异常 API Contract

## 页面边界

`/finance/closing` 只展示服务端已经保存的日结快照和快照中的待复核摘要，不把通用状态快照伪装成日结记录，也不直接消费原始 DTO。

## 真实接口

| 用途 | 方法 | 路径 | 前端调用 |
| --- | --- | --- | --- |
| 最近日结列表 | GET | `/api/finance/daily-closings?limit={limit}` | `financeClosingApi.list` |
| 指定日期详情 | GET | `/api/finance/daily-closing?date={date}` | `financeClosingApi.get` |
| 保存日结 | POST | `/api/finance/daily-closing` | `financeClosingApi.create`，本次页面迁移暂不暴露写入口 |

响应统一为 `{ data: ... }`。列表 `data` 是 `DailyClosing[]`，详情和写入响应 `data` 是一条 `DailyClosing`。

## Domain Model

Adapter 只向页面暴露：

- 日结编号、日期、关闭时间、关闭人、备注
- 收入、支出、净现金变动
- 销售单数、采购单数
- 应收、应付
- 待复核数量、账户对账差异数量

金额和计数会被标准化为有限数字；缺失或非法的日结编号、日期会被丢弃。

## 查询和筛选

后端列表接口目前只支持 `limit`。前端请求最多 30 条最近快照，再在已返回集合中做日期、关键词、排序和分页；页面会明确标识这个降级边界，不把本地筛选冒充服务端分页。

## 权限

后端路由使用 `requireMenu("finance")`。前端入口兼容 `finance_closing` 和 `finance` 两个现有菜单权限，并由服务端最终裁决。
