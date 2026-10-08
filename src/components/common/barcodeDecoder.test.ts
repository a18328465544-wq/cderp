import assert from "node:assert/strict";
import test from "node:test";
import {createBarcodeDecoder, type BarcodeDecoder, type BarcodeSource} from "./barcodeDecoder";
import {barcodeFrameSize, MAX_BARCODE_IMAGE_BYTES} from "./barcodeScannerFrames";

const source = {videoWidth: 640, videoHeight: 480} as HTMLVideoElement;
const formats = ["code_128", "qr_code"];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {resolve = fulfill;});
  return {promise, resolve};
}
function fallback() {
  const calls: BarcodeSource[] = [];
  let disposed = 0;
  const decoder: BarcodeDecoder = {detect: async (frame) => {calls.push(frame); return [{rawValue: "001-AbC"}];}, dispose: () => {disposed++;}};
  return {decoder, calls, disposed: () => disposed};
}

test("working native scans retain raw SN and never load the compatibility engine", async () => {
  let loads = 0;
  class Native {
    static async getSupportedFormats() {return formats;}
    constructor(options: {formats: string[]}) {assert.deepEqual(options.formats, formats);}
    async detect() {return [{rawValue: "001-AbC"}];}
  }
  const decoder = await createBarcodeDecoder(formats, {signal: new AbortController().signal, native: Native, loadFallback: async () => {loads++; return fallback().decoder;}});
  assert.deepEqual(await decoder.detect(source), [{rawValue: "001-AbC"}]);
  assert.equal(loads, 0);
  decoder.dispose();
});

test("missing native API and partially supported formats both initialize one fallback", async () => {
  class PartialNative {
    static async getSupportedFormats() {return ["qr_code"];}
    constructor() {throw new Error("must not construct partial native detector");}
    async detect() {return [];}
  }
  for (const native of [undefined, PartialNative]) {
    const engine = fallback();
    let loads = 0;
    const controller = new AbortController();
    const decoder = await createBarcodeDecoder(formats, {native, signal: controller.signal, loadFallback: async (requested) => {loads++; assert.deepEqual(requested, formats); return engine.decoder;}});
    assert.deepEqual(await decoder.detect(source), [{rawValue: "001-AbC"}]);
    assert.equal(loads, 1);
    controller.abort();
    assert.equal(engine.disposed(), 1);
    await assert.rejects(decoder.detect(source), {name: "AbortError"});
  }
});

test("native construction is deferred until a frame, and a constructor failure falls back immediately", async () => {
  let constructed = 0;
  class Native {
    constructor() {constructed++; throw new Error("native service missing");}
    async detect() {return [];}
  }
  const controller = new AbortController();
  const engine = fallback();
  const decoder = await createBarcodeDecoder(formats, {native: Native, signal: controller.signal, loadFallback: async () => engine.decoder});
  assert.equal(constructed, 0);
  assert.deepEqual(await decoder.detect(source), [{rawValue: "001-AbC"}]);
  assert.equal(constructed, 1);
  assert.equal(engine.calls.length, 1);
  decoder.dispose();
});

test("repeated native failures switch permanently without running both engines per frame", async () => {
  let nativeCalls = 0;
  class Native {async detect(): Promise<never> {nativeCalls++; throw new Error("native service unavailable");}}
  const engine = fallback();
  const decoder = await createBarcodeDecoder(formats, {native: Native, signal: new AbortController().signal, loadFallback: async () => engine.decoder});
  assert.deepEqual(await decoder.detect(source), []);
  assert.deepEqual(await decoder.detect(source), []);
  assert.deepEqual(await decoder.detect(source), [{rawValue: "001-AbC"}]);
  assert.deepEqual(await decoder.detect(source), [{rawValue: "001-AbC"}]);
  assert.equal(nativeCalls, 3);
  assert.equal(engine.calls.length, 2);
  decoder.dispose();
});

test("sustained empty native frames and an empty photo both receive a fallback decode", async () => {
  class Native {async detect() {return [];}}
  let clock = 0;
  const engine = fallback();
  const decoder = await createBarcodeDecoder(formats, {native: Native, signal: new AbortController().signal, now: () => clock, loadFallback: async () => engine.decoder});
  assert.deepEqual(await decoder.detect(source), []);
  clock = 2501;
  assert.deepEqual(await decoder.detect(source), [{rawValue: "001-AbC"}]);
  decoder.dispose();
  const photoEngine = fallback();
  const photoDecoder = await createBarcodeDecoder(formats, {native: Native, signal: new AbortController().signal, loadFallback: async () => photoEngine.decoder});
  const photo = {data: new Uint8ClampedArray(4), width: 1, height: 1} as ImageData;
  assert.deepEqual(await photoDecoder.detect(photo), [{rawValue: "001-AbC"}]);
  photoDecoder.dispose();
});

test("closing while WASM loads disposes the late engine and rejects the old session", async () => {
  const controller = new AbortController();
  const pending = deferred<BarcodeDecoder>();
  const engine = fallback();
  const opening = createBarcodeDecoder(formats, {signal: controller.signal, loadFallback: () => pending.promise});
  controller.abort();
  pending.resolve(engine.decoder);
  await assert.rejects(opening, {name: "AbortError"});
  assert.equal(engine.disposed(), 1);
  assert.equal(engine.calls.length, 0);
});

test("aborted native results cannot escape a closed session", async () => {
  const pending = deferred<Array<{rawValue: string}>>();
  class Native {detect() {return pending.promise;}}
  const controller = new AbortController();
  const decoder = await createBarcodeDecoder(formats, {native: Native, signal: controller.signal});
  const detecting = decoder.detect(source);
  await Promise.resolve();
  controller.abort();
  pending.resolve([{rawValue: "STALE"}]);
  await assert.rejects(detecting, {name: "AbortError"});
});

test("video and photo frames share one decoding queue", async () => {
  const first = deferred<Array<{rawValue: string}>>();
  const calls: BarcodeSource[] = [];
  const engine: BarcodeDecoder = {detect: async (frame) => {calls.push(frame); return calls.length === 1 ? first.promise : [{rawValue: "PHOTO"}];}, dispose() {}};
  const decoder = await createBarcodeDecoder(formats, {signal: new AbortController().signal, loadFallback: async () => engine});
  const videoResult = decoder.detect(source);
  const photo = {data: new Uint8ClampedArray(4), width: 1, height: 1} as ImageData;
  const photoResult = decoder.detect(photo);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, [source]);
  first.resolve([{rawValue: "VIDEO"}]);
  assert.deepEqual(await videoResult, [{rawValue: "VIDEO"}]);
  assert.deepEqual(await photoResult, [{rawValue: "PHOTO"}]);
  assert.deepEqual(calls, [source, photo]);
  decoder.dispose();
});

test("frame work is bounded and invalid dimensions never allocate a canvas", () => {
  assert.deepEqual(barcodeFrameSize(4032, 3024), {width: 1280, height: 960});
  assert.deepEqual(barcodeFrameSize(720, 1280), {width: 720, height: 1280});
  assert.deepEqual(barcodeFrameSize(640, 480), {width: 640, height: 480});
  for (const dimension of [0, -1, NaN, Infinity]) assert.equal(barcodeFrameSize(dimension, 480), null);
  assert.equal(MAX_BARCODE_IMAGE_BYTES, 12 * 1024 * 1024);
});
