import {adaptCreatedCustomer, adaptCreatedVendor, toCustomerCreateRequest, toVendorCreateRequest, type CustomerQuickCreateInput, type VendorQuickCreateInput} from "../adapters/entity-create.adapter";
import {apiRequest} from "../client";
import type {EntityCreateResponseDto} from "../dto/entity-create.dto";
import type {PurchaseSourceOption} from "@/src/types/purchase";

function createdData(response: EntityCreateResponseDto, label: string) {
  if (response.data === undefined || response.data === null) throw new Error(`${label}接口未返回新建档案`);
  return response.data;
}

export const partnersApi = {
  async createCustomer(input: CustomerQuickCreateInput, signal?: AbortSignal): Promise<PurchaseSourceOption> {
    const response = await apiRequest<EntityCreateResponseDto>("/api/customers", {method: "POST", body: JSON.stringify(toCustomerCreateRequest(input)), signal});
    return adaptCreatedCustomer(createdData(response, "客户"));
  },

  async createVendor(input: VendorQuickCreateInput, signal?: AbortSignal): Promise<PurchaseSourceOption> {
    const response = await apiRequest<EntityCreateResponseDto>("/api/vendors", {method: "POST", body: JSON.stringify(toVendorCreateRequest(input)), signal});
    return adaptCreatedVendor(createdData(response, "供应商"));
  },
};
