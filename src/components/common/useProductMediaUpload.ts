import {useCallback, useEffect, useRef, useState} from "react";
import {mediaApi} from "@/src/services/api";
import {compressImageFile, IMAGE_ACCEPTED_MIME_TYPES, validateImageFile} from "@/src/lib/media/image-compression";
import type {ErpUploaderItem} from "./ErpUploader";

interface ProductMediaItem extends ErpUploaderItem {
  file?: File;
  assetUrl?: string;
  objectUrl?: boolean;
}

function createDraftId() {
  const id = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `product-draft-${id}`;
}

function itemId() {
  return `product-image-${typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function uploadedUrls(items: readonly ProductMediaItem[]) {
  return items.filter((item) => item.status === "uploaded" && item.assetUrl).map((item) => item.assetUrl as string);
}

export function useProductMediaUpload(onUrlsChange: (urls: string[]) => void, maxCount = 6) {
  const [draftId, setDraftId] = useState(createDraftId);
  const [items, setItems] = useState<ProductMediaItem[]>([]);
  const [error, setError] = useState<string>();
  const itemsRef = useRef(items);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const cancelledRef = useRef(new Set<string>());

  const commit = useCallback((updater: (current: ProductMediaItem[]) => ProductMediaItem[]) => {
    const next = updater(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
    return next;
  }, []);

  const replaceRelations = useCallback(async (urls: string[]) => mediaApi.replace({entityType: "product_draft", entityId: draftId, relationRole: "product-image", images: urls}), [draftId]);

  const process = useCallback(async (id: string) => {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (!item?.file || cancelledRef.current.has(id)) return;
    const validation = validateImageFile(item.file);
    if (!validation.ok) {
      commit((current) => current.map((candidate) => candidate.id === id ? {...candidate, status: "failed", error: validation.message} : candidate));
      return;
    }
    commit((current) => current.map((candidate) => candidate.id === id ? {...candidate, status: "compressing", error: undefined} : candidate));
    try {
      const compressed = await compressImageFile(item.file);
      if (cancelledRef.current.has(id) || !itemsRef.current.some((candidate) => candidate.id === id)) return;
      commit((current) => current.map((candidate) => candidate.id === id ? {...candidate, status: "uploading", compressedBytes: compressed.sizeBytes} : candidate));
      const currentUrls = uploadedUrls(itemsRef.current.filter((candidate) => candidate.id !== id));
      const response = await replaceRelations([...currentUrls, compressed.dataUrl]);
      const assetUrl = response.urls.at(-1);
      if (!assetUrl) throw new Error("媒体服务未返回商品图片引用");
      const next = commit((current) => current.map((candidate) => candidate.id === id ? {...candidate, status: "uploaded", error: undefined, assetUrl} : candidate));
      onUrlsChange(uploadedUrls(next));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "商品图片上传失败，请重试";
      commit((current) => current.map((candidate) => candidate.id === id ? {...candidate, status: "failed", error: message} : candidate));
    }
  }, [commit, onUrlsChange, replaceRelations]);

  const enqueue = useCallback((id: string) => {
    queueRef.current = queueRef.current.then(() => process(id)).catch(() => undefined);
  }, [process]);

  const reset = useCallback((urls: string[]) => {
    itemsRef.current.forEach((item) => cancelledRef.current.add(item.id));
    itemsRef.current.forEach((item) => {if (item.objectUrl && item.previewUrl) URL.revokeObjectURL(item.previewUrl);});
    const next = urls.map((url, index): ProductMediaItem => ({id: `existing-${index}-${url}`, name: `商品图片 ${index + 1}`, previewUrl: url, status: "uploaded", assetUrl: url}));
    cancelledRef.current = new Set();
    itemsRef.current = next;
    setItems(next);
    setError(undefined);
    setDraftId(createDraftId());
  }, []);

  const addFiles = useCallback((files: File[]) => {
    const available = maxCount - itemsRef.current.length;
    if (files.length > available) {setError(`最多上传 ${maxCount} 张图片，本次没有添加。`); return;}
    const next = files.map((file): ProductMediaItem => {
      const validation = validateImageFile(file);
      return {id: itemId(), file, name: file.name, previewUrl: URL.createObjectURL(file), objectUrl: true, status: validation.ok ? "local" : "failed", error: validation.ok ? undefined : validation.message, sizeBytes: file.size};
    });
    commit((current) => [...current, ...next]);
    setError(undefined);
    next.filter((item) => item.status === "local").forEach((item) => enqueue(item.id));
  }, [commit, enqueue, maxCount]);

  const retry = useCallback((id: string) => {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (!item?.file || item.status !== "failed") return;
    cancelledRef.current.delete(id);
    commit((current) => current.map((candidate) => candidate.id === id ? {...candidate, status: "local", error: undefined} : candidate));
    enqueue(id);
  }, [commit, enqueue]);

  const remove = useCallback((id: string) => {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (!item || item.status === "uploading") return;
    cancelledRef.current.add(id);
    if (item.objectUrl && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    const next = commit((current) => current.filter((candidate) => candidate.id !== id));
    const urls = uploadedUrls(next);
    onUrlsChange(urls);
    if (item.status === "uploaded") void replaceRelations(urls).catch(() => setError("图片引用删除同步失败；保存商品时仍会按当前列表提交。"));
  }, [commit, onUrlsChange, replaceRelations]);

  useEffect(() => () => {
    itemsRef.current.forEach((item) => {if (item.objectUrl && item.previewUrl) URL.revokeObjectURL(item.previewUrl);});
  }, []);

  return {
    items,
    error,
    reset,
    addFiles,
    retry,
    remove,
    accept: Array.from(IMAGE_ACCEPTED_MIME_TYPES).join(","),
    blocking: items.some((item) => item.status === "compressing" || item.status === "uploading" || item.status === "failed"),
  };
}
