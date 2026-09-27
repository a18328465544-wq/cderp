import type {MediaUploadRequestDto, MediaUploadResponseDto} from "../dto/media.dto";

export interface MediaUploadInput {
  entityType: string;
  entityId: string;
  relationRole?: string;
  images: string[];
}

export interface MediaUploadResult {
  urls: string[];
  targetBytes: number;
  maxBytes: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function toMediaUploadRequest(input: MediaUploadInput): MediaUploadRequestDto {
  return {
    entityType: input.entityType.trim(),
    entityId: input.entityId.trim(),
    relationRole: input.relationRole?.trim() || undefined,
    images: input.images.filter((url) => Boolean(url.trim())),
  };
}

export function adaptMediaUploadResponse(response: MediaUploadResponseDto | unknown): MediaUploadResult {
  const payload = record(record(response).data);
  const urls = Array.isArray(payload.urls)
    ? payload.urls.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  return {
    urls,
    targetBytes: positiveNumber(payload.targetBytes, 100_000),
    maxBytes: positiveNumber(payload.maxBytes, 110_000),
  };
}
