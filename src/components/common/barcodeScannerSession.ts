type BarcodeFrame = Readonly<{rawValue?: string}>;

/** A camera frame belongs to the session that started it, not the next open
 * dialog. Deliver synchronously after the post-await ownership check so a
 * closed session cannot call the current form's latest callback. */
export async function deliverActiveBarcode<Source>(
  source: Source,
  detect: (source: Source) => Promise<readonly BarcodeFrame[]>,
  isActive: () => boolean,
  onDetected: (code: string) => void,
) {
  if (!isActive()) return false;
  const result = await detect(source);
  if (!isActive()) return false;
  const value = result.find((item) => item.rawValue?.trim())?.rawValue?.trim();
  if (!value) return false;
  onDetected(value);
  return true;
}
