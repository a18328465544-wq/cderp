const MAX_FRAME_EDGE = 1280;
export const MAX_BARCODE_IMAGE_BYTES = 12 * 1024 * 1024;

export function barcodeFrameSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const scale = Math.min(1, MAX_FRAME_EDGE / Math.max(width, height));
  return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}

/** Keep full barcode quiet zones; resize the frame without cropping its edges. */
export function createBarcodeFrameReader() {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", {willReadFrequently: true});
  if (!context) throw new Error("当前浏览器无法读取扫码画面，请使用手动输入。");
  return (video: HTMLVideoElement) => {
    const size = barcodeFrameSize(video.videoWidth, video.videoHeight);
    if (!size || video.readyState < 2) return null;
    canvas.width = size.width;
    canvas.height = size.height;
    context.drawImage(video, 0, 0, size.width, size.height);
    return context.getImageData(0, 0, size.width, size.height);
  };
}

export async function readBarcodeImage(file: File, signal: AbortSignal) {
  if (file.size > MAX_BARCODE_IMAGE_BYTES) throw new Error("图片不能超过 12MB，请选择较小的图片。");
  if (!/image\/(?:png|jpeg|webp|bmp)/.test(file.type)) throw new Error("请选择 JPG、PNG、WEBP 或 BMP 图片。");
  if (signal.aborted) throw new DOMException("Scanner session closed", "AbortError");
  let bitmap: ImageBitmap;
  try {bitmap = await createImageBitmap(file);}
  catch {throw new Error("图片无法读取，请重新拍摄或选择 JPG、PNG 图片。");}
  try {
    if (signal.aborted) throw new DOMException("Scanner session closed", "AbortError");
    const size = barcodeFrameSize(bitmap.width, bitmap.height);
    if (!size) throw new Error("图片无法读取，请重新拍摄。");
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", {willReadFrequently: true});
    if (!context) throw new Error("图片无法读取，请重新拍摄。");
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    return context.getImageData(0, 0, size.width, size.height);
  } finally {bitmap.close();}
}
