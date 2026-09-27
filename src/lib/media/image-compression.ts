import {imageMimeTypeValues, type ImageMimeType} from "@/src/types/media";

export const IMAGE_MAX_INPUT_BYTES = 12 * 1024 * 1024;
export const IMAGE_TARGET_BYTES = 100_000;
export const IMAGE_MAX_STORED_BYTES = 110_000;
export const IMAGE_MAX_COUNT = 6;
export const IMAGE_MAX_DIMENSION = 1_440;

export const IMAGE_ACCEPTED_MIME_TYPES = imageMimeTypeValues;
export type AcceptedImageMimeType = ImageMimeType;

export interface ImageFileLike {
  type: string;
  size: number;
  name?: string;
}

export type ImageValidationResult =
  | {ok: true}
  | {ok: false; code: "unsupported-type" | "input-too-large" | "empty"; message: string};

export interface CompressedImage {
  dataUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
}

function isAcceptedMimeType(type: string): type is AcceptedImageMimeType {
  return (IMAGE_ACCEPTED_MIME_TYPES as readonly string[]).includes(type.toLowerCase());
}

export function validateImageFile(file: ImageFileLike): ImageValidationResult {
  if (!file || file.size <= 0) return {ok: false, code: "empty", message: "图片文件为空，请重新选择。"};
  if (!isAcceptedMimeType(file.type)) return {ok: false, code: "unsupported-type", message: "仅支持 JPG、PNG 或 WEBP 图片。"};
  if (file.size > IMAGE_MAX_INPUT_BYTES) return {ok: false, code: "input-too-large", message: "原始图片不能超过 12MB。"};
  return {ok: true};
}

/** Calculates the decoded byte length of a base64 data URL without retaining a second buffer. */
export function dataUrlByteLength(dataUrl: string): number {
  const encoded = dataUrl.split(",", 2)[1]?.replace(/\s+/g, "") || "";
  if (!encoded) return 0;
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((encoded.length * 3) / 4) - padding);
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("图片读取失败，请重新选择文件。"));
    };
    reader.onerror = () => reject(reader.error || new Error("图片读取失败，请重新选择文件。"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片解码失败，请换一张图片重试。"));
    image.src = dataUrl;
  });
}

function canvasDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  if (!dataUrl.startsWith("data:image/jpeg;base64,")) throw new Error("图片压缩格式不受支持。");
  return dataUrl;
}

/**
 * Compresses a user-selected image to the server's 100KB target while preserving
 * enough pixels for receipts, labels and cosmetic defects to remain readable.
 * The resulting Data URL is transient and should be discarded after upload.
 */
export async function compressImageFile(file: Blob & ImageFileLike): Promise<CompressedImage> {
  const validation = validateImageFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const sourceUrl = await readAsDataUrl(file);
  const image = await loadImage(sourceUrl);
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("图片尺寸无效，请重新选择文件。");

  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const initialScale = Math.min(1, IMAGE_MAX_DIMENSION / longestSide);
  let width = Math.max(1, Math.round(image.naturalWidth * initialScale));
  let height = Math.max(1, Math.round(image.naturalHeight * initialScale));
  let quality = 0.86;
  const canvas = document.createElement("canvas");

  for (let attempt = 0; attempt < 24; attempt += 1) {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器不支持图片压缩，请更换浏览器重试。");
    context.fillStyle = "white";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvasDataUrl(canvas, quality);
    const sizeBytes = dataUrlByteLength(dataUrl);
    if (sizeBytes <= IMAGE_MAX_STORED_BYTES) return {dataUrl, sizeBytes, width, height};

    if (quality > 0.36) {
      quality = Math.max(0.36, quality - 0.08);
    } else if (Math.max(width, height) > 320) {
      width = Math.max(320, Math.round(width * 0.82));
      height = Math.max(320, Math.round(height * 0.82));
    } else {
      throw new Error("图片压缩后仍超过 110KB，请选择更清晰或更小的图片。");
    }
  }

  throw new Error("图片压缩失败，请重试。");
}
