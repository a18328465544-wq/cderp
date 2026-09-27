import {ErpBarcodeScannerDialog, type ErpBarcodeScannerDialogProps} from "@/src/components/common";

export type SalesOutboundCameraDialogProps = Pick<ErpBarcodeScannerDialogProps, "open" | "onOpenChange" | "onDetected">;
const SALES_BARCODE_FORMATS = ["qr_code", "code_128", "code_39", "ean_13", "data_matrix"] as const;

/** Sales-specific copy stays local; camera lifecycle stays shared. */
export function SalesOutboundCameraDialog(props: SalesOutboundCameraDialogProps) {
  return <ErpBarcodeScannerDialog
    {...props}
    title="摄像头扫码"
    description="识别库存 ID、SN、条形码或二维码；识别成功后自动加入当前核验。"
    formats={SALES_BARCODE_FORMATS}
    unsupportedMessage="当前浏览器不支持摄像头条码识别，请使用扫码枪或粘贴 SN。"
  />;
}
