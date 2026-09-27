import {IMAGE_MAX_COUNT} from "@/src/lib/media/image-compression";

export const PURCHASE_MEDIA_ENTITY_TYPE = "purchase_draft";
export const PURCHASE_MEDIA_RELATION_ROLE = "purchase-evidence";

let draftSequence = 0;

export function createPurchaseDraftId(): string {
  const generated = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : undefined;
  draftSequence += 1;
  return `purchase-draft-${generated || `${Date.now()}-${draftSequence}`}`;
}

export function purchaseMediaFormUrls(items: readonly {status: string; assetUrl?: string}[]): string[] {
  return items.filter((item) => item.status === "uploaded" && Boolean(item.assetUrl)).map((item) => item.assetUrl as string);
}

export function hasBlockingPurchaseMedia(items: readonly {status: string}[]): boolean {
  return items.some((item) => item.status === "compressing" || item.status === "uploading" || item.status === "failed");
}

export {IMAGE_MAX_COUNT};
