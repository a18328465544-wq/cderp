import {useEffect, useRef, useState} from "react";
import {Camera, RefreshCw} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpDialogShell} from "./ErpDialogShell";

interface DetectedBarcode { rawValue?: string }
interface BarcodeDetectorInstance { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> }
interface BarcodeDetectorConstructor { new(options?: {formats?: readonly string[]}): BarcodeDetectorInstance }

export const DEFAULT_BARCODE_FORMATS = ["qr_code", "code_128", "code_39", "code_93", "ean_13", "ean_8", "data_matrix"] as const;

export interface ErpBarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
  title?: string;
  description?: string;
  formats?: readonly string[];
  /** Message shown when the browser cannot provide BarcodeDetector. */
  unsupportedMessage?: string;
}

export function ErpBarcodeScannerDialog({open, onOpenChange, onDetected, title = "摄像头扫码", description = "识别条形码或二维码，识别成功后回填当前字段。", formats = DEFAULT_BARCODE_FORMATS, unsupportedMessage = "当前浏览器不支持摄像头条码识别，请使用扫码枪或手动输入 SN。"}: ErpBarcodeScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  // Keep the camera session tied to `open`, not to callback identity. Some
  // feature forms intentionally provide inline handlers and should not cause
  // an active camera stream to restart on every form render.
  const callbacksRef = useRef({onDetected, onOpenChange});
  callbacksRef.current = {onDetected, onOpenChange};
  const scannerConfigRef = useRef({formats, unsupportedMessage});
  scannerConfigRef.current = {formats, unsupportedMessage};

  useEffect(() => {
    if (!open) return;
    let active = true;
    let stream: MediaStream | undefined;
    let animationFrame = 0;
    const start = async () => {
      setStarting(true);
      setError("");
      try {
        const Detector = (globalThis as unknown as {BarcodeDetector?: BarcodeDetectorConstructor}).BarcodeDetector;
        if (!Detector) throw new Error(scannerConfigRef.current.unsupportedMessage);
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前环境无法访问摄像头，请确认使用 HTTPS 或本机地址。");
        const acquiredStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: "environment"}}, audio: false});
        if (!active || !videoRef.current) {
          acquiredStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = acquiredStream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new Detector({formats: [...scannerConfigRef.current.formats]});
        const scan = async () => {
          if (!active || !videoRef.current) return;
          try {
            const result = await detector.detect(videoRef.current);
            const value = result.find((item) => item.rawValue?.trim())?.rawValue?.trim();
            if (value) {
              callbacksRef.current.onDetected(value);
              callbacksRef.current.onOpenChange(false);
              return;
            }
          } catch {
            // A single frame can fail while the camera focuses.
          }
          animationFrame = requestAnimationFrame(() => {void scan();});
        };
        animationFrame = requestAnimationFrame(() => {void scan();});
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "摄像头启动失败");
      } finally {
        if (active) setStarting(false);
      }
    };
    void start();
    return () => {active = false; cancelAnimationFrame(animationFrame); stream?.getTracks().forEach((track) => track.stop()); if (videoRef.current) videoRef.current.srcObject = null;};
  }, [open]);

  return <ErpDialogShell
    open={open}
    onOpenChange={onOpenChange}
    title={<span className="flex items-center gap-2"><Camera className="h-4 w-4 text-[var(--erp-color-primary)]" />{title}</span>}
    description={description}
    size="md"
    footer={<Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>关闭</Button>}
  >
    <div className="relative aspect-video overflow-hidden rounded-[var(--erp-radius-lg)] bg-black"><video ref={videoRef} muted playsInline className="h-full w-full object-cover" />{starting && <div className="absolute inset-0 flex items-center justify-center text-sm text-white"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />正在启动摄像头</div>}</div>
    {error && <p role="alert" className="mt-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]">{error}</p>}
  </ErpDialogShell>;
}
