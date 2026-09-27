# AI 每日销售总结

## 目标

把当天真实完成出库的商品、数量、每个成交单价和合计，用门店人员能快速读懂的中文展示在 AI 页面，并通过现有飞书机器人投递日报。

## 事实口径

- 事实来源是服务端 `inventory` 中 `status=已售出` 的库存卡；销售单仍用于补齐缺失的出库时间和成交价，不把“待出库”订单当作已售出。
- 业务日期使用 `Asia/Shanghai`，默认截止时间为 20:00；页面和飞书日报都返回同一个 `date/cutoff`。
- 商品优先按 `productId` 聚合，没有商品 ID 时按商品名、品牌、型号、版本和显存/规格组成的稳定身份聚合。
- 同一商品不同成交单价分开列出；销售额是有真实成交单价的物理卡数量乘单价之和。缺失单价的卡计入销量，但不计入销售额，并写入数据质量提示。
- 毛利只在当前账号拥有 `showProfit` 权限时返回，按真实成交价减真实成本计算；未授权响应不包含毛利字段。
- 昨日对比使用同一截止时间和同一口径。已完成销售退货单单独列出，不冲掉原始出库事实。

## AI 边界

服务端先计算完整事实，再把匿名聚合数据交给 AI 生成 `headline/comparison/attention`。AI 不计算金额、不改写单价、不接触客户姓名、联系方式、SN 或订单号；模型不可用、超时或返回非法 JSON 时降级为规则文案。缓存按租户、门店和业务日期隔离，并带来源标记。

## 接口

`GET /api/ai/daily-sales-summary?date=YYYY-MM-DD`

返回 `{data: {summary, narrative}}`。页面在 AI 建议权限内只读请求该接口；所有数字在浏览器端只做格式化，不再二次计算。

## 飞书日报

`scripts/send_daily_report.sh` 复用 `FEISHU_DAILY_REPORT_WEBHOOK_URL`，未配置时回退到 `FEISHU_SALES_WEBHOOK_URL`。日报通知继续使用 PostgreSQL 幂等记录；超过飞书单条文本限制时自动按行分段，脚本负责失败重试。`ops/systemd/gpu-erp-daily-report.timer` 默认每天 20:05（Asia/Shanghai）触发。
