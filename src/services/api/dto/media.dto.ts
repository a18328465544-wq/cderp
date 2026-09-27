/** Request contract for the existing media replacement endpoint. */
export interface MediaUploadRequestDto {
  entityType: string;
  entityId: string;
  relationRole?: string;
  images: string[];
}

export interface MediaUploadPayloadDto {
  urls?: unknown;
  targetBytes?: unknown;
  maxBytes?: unknown;
}

export interface MediaUploadResponseDto {
  data?: MediaUploadPayloadDto;
}

export interface MediaRelationDto {
  id?: unknown;
  mimeType?: unknown;
  originalName?: unknown;
  sizeBytes?: unknown;
  width?: unknown;
  height?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  relationRole?: unknown;
  sortOrder?: unknown;
}
