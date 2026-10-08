import type {InspectionFormValues} from "@/src/types/inspection";

/** Each selection/reset owns a new editor, even when returning to the same item. */
export type InspectionDraftScope = {readonly inventoryId: string};
export type InspectionAttempt = {
  readonly scope: InspectionDraftScope;
  readonly values: InspectionFormValues;
  readonly formValues: InspectionFormValues;
  readonly inspectionId?: string;
  readonly expectedRecordVersion?: number;
};

export function snapshotInspectionForm(values: InspectionFormValues): InspectionFormValues {
  const snapshot = {...values, images: [...values.images]};
  Object.freeze(snapshot.images);
  return Object.freeze(snapshot);
}

export function sameInspectionForm(snapshot: InspectionFormValues, current: InspectionFormValues) {
  return (Object.keys(snapshot) as (keyof InspectionFormValues)[]).every((key) => key === "images"
    ? snapshot.images.length === current.images.length && snapshot.images.every((url, index) => url === current.images[index])
    : Object.is(snapshot[key], current[key]));
}

export function createInspectionAttempt(scope: InspectionDraftScope, values: InspectionFormValues, formValues: InspectionFormValues, record?: {id: string; recordVersion: number} | null): InspectionAttempt {
  if (!scope.inventoryId || values.inventoryId !== scope.inventoryId || formValues.inventoryId !== scope.inventoryId) {
    throw new Error("当前表单与所选库存不一致，请重新选择商品");
  }
  return Object.freeze({scope, values: snapshotInspectionForm(values), formValues: snapshotInspectionForm(formValues), inspectionId: record?.id, expectedRecordVersion: record?.recordVersion});
}

export function isCurrentInspectionAttempt(attempt: InspectionAttempt | undefined | null, scope: InspectionDraftScope, values: InspectionFormValues) {
  return Boolean(attempt && attempt.scope === scope && sameInspectionForm(attempt.formValues, values));
}
