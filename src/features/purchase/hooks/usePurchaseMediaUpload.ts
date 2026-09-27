import {useCallback, useEffect, useRef, useState} from "react";
import type {UseFormSetValue} from "react-hook-form";
import {mediaApi} from "@/src/services/api";
import type {PurchaseFormValues} from "@/src/types/purchase";
import {compressImageFile, IMAGE_MAX_COUNT, validateImageFile} from "@/src/lib/media/image-compression";
import {createPurchaseDraftId, hasBlockingPurchaseMedia, PURCHASE_MEDIA_ENTITY_TYPE, PURCHASE_MEDIA_RELATION_ROLE, purchaseMediaFormUrls} from "../utils/purchase-media";

export type PurchaseMediaStatus = "local" | "compressing" | "uploading" | "uploaded" | "failed";

export interface PurchaseMediaItem {
  id: string;
  file: File;
  name: string;
  previewUrl: string;
  status: PurchaseMediaStatus;
  error?: string;
  sizeBytes: number;
  compressedBytes?: number;
  assetUrl?: string;
}

export interface PurchaseMediaStateChange {
  pending: boolean;
  failed: boolean;
  uploaded: number;
  total: number;
}

interface UsePurchaseMediaUploadOptions {
  setValue: UseFormSetValue<PurchaseFormValues>;
  disabled?: boolean;
  maxCount?: number;
  onStateChange?: (state: PurchaseMediaStateChange) => void;
}

interface PurchaseMediaState {
  items: PurchaseMediaItem[];
  error?: string;
}

function summarizeMediaState(items: readonly PurchaseMediaItem[]): PurchaseMediaStateChange {
  return {
    pending: items.some((item) => item.status === "compressing" || item.status === "uploading"),
    failed: items.some((item) => item.status === "failed"),
    uploaded: items.filter((item) => item.status === "uploaded").length,
    total: items.length,
  };
}

function mediaItemId(sequence: number): string {
  const generated = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `${Date.now()}-${sequence}`;
  return `purchase-image-${generated}`;
}

