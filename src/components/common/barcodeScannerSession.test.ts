import assert from "node:assert/strict";
import test from "node:test";
import {deliverActiveBarcode} from "./barcodeScannerSession";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((fulfill, fail) => {resolve = fulfill; reject = fail;});
  return {promise, resolve, reject};
}

test("a closed scanner never starts frame detection", async () => {
  let detections = 0;
  let deliveries = 0;
  assert.equal(await deliverActiveBarcode("video", async () => {detections++; return [{rawValue: "SN"}];}, () => false, () => {deliveries++;}), false);
  assert.equal(detections, 0);
  assert.equal(deliveries, 0);
});

test("a frame completed after scanner closure cannot write or close a form", async () => {
  const frame = deferred<Array<{rawValue: string}>>();
  let active = true;
  const deliveries: string[] = [];
  const pending = deliverActiveBarcode("video", () => frame.promise, () => active, (value) => deliveries.push(value));
  active = false;
  frame.resolve([{rawValue: "SN-STALE"}]);
  assert.equal(await pending, false);
  assert.deepEqual(deliveries, []);
});

test("reopening a camera does not transfer ownership of the previous frame", async () => {
  const oldFrame = deferred<Array<{rawValue: string}>>();
  const newFrame = deferred<Array<{rawValue: string}>>();
  let oldActive = true;
  let currentActive = true;
  const deliveries: string[] = [];
  const oldAttempt = deliverActiveBarcode("old-video", () => oldFrame.promise, () => oldActive, (value) => deliveries.push(value));
  oldActive = false;
  const newAttempt = deliverActiveBarcode("current-video", () => newFrame.promise, () => currentActive, (value) => {deliveries.push(value); currentActive = false;});
  oldFrame.resolve([{rawValue: "SN-STALE"}]);
  assert.equal(await oldAttempt, false);
  assert.deepEqual(deliveries, []);
  assert.equal(currentActive, true);
  newFrame.resolve([{rawValue: "  SN-Current-001  "}]);
  assert.equal(await newAttempt, true);
  assert.deepEqual(deliveries, ["SN-Current-001"]);
  assert.equal(currentActive, false);
});

test("active detection picks the first non-empty real barcode without rewriting it", async () => {
  const deliveries: string[] = [];
  const source = {id: "camera-video"};
  assert.equal(await deliverActiveBarcode(source, async (received) => {
    assert.equal(received, source);
    return [{}, {rawValue: " "}, {rawValue: "  001-AbC  "}, {rawValue: "SECOND"}];
  }, () => true, (value) => deliveries.push(value)), true);
  assert.deepEqual(deliveries, ["001-AbC"]);
  assert.equal(await deliverActiveBarcode(source, async () => [{rawValue: " "}], () => true, (value) => deliveries.push(value)), false);
  assert.deepEqual(deliveries, ["001-AbC"]);
});

test("a failed frame can be retried by the existing active camera loop", async () => {
  const frame = deferred<Array<{rawValue: string}>>();
  let delivered = false;
  const pending = deliverActiveBarcode("video", () => frame.promise, () => true, () => {delivered = true;});
  frame.reject(new Error("camera is focusing"));
  await assert.rejects(pending, /camera is focusing/);
  assert.equal(delivered, false);
});
