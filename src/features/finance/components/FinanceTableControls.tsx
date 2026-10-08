import type {ColumnDef, VisibilityState} from "@tanstack/react-table";
import {Button} from "@/src/components/ui";
import {ErpColumnVisibilityMenu} from "@/src/components/common";
import {ErpDialogShell} from "@/src/components/common";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {useState} from "react";

type FinanceTableControlsProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  visibility: VisibilityState;
  onVisibilityChange: (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => void;
  density: "comfortable" | "compact";
  onDensityChange: (value: "comfortable" | "compact") => void;
};

/** Shared finance table preferences control; it contains no finance data rules. */
export function FinanceTableControls<TData>({
  columns,
  visibility,
  onVisibilityChange,
  density,
  onDensityChange,
}: FinanceTableControlsProps<TData>) {
  const phone = useErpPhone();
  const [open, setOpen] = useState(false);
  const controls = (
    <div className="flex items-center gap-2">
      <ErpColumnVisibilityMenu columns={columns} visibility={visibility} onVisibilityChange={onVisibilityChange} />
      <div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5">
        <Button
          type="button"
          size="sm"
          variant={density === "comfortable" ? "secondary" : "ghost"}
          onClick={() => onDensityChange("comfortable")}
        >
          舒适
        </Button>
        <Button
          type="button"
          size="sm"
          variant={density === "compact" ? "secondary" : "ghost"}
          onClick={() => onDensityChange("compact")}
        >
          紧凑
        </Button>
      </div>
    </div>
  );
  return phone ? <><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>列表设置</Button><ErpDialogShell open={open} onOpenChange={setOpen} title="列表设置" mobilePresentation="sheet">{controls}</ErpDialogShell></> : controls;
}
