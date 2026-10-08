import type {CompressedImage, ImageValidationResult} from "./image-compression";

export type DraftMediaStatus = "local" | "compressing" | "uploading" | "uploaded" | "failed";
export interface DraftMediaItem {
  id: string;
  file?: File;
  name: string;
  previewUrl: string;
  status: DraftMediaStatus;
  assetUrl?: string;
  error?: string;
  sizeBytes?: number;
  compressedBytes?: number;
  objectUrl?: boolean;
}
export interface DraftMediaSummary {pending: boolean; failed: boolean; uploaded: number; total: number;}
export interface DraftMediaSnapshot {draftId: string; items: DraftMediaItem[]; error?: string;}
export interface DraftMediaOptions {
  entityType: string;
  draftPrefix: string;
  relationRole: string;
  existingName: string;
  maxCount: number;
  /** Hydrate once when the uploader mounts; later resets must be explicit. */
  initialUrls?: readonly string[];
  enabled?: boolean;
  disabled?: boolean;
  onUrlsChange: (urls: string[]) => void;
  onStateChange?: (state: DraftMediaSummary) => void;
}
interface DraftMediaDependencies {
  id: () => string;
  compress: (file: File) => Promise<CompressedImage>;
  validate: (file: File) => ImageValidationResult;
  replace: (input: {entityType: string; entityId: string; relationRole: string; images: string[]}, signal: AbortSignal) => Promise<{urls: string[]}>;
  createObjectURL: (file: File) => string;
  revokeObjectURL: (url: string) => void;
}
interface UploadScope {
  draftId: string;
  entityType: string;
  relationRole: string;
  abort: AbortController;
  queue: Promise<void>;
}

export function draftMediaUrls(items: readonly DraftMediaItem[]): string[] {
  return items.flatMap((item) => item.status === "uploaded" && item.assetUrl ? [item.assetUrl] : []);
}
export function summarizeDraftMedia(items: readonly {status: string}[]): DraftMediaSummary {
  return {
    pending: items.some((item) => ["local", "compressing", "uploading"].includes(item.status)),
    failed: items.some((item) => item.status === "failed"),
    uploaded: items.filter((item) => item.status === "uploaded").length,
    total: items.length,
  };
}

/** One queue per editor revision. Aborting a request cannot undo a server commit;
 * rotating the draft relation identity also prevents an old write touching a new editor. */
