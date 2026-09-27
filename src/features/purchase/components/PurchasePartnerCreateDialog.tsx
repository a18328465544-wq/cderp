import {useMutation} from "@tanstack/react-query";
import {useEffect} from "react";
import {ErpPartnerQuickCreateDialog} from "@/src/components/common";
import {ApiError, partnersApi} from "@/src/services/api";
import type {PartnerQuickCreateValues} from "@/src/lib/partnerQuickCreate";
import type {PurchaseSourceOption} from "@/src/types/purchase";
import {quickCreateError} from "../quick-create/quick-create.errors";

/** Purchase-specific adapter for the shared partner quick-create dialog. */
export function PurchasePartnerCreateDialog({open, target, initialName = "", onOpenChange, onCreated}: {open: boolean; target: "customer" | "vendor" | null; initialName?: string; onOpenChange: (open: boolean) => void; onCreated: (option: PurchaseSourceOption) => void}) {
  const mutation = useMutation({mutationFn: async (values: PartnerQuickCreateValues) => target === "vendor"
    ? partnersApi.createVendor({name: values.name, contact: values.contact, vendorType: values.vendorType, remarks: values.remarks})
    : partnersApi.createCustomer({name: values.name, contact: values.contact, channel: values.channel, remarks: values.remarks})});
  const resetMutation = mutation.reset;

  useEffect(() => {
    if (open) resetMutation();
  }, [open, resetMutation]);

  const onSubmit = async (values: PartnerQuickCreateValues) => {
    try {
      const option = await mutation.mutateAsync(values);
      onCreated(option);
      onOpenChange(false);
    } catch {
      // Keep the form and the purchase page intact; the shared dialog renders the error.
    }
  };

  const label = target === "vendor" ? "同行档案" : "个人客户";
  const errorMessage = mutation.error ? quickCreateError(mutation.error, label) : undefined;
  const decoratedError = errorMessage ? `${errorMessage}${mutation.error instanceof ApiError && mutation.error.status === 403 ? " 采购单其他内容不会丢失。" : ""}` : undefined;

  return <ErpPartnerQuickCreateDialog open={open} target={target} initialName={initialName} pending={mutation.isPending} error={decoratedError} onOpenChange={onOpenChange} onSubmit={onSubmit} />;
}
