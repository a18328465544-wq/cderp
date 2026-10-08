import {useEffect, useRef, useState, useSyncExternalStore} from "react";
import {mediaApi} from "@/src/services/api";
import {compressImageFile, IMAGE_ACCEPTED_MIME_TYPES, IMAGE_MAX_COUNT, validateImageFile} from "@/src/lib/media/image-compression";
import {createDraftMediaUpload, summarizeDraftMedia, type DraftMediaOptions} from "@/src/lib/media/draftMediaUpload";

export function useDraftMediaUpload(options: Omit<DraftMediaOptions, "maxCount"> & {maxCount?: number}) {
  const latest = useRef(options);
  latest.current = options;
  const [controller] = useState(() => createDraftMediaUpload(() => ({...latest.current, maxCount: latest.current.maxCount ?? IMAGE_MAX_COUNT}), {
    id: () => typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    validate: validateImageFile,
    compress: compressImageFile,
    replace: mediaApi.replace,
    createObjectURL: (file) => URL.createObjectURL(file),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  }));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const generation = useRef(0);
  useEffect(() => {
    const lease = ++generation.current;
    controller.attach();
    return () => {
      controller.detach();
      // Keep React StrictMode's synchronous effect replay from releasing live
      // previews; a real unmount cancels requests and releases them once.
      queueMicrotask(() => {if (lease === generation.current) controller.dispose();});
    };
  }, [controller]);
  return {...snapshot, ...summarizeDraftMedia(snapshot.items), reset: controller.reset, addFiles: controller.addFiles, retry: controller.retry, remove: controller.remove,
    isBlocking: controller.isBlocking, getDraftId: controller.getDraftId, isCurrentDraft: controller.isCurrentDraft,
    blocking: controller.isBlocking(), accept: IMAGE_ACCEPTED_MIME_TYPES.join(",")};
}
