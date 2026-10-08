export type BarcodeSource = HTMLVideoElement | ImageData;
export interface BarcodeResult {rawValue?: string}
export interface BarcodeDecoder {
  detect(source: BarcodeSource): Promise<readonly BarcodeResult[]>;
  dispose(): void;
}
export interface NativeBarcodeDetector {
  new(options: {formats: string[]}): {detect(source: BarcodeSource): Promise<readonly BarcodeResult[]>};
  getSupportedFormats?: () => Promise<readonly string[]>;
}

interface BarcodeDecoderOptions {
  signal: AbortSignal;
  native?: NativeBarcodeDetector;
  loadFallback?: (formats: readonly string[], signal: AbortSignal) => Promise<BarcodeDecoder>;
  now?: () => number;
  onPreparing?: (preparing: boolean) => void;
  unsupportedMessage?: string;
}

export function barcodeAbortError() {
  return new DOMException("Scanner session closed", "AbortError");
}

function bounded<T>(operation: Promise<T>, signal: AbortSignal, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {reject(barcodeAbortError()); return;}
    const finish = (callback: () => void) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      callback();
    };
    const abort = () => finish(() => reject(barcodeAbortError()));
    const timer = setTimeout(() => finish(() => reject(new Error("Barcode detection timed out"))), timeoutMs);
    signal.addEventListener("abort", abort, {once: true});
    operation.then((value) => finish(() => resolve(value)), (error: unknown) => finish(() => reject(error)));
  });
}

/** Native capability is optional. The heavy WASM adapter stays behind a dynamic
 * import and is never requested by the normal page or a working native scan. */
export async function createBarcodeDecoder(formats: readonly string[], options: BarcodeDecoderOptions): Promise<BarcodeDecoder> {
  const {signal, native, onPreparing} = options;
  const now = options.now ?? (() => performance.now());
  const loadFallback = options.loadFallback ?? (async (requested, sessionSignal) => {
    if (typeof WebAssembly === "undefined") throw new Error(options.unsupportedMessage || "当前浏览器无法运行扫码识别，请使用扫码枪或手动输入 SN。");
    const {createWasmBarcodeDecoder} = await import("./barcodeScannerWasm");
    if (sessionSignal.aborted) throw barcodeAbortError();
    return createWasmBarcodeDecoder(requested, sessionSignal);
  });
  let nativeDecoder: InstanceType<NativeBarcodeDetector> | undefined;
  if (native) {
    try {
      const supported = native.getSupportedFormats ? await bounded(native.getSupportedFormats(), signal, 2000) : formats;
      if (formats.every((format) => supported.includes(format))) {
        let instance: InstanceType<NativeBarcodeDetector> | undefined;
        nativeDecoder = {detect(source) {
          // Keep construction after video playback (or explicit photo input),
          // so late camera/playback permissions cannot start a hidden detector.
          if (!instance) {
            try {instance = new native({formats: [...formats]});}
            catch (error) {nativeDecoder = undefined; return Promise.reject(error);}
          }
          return instance.detect(source);
        }};
      }
    } catch {
      // An exposed constructor does not guarantee support for the requested formats.
    }
  }
  if (signal.aborted) throw barcodeAbortError();

  let disposed = false;
  let fallback: BarcodeDecoder | undefined;
  let fallbackPromise: Promise<BarcodeDecoder> | undefined;
  const dispose = () => {disposed = true; fallback?.dispose(); signal.removeEventListener("abort", dispose);};
  signal.addEventListener("abort", dispose, {once: true});
  const ensureFallback = () => {
    if (!fallbackPromise) {
      onPreparing?.(true);
      fallbackPromise = loadFallback(formats, signal).then((decoder) => {
        if (disposed || signal.aborted) {decoder.dispose(); throw barcodeAbortError();}
        fallback = decoder;
        nativeDecoder = undefined;
        return decoder;
      }).finally(() => {if (!disposed) onPreparing?.(false);});
    }
    return fallbackPromise;
  };
  if (!nativeDecoder) {
    try {await ensureFallback();} catch (error) {dispose(); throw error;}
  }
  let emptySince: number | undefined;
  let failures = 0;
  // One frame at a time, including photos selected while a video frame is decoding.
  let queued: Promise<unknown> = Promise.resolve();
  const detectFrame = async (source: BarcodeSource): Promise<readonly BarcodeResult[]> => {
    if (disposed || signal.aborted) throw barcodeAbortError();
    if (nativeDecoder) {
      try {
        const results = await bounded(nativeDecoder.detect(source), signal, 1200);
        if (disposed) throw barcodeAbortError();
        failures = 0;
        if (results.some((result) => result.rawValue?.trim())) return results;
        emptySince ??= now();
        // A photo has no following frame. Give the compatibility engine a turn now.
        if (!("data" in source) && now() - emptySince < 2500) return [];
      } catch (error) {
        if (disposed || signal.aborted) throw barcodeAbortError();
        failures++;
        if (nativeDecoder && failures < 3 && !(error instanceof Error && error.message.includes("timed out"))) return [];
      }
    }
    const decoder = await ensureFallback();
    if (disposed || signal.aborted) throw barcodeAbortError();
    const results = await decoder.detect(source);
    if (disposed || signal.aborted) throw barcodeAbortError();
    return results;
  };
  return {
    detect(source) {
      const result = queued.then(() => detectFrame(source));
      queued = result.catch(() => undefined);
      return result;
    },
    dispose,
  };
}
