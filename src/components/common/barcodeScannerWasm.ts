import {barcodeAbortError, type BarcodeDecoder, type BarcodeResult} from "./barcodeDecoder";
import {createBarcodeFrameReader} from "./barcodeScannerFrames";
import type {BarcodeWorkerRequest, BarcodeWorkerResponse} from "./barcodeScannerTypes";

export function createWasmBarcodeDecoder(formats: readonly string[], signal: AbortSignal): Promise<BarcodeDecoder> {
  if (signal.aborted) return Promise.reject(barcodeAbortError());
  if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") return Promise.reject(new Error("当前浏览器无法运行扫码识别，请使用扫码枪或手动输入 SN。"));
  return new Promise((resolve, reject) => {
    const readFrame = createBarcodeFrameReader();
    const worker = new Worker(new URL("./barcodeScanner.worker.ts", import.meta.url), {type: "module"});
    const pending = new Map<number, {resolve: (results: readonly BarcodeResult[]) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>}>();
    let id = 0;
    let disposed = false;
    const dispose = (error: Error = barcodeAbortError()) => {
      if (disposed) return;
      disposed = true;
      clearTimeout(startupTimer);
      worker.terminate();
      signal.removeEventListener("abort", abort);
      pending.forEach((request) => {clearTimeout(request.timer); request.reject(error);});
      pending.clear();
      reject(error);
    };
    const abort = () => dispose();
    const fail = () => dispose(new Error("扫码识别组件加载失败，请重试，或手动输入 SN。"));
    const startupTimer = setTimeout(fail, 15000);
    signal.addEventListener("abort", abort, {once: true});
    worker.onerror = fail;
    worker.onmessageerror = fail;
    worker.onmessage = (event: MessageEvent<BarcodeWorkerResponse>) => {
      const message = event.data;
      if (disposed) return;
      if (message.type === "ready") {
        clearTimeout(startupTimer);
        resolve({
          detect(source) {
            if (disposed) return Promise.reject(barcodeAbortError());
            const image = "data" in source ? source : readFrame(source);
            if (!image) return Promise.resolve([]);
            const requestId = ++id;
            return new Promise((fulfill, failRequest) => {
              const timer = setTimeout(() => dispose(new Error("扫码识别超时，请重试，或手动输入 SN。")), 5000);
              pending.set(requestId, {resolve: fulfill, reject: failRequest, timer});
              const request: BarcodeWorkerRequest = {type: "detect", id: requestId, image};
              try {worker.postMessage(request, [image.data.buffer as ArrayBuffer]);} catch {fail();}
            });
          },
          dispose: () => dispose(),
        });
      } else if (message.type === "error" && message.id === undefined) fail();
      else if (message.type === "result" || message.type === "error") {
        const request = message.id === undefined ? undefined : pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timer);
        pending.delete(message.id!);
        if (message.type === "result") request.resolve(message.results);
        else request.reject(new Error("当前画面无法识别，请调整距离或重新拍摄。"));
      }
    };
    const request: BarcodeWorkerRequest = {type: "init", formats};
    worker.postMessage(request);
  });
}
