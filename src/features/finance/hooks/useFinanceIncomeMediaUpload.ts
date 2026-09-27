import {useCallback, useEffect, useRef, useState} from "react";
import type {ErpUploaderItem} from "@/src/components/common";
import {compressImageFile, IMAGE_ACCEPTED_MIME_TYPES, validateImageFile} from "@/src/lib/media/image-compression";
import {mediaApi} from "@/src/services/api";

interface IncomeMediaItem extends ErpUploaderItem {file?: File; assetUrl?: string; objectUrl?: boolean;}
const uuid = () => typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const uploadedUrls = (items: IncomeMediaItem[]) => items.filter((item) => item.status === "uploaded" && item.assetUrl).map((item) => item.assetUrl as string);

export function useFinanceEntryMediaUpload(onUrlsChange: (urls: string[]) => void, config: {entityType: "payment_in_draft" | "payment_out_draft"; draftPrefix: string}, maxCount = 6) {
  const draftId = useRef(`${config.draftPrefix}-${uuid()}`).current;
  const [items, setItems] = useState<IncomeMediaItem[]>([]);
  const [error, setError] = useState<string>();
  const itemsRef = useRef(items);
  const queueRef = useRef(Promise.resolve());
  const cancelled = useRef(new Set<string>());
  const commit = useCallback((updater: (current: IncomeMediaItem[]) => IncomeMediaItem[]) => {const next = updater(itemsRef.current); itemsRef.current = next; setItems(next); return next;}, []);
  const replace = useCallback((urls: string[]) => mediaApi.replace({entityType: config.entityType, entityId: draftId, relationRole: "payment-evidence", images: urls}), [config.entityType, draftId]);
  const process = useCallback(async (id: string) => {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (!item?.file || cancelled.current.has(id)) return;
    commit((current) => current.map((candidate) => candidate.id === id ? {...candidate, status: "compressing", error: undefined} : candidate));
    try {
      const compressed = await compressImageFile(item.file);
      if (cancelled.current.has(id)) return;
      commit((current) => current.map((candidate) => candidate.id === id ? {...candidate, status: "uploading", compressedBytes: compressed.sizeBytes} : candidate));
      const response = await replace([...uploadedUrls(itemsRef.current.filter((candidate) => candidate.id !== id)), compressed.dataUrl]);
      const assetUrl = response.urls.at(-1);
      if (!assetUrl) throw new Error("媒体服务未返回凭证图片引用");
      const next = commit((current) => current.map((candidate) => candidate.id === id ? {...candidate, status: "uploaded", assetUrl, error: undefined} : candidate));
      onUrlsChange(uploadedUrls(next));
    } catch (caught) {
      commit((current) => current.map((candidate) => candidate.id === id ? {...candidate, status: "failed", error: caught instanceof Error ? caught.message : "凭证上传失败"} : candidate));
    }
  }, [commit, onUrlsChange, replace]);
  const enqueue = useCallback((id: string) => {queueRef.current = queueRef.current.then(() => process(id)).catch(() => undefined);}, [process]);
  const reset = useCallback((urls: string[]) => {itemsRef.current.forEach((item) => {if (item.objectUrl && item.previewUrl) URL.revokeObjectURL(item.previewUrl);}); const next = urls.map((url, index): IncomeMediaItem => ({id: `existing-${index}`, name: `凭证 ${index + 1}`, previewUrl: url, status: "uploaded", assetUrl: url})); itemsRef.current = next; setItems(next); setError(undefined);}, []);
  const addFiles = useCallback((files: File[]) => {
    if (itemsRef.current.length + files.length > maxCount) {setError(`最多上传 ${maxCount} 张凭证图片。`); return;}
    const next = files.map((file): IncomeMediaItem => {const validation = validateImageFile(file); return {id: `income-image-${uuid()}`, file, name: file.name, previewUrl: URL.createObjectURL(file), objectUrl: true, sizeBytes: file.size, status: validation.ok ? "local" : "failed", error: validation.ok ? undefined : validation.message};});
    commit((current) => [...current, ...next]); setError(undefined); next.filter((item) => item.status === "local").forEach((item) => enqueue(item.id));
  }, [commit, enqueue, maxCount]);
  const retry = useCallback((id: string) => {const item = itemsRef.current.find((candidate) => candidate.id === id); if (!item?.file || item.status !== "failed") return; cancelled.current.delete(id); commit((current) => current.map((candidate) => candidate.id === id ? {...candidate, status: "local", error: undefined} : candidate)); enqueue(id);}, [commit, enqueue]);
  const remove = useCallback((id: string) => {const item = itemsRef.current.find((candidate) => candidate.id === id); if (!item || item.status === "uploading") return; cancelled.current.add(id); if (item.objectUrl && item.previewUrl) URL.revokeObjectURL(item.previewUrl); const next = commit((current) => current.filter((candidate) => candidate.id !== id)); const urls = uploadedUrls(next); onUrlsChange(urls); if (item.status === "uploaded") void replace(urls).catch(() => setError("凭证引用删除同步失败；保存时仍按当前列表提交。"));}, [commit, onUrlsChange, replace]);
  useEffect(() => () => {itemsRef.current.forEach((item) => {if (item.objectUrl && item.previewUrl) URL.revokeObjectURL(item.previewUrl);});}, []);
  return {items, error, reset, addFiles, retry, remove, accept: IMAGE_ACCEPTED_MIME_TYPES.join(","), blocking: items.some((item) => ["compressing", "uploading", "failed"].includes(item.status))};
}

export function useFinanceIncomeMediaUpload(onUrlsChange: (urls: string[]) => void, maxCount = 6) {
  return useFinanceEntryMediaUpload(onUrlsChange, {entityType: "payment_in_draft", draftPrefix: "payment-in-draft"}, maxCount);
}
