import {Button} from "@/src/components/ui";
import {ErpDialogShell} from "./ErpDialogShell";

export function ErpUnsavedChangesDialog({open, onStay, onLeave, description = "离开后当前表单中的修改会丢失。你可以继续编辑，或确认放弃本次修改。", message = "请确认是否要离开当前页面。"}: {open: boolean; onStay: () => void; onLeave: () => void; description?: string; message?: string}) {
  return <ErpDialogShell
    open={open}
    onOpenChange={(nextOpen) => {if (!nextOpen) onStay();}}
    title="当前内容尚未保存"
    description={description}
    footer={<><Button type="button" variant="secondary" autoFocus onClick={onStay}>继续编辑</Button><Button type="button" variant="danger" onClick={onLeave}>放弃并离开</Button></>}
  >
    <p className="text-sm text-[var(--erp-color-text-secondary)]">{message}</p>
  </ErpDialogShell>;
}
