# 成都显卡一号店库存开放 API

开放库存 API 面向外部系统、扫码设备或自动化脚本。它独立于网页登录会话，统一使用 `OPEN_API_TOKEN` 鉴权。

## 鉴权

服务端 `.env` 配置：

```env
OPEN_API_TOKEN="换成一串足够长的随机密钥"
```

请求头二选一：

```http
Authorization: Bearer <OPEN_API_TOKEN>
```

或：

```http
X-API-Token: <OPEN_API_TOKEN>
```

## 分页

列表接口支持：

```txt
page=1
pageSize=20
```

返回格式：

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 0
  }
}
```

## 查询库存列表

```bash
curl -H "Authorization: Bearer $OPEN_API_TOKEN" \
  "https://gpu-erp.cdgpu.cn/api/open/inventory/items?page=1&pageSize=20&keyword=4090"
```

可选筛选：

```txt
keyword              商品名、型号、SN、快递单、供应商、库位等关键词
status               库存状态，如 已入库、已锁定、已售出
category             类目，如 显卡、CPU、主板、其他配件
warehouseLocation    库位
includeSold=true     是否包含已售出库存
```

## 按库存 ID 查询

```bash
curl -H "Authorization: Bearer $OPEN_API_TOKEN" \
  "https://gpu-erp.cdgpu.cn/api/open/inventory/items/KC-20260617-001"
```

## 按 SN 查询

```bash
curl -H "Authorization: Bearer $OPEN_API_TOKEN" \
  "https://gpu-erp.cdgpu.cn/api/open/inventory/by-sn/SN123456"
```

## 查询整体库存汇总

```bash
curl -H "Authorization: Bearer $OPEN_API_TOKEN" \
  "https://gpu-erp.cdgpu.cn/api/open/inventory/summary?keyword=4090&page=1&pageSize=20"
```

## 同步预估出货价

外部价格系统按商品库 `productId` 同步建议销售价。系统会更新：

- 商品库 `refSellPrice`
- 未售出、未退货、未拆装消耗的库存 `estSellPrice`
- 已存在行情参考的 `todaySellPrice / refSellPrice`

历史进货单、销售单、已售出库存和回收参考价不会被改动。回收参考价仍走系统内“行情参考”每日更新。

```bash
curl -X POST \
  -H "Authorization: Bearer $OPEN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "SP-092",
    "estSellPrice": 6250,
    "priceSource": "外部价格系统",
    "remarks": "每日自动同步"
  }' \
  "https://gpu-erp.cdgpu.cn/api/open/prices/sync-est-sell"
```

兼容字段名：

```txt
estSellPrice / suggestSellPrice / refSellPrice / todaySellPrice
priceSource / source
```

## 扫码入库

入库沿用系统现有扫码规则。显卡可通过 `trackingSnPairs` 按快递单绑定 SN；普通扫码可通过 `codes` 处理已有库存 ID 或 SN。

```bash
curl -X POST \
  -H "Authorization: Bearer $OPEN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "handler": "仓库PDA",
    "warehouseLocation": "A区货架-01",
    "trackingSnPairs": [
      { "trackingNo": "SF13800138000", "sn": "SN4090ABC001" }
    ]
  }' \
  "https://gpu-erp.cdgpu.cn/api/open/inventory/scan-in"
```

## 扫码出库

出库必须先在系统内创建销售单并锁定库存。开放 API 只负责扫码确认出库，不会绕过销售单校验。

```bash
curl -X POST \
  -H "Authorization: Bearer $OPEN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "handler": "仓库PDA",
    "codes": ["SN4090ABC001"],
    "target": "客户自提"
  }' \
  "https://gpu-erp.cdgpu.cn/api/open/inventory/scan-out"
```

## 扫码移库

```bash
curl -X POST \
  -H "Authorization: Bearer $OPEN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "handler": "仓库PDA",
    "warehouseLocation": "B区货架-02",
    "codes": ["SN4090ABC001"]
  }' \
  "https://gpu-erp.cdgpu.cn/api/open/inventory/relocate"
```
