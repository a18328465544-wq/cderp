import {useErpPhone} from "@/src/hooks/useErpViewport";
import {ErpSearchInput} from "./ErpSearchInput";
import {useEffect, useId, useRef, useState} from "react";
import {Camera, ImageUp, RefreshCw} from "lucide-react";
import {Button} from "@/src/components/ui";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {ErpDialogShell} from "./ErpDialogShell";
import {deliverActiveBarcode} from "./barcodeScannerSession";
import {barcodeScannerErrorMessage} from "./barcodeScannerError";
import {createBarcodeDecoder, type BarcodeDecoder, type NativeBarcodeDetector} from "./barcodeDecoder";
import {readBarcodeImage} from "./barcodeScannerFrames";

export const DEFAULT_BARCODE_FORMATS = ["qr_code", "code_128", "code_39", "code_93", "ean_13", "ean_8", "data_matrix"] as const;

export interface ErpBarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
  title?: string;
  description?: string;
  formats?: readonly string[];
  /** Fallback guidance for environments without either decoding engine. */
  unsupportedMessage?: string;
}

export function ErpBarcodeScannerDialog({open, onOpenChange, onDetected, title = "摄像头扫码", description = "识别条形码或二维码，识别成功后回填当前字段。", formats = DEFAULT_BARCODE_FORMATS, unsupportedMessage = "当前浏览器不支持摄像头条码识别，请使用扫码枪或手动输入 SN。"}: ErpBarcodeScannerDialogProps) {
  const phone = useErpPhone();
  const manualId = useId();
  const [manualCode, setManualCode] = useState("");
  useEffect(() => {if (open) setManualCode("");}, [open]);
  const {active: tabActive} = useWorkspaceTabActivity();
  const cameraEnabled = open && tabActive;
  const cameraEnabledRef = useRef(cameraEnabled);
  cameraEnabledRef.current = cameraEnabled;
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const photoScanRef = useRef<((file: File) => Promise<void>) | undefined>(undefined);
  const deliverCodeRef = useRef<((code: string) => void) | undefined>(undefined);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [photoPending, setPhotoPending] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [attempt, setAttempt] = useState(0);
  // Keep the camera session tied to the visible, active Tab, not callback identity. Some
  // feature forms intentionally provide inline handlers and should not cause
  // an active camera stream to restart on every form render. Keep the opening
  // intent in the parent so returning to a kept-alive Tab starts a fresh stream.
  const callbacksRef = useRef({onDetected, onOpenChange});
  callbacksRef.current = {onDetected, onOpenChange};
  const scannerConfigRef = useRef({formats, unsupportedMessage});
  scannerConfigRef.current = {formats, unsupportedMessage};

  useEffect(() => {
    if (!cameraEnabled) return;
    let active = true;
    const controller = new AbortController();
    let stream: MediaStream | undefined;
    let decoder: BarcodeDecoder | undefined;
    let sessionVideo: HTMLVideoElement | null = null;
    let animationFrame = 0;
    let nextFrameAt = 0;
    let photoInFlight = false;
    const isActive = () => active && !controller.signal.aborted && cameraEnabledRef.current;
    const releaseCamera = () => {
      const ownedStream = stream;
      stream = undefined;
      ownedStream?.getTracks().forEach((track) => track.stop());
      if (ownedStream && sessionVideo?.srcObject === ownedStream) sessionVideo.srcObject = null;
    };
    const deliverCode = (value: string) => {
      if (!isActive()) return;
      active = false;
      cameraEnabledRef.current = false;
      controller.abort();
      releaseCamera();
      callbacksRef.current.onDetected(value);
      callbacksRef.current.onOpenChange(false);
    };
    deliverCodeRef.current = deliverCode;
    setStarting(true);
    setError("");
    setPhotoError("");
    setPhotoPending(false);
    const Detector = (globalThis as unknown as {BarcodeDetector?: NativeBarcodeDetector}).BarcodeDetector;
    const decoderReady = createBarcodeDecoder(scannerConfigRef.current.formats, {
      native: Detector,
      signal: controller.signal,
      unsupportedMessage: scannerConfigRef.current.unsupportedMessage,
      onPreparing: (preparing) => {if (isActive()) setStarting(preparing);},
    });
    const scanPhoto = async (file: File) => {
      if (!isActive() || photoInFlight) return;
      photoInFlight = true;
      setPhotoPending(true);
      setPhotoError("");
      try {
        const image = await readBarcodeImage(file, controller.signal);
        const imageDecoder = await decoderReady;
        if (!isActive()) return;
        const delivered = await deliverActiveBarcode(image, (source) => imageDecoder.detect(source), isActive, deliverCode);
        if (!delivered && isActive()) setPhotoError("图片中没有识别到条码，请拍清条码并保留两侧白边，或手动输入 SN。");
      } catch (caught) {
        if (isActive()) setPhotoError(barcodeScannerErrorMessage(caught));
      } finally {
        photoInFlight = false;
        if (isActive()) setPhotoPending(false);
      }
    };
    photoScanRef.current = scanPhoto;
    const start = async () => {
      try {
        decoder = await decoderReady;
        if (!isActive()) {decoder.dispose(); return;}
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前环境无法访问摄像头，请确认使用 HTTPS 或本机地址。");
        const acquiredStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: "environment"}, width: {ideal: 1280}, height: {ideal: 720}}, audio: false});
        if (!isActive() || !videoRef.current) {
          acquiredStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = acquiredStream;
        const video = videoRef.current;
        sessionVideo = video;
        video.srcObject = stream;
        await video.play();
        if (!isActive() || videoRef.current !== video) return;
        const scan = async (timestamp: number) => {
          if (!isActive() || videoRef.current !== video) return;
          if (photoInFlight || timestamp < nextFrameAt) {
            animationFrame = requestAnimationFrame((time) => {void scan(time);});
            return;
          }
          nextFrameAt = timestamp + 125;
          try {
            const delivered = await deliverActiveBarcode(video, (source) => decoder!.detect(source), () => isActive() && !photoInFlight && videoRef.current === video, deliverCode);
            if (delivered) return;
          } catch (caught) {
            if (isActive()) {releaseCamera(); setError(barcodeScannerErrorMessage(caught));}
            return;
          }
          if (isActive()) animationFrame = requestAnimationFrame((time) => {void scan(time);});
        };
        animationFrame = requestAnimationFrame((time) => {void scan(time);});
      } catch (caught) {
        releaseCamera();
        if (isActive()) setError(barcodeScannerErrorMessage(caught));
      } finally {
        if (isActive()) setStarting(false);
      }
    };
    void start();
    return () => {
      active = false;
      controller.abort();
      cancelAnimationFrame(animationFrame);
      decoder?.dispose();
      releaseCamera();
      if (photoScanRef.current === scanPhoto) photoScanRef.current = undefined;
      if (deliverCodeRef.current === deliverCode) deliverCodeRef.current = undefined;
    };
  }, [cameraEnabled, attempt]);

  return <ErpDialogShell
    open={open}
    onOpenChange={onOpenChange}
    title={<span className="flex items-center gap-2"><Camera className="h-4 w-4 text-[var(--erp-color-primary)]" />{title}</span>}
    description={description}
    size="md"
    mobilePresentation="fullscreen"
    footer={<Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>关闭</Button>}
  >
    <div data-erp-component="barcode-scanner-camera" className="relative aspect-video overflow-hidden rounded-[var(--erp-radius-lg)] bg-black"><video ref={videoRef} muted playsInline className="h-full w-full object-cover" />{starting && <div role="status" className="absolute inset-0 flex items-center justify-center text-sm text-white"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />正在准备扫码</div>}{error && !starting && <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-white"><Camera className="h-7 w-7" /><span>摄像头暂不可用</span><span className="text-xs">可从图片识别或手动输入</span></div>}</div>
    <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/bmp" className="hidden" aria-label="选择条码图片" onChange={(event) => {const file = event.target.files?.[0]; event.target.value = ""; if (file) void photoScanRef.current?.(file);}} />
    <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={photoPending} onClick={() => imageInputRef.current?.click()}><ImageUp className="h-4 w-4" />{photoPending ? "正在识别图片…" : "从图片识别"}</Button>{error && <Button type="button" variant="secondary" disabled={starting || photoPending} onClick={() => setAttempt((current) => current + 1)}><RefreshCw className="h-4 w-4" />重试扫码</Button>}</div>
    {phone && <div className="mt-4 space-y-2"><label className="block text-xs font-medium" htmlFor={manualId}>手动输入 SN / 编号</label><div className="flex gap-2"><ErpSearchInput id={manualId} value={manualCode} onChange={(event) => setManualCode(event.target.value)} aria-label="扫码备用输入" placeholder="输入或粘贴序列号" className="min-w-0 flex-1" /><Button type="button" variant="primary" disabled={!manualCode.trim()} onClick={() => deliverCodeRef.current?.(manualCode.trim())}>使用</Button></div></div>}
    {photoError && <p role="alert" className="mt-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]">{photoError}</p>}
    {error && <p role="alert" className="mt-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]">{error}</p>}
  </ErpDialogShell>;
}
