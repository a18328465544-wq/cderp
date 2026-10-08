/** Translate browser camera failures into actionable, non-technical guidance. */
export function barcodeScannerErrorMessage(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "摄像头未获授权。可在浏览器中允许访问，或使用扫码枪、手动输入 SN。";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "未检测到可用摄像头，请使用扫码枪或手动输入 SN。";
    case "NotReadableError":
    case "TrackStartError":
      return "摄像头暂时无法使用，可能被其他应用占用。请关闭占用应用，或手动输入 SN。";
    case "OverconstrainedError":
      return "当前摄像头不支持所需拍摄模式，请使用扫码枪或手动输入 SN。";
    case "SecurityError":
      return "当前浏览器限制了摄像头访问，请确认使用 HTTPS 或本机地址，也可手动输入 SN。";
    default:
      // Preserve our explicit localized unsupported/environment messages, not raw
      // browser diagnostics such as "Requested device not found".
      if (error instanceof Error && /[\u3400-\u9fff]/.test(error.message)) return error.message;
      return "摄像头启动失败，请关闭后重试，或使用扫码枪、手动输入 SN。";
  }
}
