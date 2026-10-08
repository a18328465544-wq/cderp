import {BarcodeDetector, prepareZXingModule, type BarcodeFormat} from "barcode-detector/ponyfill";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import type {BarcodeWorkerRequest, BarcodeWorkerResponse} from "./barcodeScannerTypes";

const scope = globalThis as unknown as {
  postMessage(message: BarcodeWorkerResponse): void;
  onmessage: ((event: MessageEvent<BarcodeWorkerRequest>) => void) | null;
};
let detector: Promise<BarcodeDetector> | undefined;

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "init") {
    detector = (async () => {
      const supported = await BarcodeDetector.getSupportedFormats();
      if (!message.formats.length || !message.formats.every((format) => supported.includes(format as BarcodeFormat))) throw new Error("Unsupported barcode formats");
      // The reader binary is a version-matched Vite asset on our own origin.
      await prepareZXingModule({overrides: {locateFile: () => wasmUrl}, fireImmediately: true});
      return new BarcodeDetector({formats: message.formats as BarcodeFormat[]});
    })();
    void detector.then(() => scope.postMessage({type: "ready"}), () => scope.postMessage({type: "error"}));
    return;
  }
  void (async () => {
    try {
      if (!detector) throw new Error("Decoder not initialized");
      const results = await (await detector).detect(message.image);
      scope.postMessage({type: "result", id: message.id, results: results.map(({rawValue}) => ({rawValue}))});
    } catch {scope.postMessage({type: "error", id: message.id});}
  })();
};
