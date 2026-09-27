import {apiRequest} from "../client";
import {adaptMediaUploadResponse, toMediaUploadRequest, type MediaUploadInput, type MediaUploadResult} from "../adapters/media.adapter";
import type {MediaUploadResponseDto} from "../dto/media.dto";

export const mediaApi = {
  async replace(input: MediaUploadInput, signal?: AbortSignal): Promise<MediaUploadResult> {
    const response = await apiRequest<MediaUploadResponseDto>("/api/media", {
      method: "POST",
      body: JSON.stringify(toMediaUploadRequest(input)),
      signal,
    });
    return adaptMediaUploadResponse(response);
  },
};
