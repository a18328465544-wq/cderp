import type {BarcodeResult} from "./barcodeDecoder";

export type BarcodeWorkerRequest = {type: "init"; formats: readonly string[]} | {type: "detect"; id: number; image: ImageData};
export type BarcodeWorkerResponse = {type: "ready"} | {type: "result"; id: number; results: readonly BarcodeResult[]} | {type: "error"; id?: number};
