import {crmLeadPriorityValues, crmLeadStageValues, quickCaptureDeliveryMethodValues, quickCaptureIntentValues, quickCaptureTransactionValues} from "../src/types/crm.ts";
import {productCategoryValues} from "../src/types/core.ts";

/**
 * Provider-neutral JSON contract for the extraction step.
 *
 * The schema is sent as part of the model instructions and the response is
 * validated again before any values reach the business command. This keeps a
 * provider returning extra fields, malformed conflicts or a scalar payload
 * from silently becoming CRM data.
 */
export const QUICK_CAPTURE_AI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fields", "confidence", "conflicts"],
  properties: {
    fields: {
      type: "object",
      additionalProperties: false,
      properties: {
        customerName: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
        wechat: { type: ["string", "null"] },
        qq: { type: ["string", "null"] },
        city: { type: ["string", "null"] },
        company: { type: ["string", "null"] },
        source: { type: ["string", "null"] },
        intentType: { enum: [...quickCaptureIntentValues, null] },
        productCategory: { enum: [...productCategoryValues, null] },
        productName: { type: ["string", "null"] },
        productModel: { type: ["string", "null"] },
        quantity: { type: ["number", "null"] },
        expectedPrice: { type: ["number", "null"] },
        quotedPrice: { type: ["number", "null"] },
        transactionType: { enum: [...quickCaptureTransactionValues, null] },
        deliveryMethod: { enum: [...quickCaptureDeliveryMethodValues, null] },
        followUpTime: { type: ["string", "null"] },
        priority: { enum: [...crmLeadPriorityValues, null] },
        stage: { enum: [...crmLeadStageValues, null] },
        tags: { type: "array", items: { type: "string" }, maxItems: 12 },
        note: { type: ["string", "null"] },
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 100 },
    conflicts: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "values", "message"],
        properties: {
          field: { type: "string" },
          values: { type: "array", items: { type: "string" }, maxItems: 8 },
          message: { type: "string" },
        },
      },
    },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function validateQuickCaptureModelPayload(value: unknown) {
  if (!isRecord(value) || !isRecord(value.fields)) return false;
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence)) return false;
  if (!Array.isArray(value.conflicts)) return false;
  return value.conflicts.every(item => {
    if (!isRecord(item)) return false;
    return typeof item.field === "string" && Array.isArray(item.values) && item.values.every(v => typeof v === "string") && typeof item.message === "string";
  });
}
