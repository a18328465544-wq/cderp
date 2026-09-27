import {ErpBarcodeScannerDialog, type ErpBarcodeScannerDialogProps} from "@/src/components/common";

export type InspectionSnCameraDialogProps = Pick<ErpBarcodeScannerDialogProps, "open" | "onOpenChange" | "onDetected">;

/** Inspection-specific copy stays local; camera lifecycle stays shared. */
export function InspectionSnCameraDialog(props: InspectionSnCameraDialogProps) {
  return <ErpBarcodeScannerDialog
    {...props}
    title="扫码录入实物 SN"
    description="识别条形码或二维码；识别成功后只回填当前检测表单。"
  />;
}