export function createDraftMediaUpload(options: () => DraftMediaOptions, deps: DraftMediaDependencies) {
  const listeners = new Set<() => void>();
  let attached = true;
  const newScope = (): UploadScope => ({draftId: `${options().draftPrefix}-${deps.id()}`, entityType: options().entityType, relationRole: options().relationRole, abort: new AbortController(), queue: Promise.resolve()});
  let scope = newScope();
  const existingItems = (urls: readonly string[]): DraftMediaItem[] => urls.map((url, index) => ({id: deps.id(), name: `${options().existingName} ${index + 1}`, previewUrl: url, assetUrl: url, status: "uploaded"}));
  let state: DraftMediaSnapshot = {draftId: scope.draftId, items: existingItems(options().initialUrls ?? [])};
  const current = (owner: UploadScope) => attached && options().enabled !== false && owner === scope && !owner.abort.signal.aborted;
  const currentItem = (owner: UploadScope, id: string) => current(owner) && state.items.some((item) => item.id === id);
  const emit = () => {listeners.forEach((listener) => listener()); options().onStateChange?.(summarizeDraftMedia(state.items));};
  const commit = (items: DraftMediaItem[], error?: string) => {state = {...state, items, error}; emit();};
  const updateItem = (id: string, changes: Partial<DraftMediaItem>) => commit(state.items.map((item) => item.id === id ? {...item, ...changes} : item));
  const release = (items: readonly DraftMediaItem[]) => items.forEach((item) => {if (item.objectUrl) deps.revokeObjectURL(item.previewUrl);});
  const replace = (owner: UploadScope, images: string[]) => deps.replace({entityType: owner.entityType, entityId: owner.draftId, relationRole: owner.relationRole, images}, owner.abort.signal);
  const enqueue = (owner: UploadScope, task: () => Promise<void>) => {
    owner.queue = owner.queue.then(async () => {if (current(owner)) await task();}).catch(() => undefined);
  };
  const upload = async (owner: UploadScope, id: string) => {
    if (!currentItem(owner, id)) return;
    const item = state.items.find((candidate) => candidate.id === id);
    if (!item?.file) return;
    updateItem(id, {status: "compressing", error: undefined});
    try {
      const compressed = await deps.compress(item.file);
      if (!currentItem(owner, id)) return;
      updateItem(id, {status: "uploading", compressedBytes: compressed.sizeBytes});
      const response = await replace(owner, [...draftMediaUrls(state.items), compressed.dataUrl]);
      if (!currentItem(owner, id)) return;
      const assetUrl = response.urls.at(-1);
      if (!assetUrl) throw new Error("媒体服务未返回图片引用，请重试。");
      updateItem(id, {status: "uploaded", error: undefined, assetUrl});
      options().onUrlsChange(draftMediaUrls(state.items));
    } catch (caught) {
      if (!currentItem(owner, id)) return;
      updateItem(id, {status: "failed", error: caught instanceof Error ? caught.message : "图片上传失败，请重试。"});
    }
  };
  const editable = () => attached && options().enabled !== false && !options().disabled;
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};},
    getDraftId: () => scope.draftId,
    isCurrentDraft: (draftId: string) => current(scope) && draftId === scope.draftId,
    isBlocking: () => {const summary = summarizeDraftMedia(state.items); return summary.pending || summary.failed;},
    reset: (urls: string[] = []) => {
      scope.abort.abort();
      release(state.items);
      scope = newScope();
      state = {draftId: scope.draftId, items: existingItems(urls)};
      emit();
    },
    addFiles: (files: File[]) => {
      if (!editable() || !files.length) return;
      if (state.items.length + files.length > options().maxCount) {
        commit(state.items, `最多上传 ${options().maxCount} 张图片，本次未添加，请分批选择。`);
        return;
      }
      const items: DraftMediaItem[] = files.map((file) => {
        const validation = deps.validate(file);
        return {id: deps.id(), file, name: file.name, previewUrl: deps.createObjectURL(file), objectUrl: true, sizeBytes: file.size, status: validation.ok ? "local" : "failed", error: validation.ok ? undefined : validation.message};
      });
      commit([...state.items, ...items], undefined);
      const owner = scope;
      items.filter((item) => item.status === "local").forEach((item) => enqueue(owner, () => upload(owner, item.id)));
    },
    retry: (id: string) => {
      if (!editable() || !state.items.some((item) => item.id === id && item.file && item.status === "failed")) return;
      updateItem(id, {status: "local", error: undefined});
      const owner = scope;
      enqueue(owner, () => upload(owner, id));
    },
    remove: (id: string) => {
      if (!editable()) return;
      const item = state.items.find((candidate) => candidate.id === id);
      if (!item || item.status === "uploading") return;
      release([item]);
      commit(state.items.filter((candidate) => candidate.id !== id));
      options().onUrlsChange(draftMediaUrls(state.items));
      if (item.status !== "uploaded") return;
      const owner = scope;
      // Resolve URLs when this write runs, not when it is queued. Otherwise a
      // deletion racing another upload can erase its newly created relation.
      enqueue(owner, async () => {
        try {await replace(owner, draftMediaUrls(state.items));}
        catch {if (current(owner)) commit(state.items, "图片引用删除同步失败；保存时仍按当前列表提交。");}
      });
    },
    attach: () => {attached = true;},
    detach: () => {attached = false;},
    dispose: () => {attached = false; scope.abort.abort(); release(state.items); state = {...state, items: []}; listeners.clear();},
  };
}
