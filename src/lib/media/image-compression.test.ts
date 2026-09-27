import assert from "node:assert/strict";
import test from "node:test";
import {compressImageFile, dataUrlByteLength, IMAGE_MAX_INPUT_BYTES, IMAGE_MAX_STORED_BYTES, validateImageFile} from "./image-compression";

test("image validation enforces the real media API limits", () => {
  assert.deepEqual(validateImageFile({type: "image/jpeg", size: 10}), {ok: true});
  assert.equal(validateImageFile({type: "image/gif", size: 10}).ok, false);
  assert.equal(validateImageFile({type: "image/jpeg", size: IMAGE_MAX_INPUT_BYTES + 1}).ok, false);
  assert.equal(validateImageFile({type: "image/jpeg", size: 0}).ok, false);
});

test("data URL byte length is decoded rather than character length", () => {
  assert.equal(dataUrlByteLength("data:image/jpeg;base64,SGVsbG8="), 5);
  assert.equal(dataUrlByteLength("data:image/jpeg;base64,"), 0);
});

test("compression returns a JPEG payload within the database guard", async () => {
  const previousFileReader = globalThis.FileReader;
  const previousImage = globalThis.Image;
  const previousDocument = globalThis.document;
  class MockFileReader {
    result: string | null = null;
    error: DOMException | null = null;
    onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
    onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
    readAsDataURL() {
      this.result = "data:image/png;base64,AA==";
      this.onload?.({} as ProgressEvent<FileReader>);
    }
  }
  class MockImage {
    naturalWidth = 1_920;
    naturalHeight = 1_080;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { this.onload?.(); }
  }
  const context = {fillStyle: "", fillRect: () => undefined, drawImage: () => undefined};
  const canvas = {width: 0, height: 0, getContext: () => context, toDataURL: () => "data:image/jpeg;base64,AA=="};
  Object.defineProperty(globalThis, "FileReader", {configurable: true, value: MockFileReader});
  Object.defineProperty(globalThis, "Image", {configurable: true, value: MockImage});
  Object.defineProperty(globalThis, "document", {configurable: true, value: {createElement: () => canvas}});
  try {
    const file = Object.assign(new Blob(["image"], {type: "image/png"}), {name: "receipt.png"}) as Blob & {type: string; size: number; name: string};
    const compressed = await compressImageFile(file);
    assert.equal(compressed.dataUrl.startsWith("data:image/jpeg;base64,"), true);
    assert.ok(compressed.sizeBytes <= IMAGE_MAX_STORED_BYTES);
  } finally {
    Object.defineProperty(globalThis, "FileReader", {configurable: true, value: previousFileReader});
    Object.defineProperty(globalThis, "Image", {configurable: true, value: previousImage});
    Object.defineProperty(globalThis, "document", {configurable: true, value: previousDocument});
  }
});
