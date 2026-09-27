# Purchase Media Contract（Frontend V2 Phase 3B）

本文件记录采购页现有媒体接口的真实契约。Phase 3B 只在前端接入，不修改 FastAPI、数据库或媒体存储模型。

## 预上传接口

```http
POST /api/media
Cookie: gpu_erp_session=<http-only-session>
X-CSRF-Token: <session-bound-csrf-token>
Content-Type: application/json
```

```json
{
  "entityType": "purchase_draft",
  "entityId": "purchase-draft-<page-lifetime-id>",
  "relationRole": "purchase-evidence",
  "images": ["data:image/jpeg;base64,...", "/api/media/assets/IMG-..."]
}
```

接口接受压缩后的 JPG、PNG、WEBP Data URL，以及已经存在的完整媒体 URL。响应为：

```json
{
  "data": {
    "urls": ["/api/media/assets/IMG-..."],
    "targetBytes": 100000,
    "maxBytes": 110000
  }
}
```

同一 `entityType + entityId + relationRole` 是替换关系，不是追加关系。前端因此使用串行队列，并在每次上传时携带当前仍保留的已上传 URL，避免多图互相覆盖。

## 正式采购绑定

```http
POST /api/purchase-invoices
```

采购请求的 `images` 字段只发送 `/api/media/assets/:id` URL。服务端先创建正式采购单，再以 `purchase_invoice + purchase-evidence` 关系保存这些引用。服务端没有 `purchase_draft → purchase_invoice` 迁移接口，前端不会发送 `draftId` 或假设存在迁移动作。

## 页面生命周期

```text
页面实例
  -> purchaseDraftId（稳定 UUID）
  -> local
  -> compressing
  -> uploading（purchase_draft / purchase-evidence）
  -> uploaded（表单只写入真实 URL）
  -> 正式采购提交（purchase_invoice / purchase-evidence）
```

`File`、`Blob`、Data URL 和上传进度只存在于采购媒体 Hook 的瞬时状态中，不进入 Purchase Form、Zustand、localStorage 或 Purchase DTO。采购提交失败时保留页面内的 draft、预览和 URL；成功图片不会重复上传。

## 删除与失败

- `local` / `compressing`：本地移除并释放 Blob URL。
- `uploaded`：从表单引用移除，并使用同一替换接口尽力同步 draft 关系。
- 当前后端没有独立媒体删除/垃圾回收接口，孤立 draft 关系记录在 `PURCHASE_API_GAP.md`。
- 任一图片处于 `compressing`、`uploading` 或 `failed` 时，采购提交被阻止；失败图片可以单独重试。
