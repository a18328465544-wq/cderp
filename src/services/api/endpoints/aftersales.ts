import {adaptAftersalesMutation, adaptAftersalesWorkspace, toAftersalesCreateRequest, toAftersalesUpdateRequest} from "../adapters/aftersales.adapter";
import {apiRequest} from "../client";
import type {AftersalesMutationResponseDto, AftersalesStateResponseDto} from "../dto/aftersales.dto";
import type {AftersalesCandidate, AftersalesCreateFormValues, AftersalesResolutionFormValues} from "@/src/types/aftersales";

export const aftersalesApi = {
  async workspace(signal?: AbortSignal) {return adaptAftersalesWorkspace(await apiRequest<AftersalesStateResponseDto>("/api/aftersales/workspace", {signal}));},
  async create(values: AftersalesCreateFormValues, candidate: AftersalesCandidate, handler: string, signal?: AbortSignal) {return adaptAftersalesMutation(await apiRequest<AftersalesMutationResponseDto>("/api/aftersales", {method: "POST", body: JSON.stringify(toAftersalesCreateRequest(values, candidate, handler)), signal}));},
  async resolve(id: string, values: AftersalesResolutionFormValues, handler: string, signal?: AbortSignal) {return adaptAftersalesMutation(await apiRequest<AftersalesMutationResponseDto>(`/api/aftersales/${encodeURIComponent(id)}`, {method: "PATCH", body: JSON.stringify(toAftersalesUpdateRequest(values, handler)), signal}));},
};
