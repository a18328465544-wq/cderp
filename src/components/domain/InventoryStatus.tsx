import {ErpStatusBadge} from "@/src/components/common";
import {inventoryInspectionPendingStatusValues, inventoryRepairStatusValues, inventoryReturnBlockedStatusValues} from "@/src/types/inventory";
import type {InventoryStatusValue} from "@/src/types/index";

const toneForStatus = (status: InventoryStatusValue) => {
  if (inventoryInspectionPendingStatusValues.includes(status as (typeof inventoryInspectionPendingStatusValues)[number])) return "warning" as const;
  if (inventoryReturnBlockedStatusValues.includes(status as (typeof inventoryReturnBlockedStatusValues)[number])) return "neutral" as const;
  if (inventoryRepairStatusValues.includes(status as (typeof inventoryRepairStatusValues)[number])) return "danger" as const;
  return "success" as const;
};

export function InventoryStatus({status}: {status: InventoryStatusValue}) {
  return <ErpStatusBadge label={status} tone={toneForStatus(status)} />;
}