export function usePurchaseMediaUpload({setValue, disabled = false, maxCount = IMAGE_MAX_COUNT, onStateChange}: UsePurchaseMediaUploadOptions) {
  const [draftId] = useState(createPurchaseDraftId);
  const [state, setState] = useState<PurchaseMediaState>({items: []});
  const stateRef = useRef<PurchaseMediaState>(state);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const sequenceRef = useRef(0);
  const cancelledRef = useRef(new Set<string>());

  const commit = useCallback((update: (current: PurchaseMediaState) => PurchaseMediaState) => {
    const next = update(stateRef.current);
    stateRef.current = next;
    setState(next);
    onStateChange?.(summarizeMediaState(next.items));
    return next;
  }, [onStateChange]);

  const setFormUrls = useCallback((items: readonly PurchaseMediaItem[]) => {
    setValue("images", purchaseMediaFormUrls(items), {shouldDirty: true, shouldValidate: false});
  }, [setValue]);

  const syncDraftRelations = useCallback(async (urls: string[]) => {
    try {
      await mediaApi.replace({entityType: PURCHASE_MEDIA_ENTITY_TYPE, entityId: draftId, relationRole: PURCHASE_MEDIA_RELATION_ROLE, images: urls});
    } catch {
      commit((current) => ({...current, error: "图片引用更新失败，但当前采购表单已保留；提交时会再次按表单引用保存。"}));
    }
  }, [commit, draftId]);

  const processItem = useCallback(async (id: string) => {
    const current = stateRef.current.items.find((item) => item.id === id);
    if (!current || cancelledRef.current.has(id)) return;
    const validation = validateImageFile(current.file);
    if (!validation.ok) {
      commit((next) => ({...next, items: next.items.map((item) => item.id === id ? {...item, status: "failed", error: validation.message} : item)}));
      return;
    }

    commit((next) => ({...next, error: undefined, items: next.items.map((item) => item.id === id ? {...item, status: "compressing", error: undefined} : item)}));
    try {
      const compressed = await compressImageFile(current.file);
      if (cancelledRef.current.has(id) || !stateRef.current.items.some((item) => item.id === id)) return;
      commit((next) => ({...next, items: next.items.map((item) => item.id === id ? {...item, status: "uploading", error: undefined} : item)}));
      const existingUrls = purchaseMediaFormUrls(stateRef.current.items.filter((item) => item.id !== id));
      const result = await mediaApi.replace({
        entityType: PURCHASE_MEDIA_ENTITY_TYPE,
        entityId: draftId,
        relationRole: PURCHASE_MEDIA_RELATION_ROLE,
        images: [...existingUrls, compressed.dataUrl],
      });
      const assetUrl = result.urls[result.urls.length - 1];
      if (!assetUrl) throw new Error("媒体服务没有返回图片引用，请重试。");
      if (cancelledRef.current.has(id) || !stateRef.current.items.some((item) => item.id === id)) {
        await syncDraftRelations(purchaseMediaFormUrls(stateRef.current.items));
        return;
      }
      const nextItems = stateRef.current.items.map((item) => item.id === id ? {...item, status: "uploaded" as const, error: undefined, compressedBytes: compressed.sizeBytes, assetUrl} : item);
      commit((next) => ({...next, items: nextItems}));
      setFormUrls(nextItems);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "图片上传失败，请重试。";
      commit((next) => ({...next, items: next.items.map((item) => item.id === id ? {...item, status: "failed", error: message} : item)}));
    }
  }, [commit, draftId, setFormUrls, syncDraftRelations]);

  const enqueue = useCallback((id: string) => {
    queueRef.current = queueRef.current.then(() => processItem(id)).catch(() => undefined);
  }, [processItem]);

  const addFiles = useCallback((files: File[]) => {
    if (disabled) return;
    const available = Math.max(0, maxCount - stateRef.current.items.length);
    if (!available) {
      commit((current) => ({...current, error: `最多上传 ${maxCount} 张图片，请先删除已有图片。`}));
      return;
    }
    if (files.length > available) {
      commit((current) => ({...current, error: `最多上传 ${maxCount} 张图片，本次未添加，请分批选择。`}));
      return;
    }
    const selected = files;
    const newItems = selected.map((file) => {
      sequenceRef.current += 1;
      const id = mediaItemId(sequenceRef.current);
      const previewUrl = URL.createObjectURL(file);
      const validation = validateImageFile(file);
      return {id, file, name: file.name || `图片${sequenceRef.current}`, previewUrl, status: validation.ok ? "local" as const : "failed" as const, error: validation.ok ? undefined : validation.message, sizeBytes: file.size};
    });
    commit((current) => ({items: [...current.items, ...newItems], error: undefined}));
    newItems.filter((item) => item.status === "local").forEach((item) => enqueue(item.id));
  }, [commit, disabled, enqueue, maxCount]);

  const retry = useCallback((id: string) => {
    if (disabled) return;
    cancelledRef.current.delete(id);
    const item = stateRef.current.items.find((candidate) => candidate.id === id);
    if (!item || item.status !== "failed") return;
    commit((current) => ({...current, error: undefined, items: current.items.map((candidate) => candidate.id === id ? {...candidate, status: "local", error: undefined} : candidate)}));
    enqueue(id);
  }, [commit, disabled, enqueue]);

  const remove = useCallback((id: string) => {
    const item = stateRef.current.items.find((candidate) => candidate.id === id);
    if (!item) return;
    cancelledRef.current.add(id);
    URL.revokeObjectURL(item.previewUrl);
    const nextItems = stateRef.current.items.filter((candidate) => candidate.id !== id);
    commit((current) => ({...current, items: nextItems}));
    if (item.status === "uploaded") {
      setFormUrls(nextItems);
      void syncDraftRelations(purchaseMediaFormUrls(nextItems));
    }
  }, [commit, setFormUrls, syncDraftRelations]);

  const clear = useCallback(() => {
    stateRef.current.items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    cancelledRef.current = new Set(stateRef.current.items.map((item) => item.id));
    commit(() => ({items: [], error: undefined}));
    setValue("images", [], {shouldDirty: false, shouldValidate: false});
  }, [commit, setValue]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // React StrictMode replays effects once in development. Defer cleanup by a
  // microtask so the replayed setup can cancel the simulated unmount cleanup;
  // real unmounts still release every Blob URL.
  const mountGenerationRef = useRef(0);
  useEffect(() => {
    const generation = mountGenerationRef.current + 1;
    mountGenerationRef.current = generation;
    return () => {
      queueMicrotask(() => {
        if (mountGenerationRef.current !== generation) return;
        stateRef.current.items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      });
    };
  }, []);

  const pending = state.items.some((item) => item.status === "compressing" || item.status === "uploading");
  const failed = state.items.some((item) => item.status === "failed");
  return {
    draftId,
    items: state.items,
    error: state.error,
    pending,
    failed,
    uploaded: state.items.filter((item) => item.status === "uploaded").length,
    blocking: hasBlockingPurchaseMedia(state.items),
    addFiles,
    retry,
    remove,
    clear,
  };
}
