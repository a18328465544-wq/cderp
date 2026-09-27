import {purchasePersonalSourceValues, type PurchasePersonalSource} from "../types/purchase";

/** A purchase from a person is settled against a customer, not a vendor. */
export function isPersonalPurchaseSource(value: unknown): value is PurchasePersonalSource {
  return typeof value === "string" && purchasePersonalSourceValues.includes(value as PurchasePersonalSource);
}
