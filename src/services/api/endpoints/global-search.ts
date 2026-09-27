import {apiRequest} from "../client";
import {adaptGlobalSearch} from "../adapters/global-search.adapter";
import type {GlobalSearchResponseDto} from "../dto/global-search.dto";
import type {GlobalSearchSnapshot} from "@/src/types/global-search";

export const globalSearchApi = {
  async search(query: string, signal?: AbortSignal): Promise<GlobalSearchSnapshot> {
    const params = new URLSearchParams({q: query.trim(), limit: "48"});
    const response = await apiRequest<GlobalSearchResponseDto>(`/api/global-search?${params.toString()}`, {signal});
    return adaptGlobalSearch(response);
  },
};
