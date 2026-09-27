import type {InspectionFormValues, InspectionWorkspace} from "@/src/types/inspection";
import {adaptInspectionCreateResult, adaptInspectionWorkspace, toInspectionCreateRequestDto, toInspectionUpdateRequestDto} from "../adapters/inspection.adapter";
import {apiRequest} from "../client";
import type {InspectionCreateResponseDto} from "../dto/inspection.dto";
import type {PublicStateResponseDto} from "../dto/state.dto";

export const inspectionApi = {
  async workspace(signal?: AbortSignal): Promise<InspectionWorkspace> {
    const response = await apiRequest<PublicStateResponseDto>("/api/inspections/workspace", {signal});
    return adaptInspectionWorkspace(response);
  },

  async create(values: InspectionFormValues, signal?: AbortSignal) {
    const request = toInspectionCreateRequestDto(values);
    const response = await apiRequest<InspectionCreateResponseDto>("/api/inspections", {method: "POST", body: JSON.stringify(request), signal});
    return adaptInspectionCreateResult(response.data);
  },

  async update(id: string, values: InspectionFormValues, expectedRecordVersion: number, signal?: AbortSignal) {
    const request = toInspectionUpdateRequestDto(values, expectedRecordVersion);
    const response = await apiRequest<InspectionCreateResponseDto>(`/api/inspections/${encodeURIComponent(id)}`, {method: "PUT", body: JSON.stringify(request), signal});
    return adaptInspectionCreateResult(response.data);
  },
};
