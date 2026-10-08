import assert from "node:assert/strict";
import {test} from "node:test";
import {createDraftMediaUpload, summarizeDraftMedia, type DraftMediaOptions} from "./draftMediaUpload";
import {validateImageFile, type CompressedImage} from "./image-compression";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  assert.ok(item !== undefined, `missing fixture entry ${index}`);
  return item;
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const image = (name = "test.png") => new File(["image"], name, {type: "image/png"});
const compressed: CompressedImage = {dataUrl: "data:image/jpeg;base64,bG9jYWw=", sizeBytes: 5, width: 1, height: 1};

function fixture(entityType = "inspection_draft", compress: (file: File) => Promise<CompressedImage> = async () => compressed, initialUrls?: readonly string[]) {
  let sequence = 0;
  const revoked: string[] = [];
  const changed: string[][] = [];
  const calls: {input: {entityType: string; entityId: string; relationRole: string; images: string[]}; signal: AbortSignal; response: ReturnType<typeof deferred<{urls: string[]}>>}[] = [];
  const options: DraftMediaOptions = {entityType, draftPrefix: entityType, relationRole: "evidence", existingName: "图片", initialUrls, maxCount: 6, onUrlsChange: (urls) => changed.push(urls)};
  const upload = createDraftMediaUpload(() => options, {
    id: () => String(++sequence), validate: validateImageFile, compress,
    replace: (input, signal) => {const response = deferred<{urls: string[]}>(); calls.push({input, signal, response}); return response.promise;},
    createObjectURL: (file) => `blob:${file.name}`, revokeObjectURL: (url) => revoked.push(url),
  });
  return {upload, options, calls, changed, revoked};
}

test("restored draft media is visible without rewriting or dirtying the existing form", () => {
  const urls = ["/assets/restored"];
  const f = fixture("purchase_draft", undefined, urls);
  urls.push("/assets/later-parent-render");
  assert.deepEqual(f.upload.getSnapshot().items.map((item) => item.assetUrl), ["/assets/restored"]);
  assert.equal(f.upload.getSnapshot().items[0]?.status, "uploaded");
  assert.equal(f.upload.isBlocking(), false);
  assert.deepEqual(f.changed, []);
  assert.deepEqual(f.calls, []);
  f.upload.reset([]);
  assert.deepEqual(f.upload.getSnapshot().items, [], "explicit clear must not rehydrate old mount defaults");
  f.upload.dispose();
});

test("the first upload and removal retain a restored draft's other images", async () => {
  const f = fixture("purchase_draft", undefined, ["/assets/restored"]);
  const restoredId = at(f.upload.getSnapshot().items, 0).id;
  f.upload.addFiles([image("new.png")]);
  await tick();
  assert.deepEqual(at(f.calls, 0).input.images, ["/assets/restored", compressed.dataUrl]);
  at(f.calls, 0).response.resolve({urls: ["/assets/restored", "/assets/new"]});
  await tick();
  assert.deepEqual(f.changed, [["/assets/restored", "/assets/new"]]);
  f.upload.remove(restoredId);
  await tick();
  assert.deepEqual(at(f.calls, 1).input.images, ["/assets/new"]);
  at(f.calls, 1).response.resolve({urls: ["/assets/new"]});
  await tick();
  assert.deepEqual(f.changed.at(-1), ["/assets/new"]);
  assert.deepEqual(f.revoked, [], "server URLs are not object URLs");
  f.upload.dispose();
});

for (const entity of ["inspection_draft", "product_draft", "purchase_draft", "payment_in_draft", "payment_out_draft"]) {
  test(`${entity}: reset isolates late uploads and gives the new editor an independent queue`, async () => {
    const f = fixture(entity);
    f.upload.addFiles([image("A.png")]);
    assert.equal(f.upload.isBlocking(), true, "queued local items block synchronously");
    await tick();
    const draftA = f.upload.getDraftId();
    f.upload.reset(["/assets/B-existing"]);
    assert.equal(at(f.calls, 0).signal.aborted, true);
    assert.equal(f.upload.isCurrentDraft(draftA), false);
    f.upload.addFiles([image("B.png")]);
    await tick();
    assert.equal(f.calls.length, 2, "B must not wait for A's unresolved request");
    assert.notEqual(at(f.calls, 0).input.entityId, at(f.calls, 1).input.entityId);
    assert.deepEqual(at(f.calls, 1).input.images, ["/assets/B-existing", compressed.dataUrl]);
    at(f.calls, 0).response.resolve({urls: ["/assets/A-upload"]});
    await tick();
    assert.deepEqual(f.changed, [], "A cannot invoke B's form callback");
    at(f.calls, 1).response.resolve({urls: ["/assets/B-existing", "/assets/B-upload"]});
    await tick();
    assert.deepEqual(f.changed, [["/assets/B-existing", "/assets/B-upload"]]);
    assert.equal(f.upload.isBlocking(), false);
    f.upload.dispose();
  });
  test(`${entity}: an old deletion failure cannot appear on a replacement editor`, async () => {
    const f = fixture(entity);
    f.upload.reset(["/assets/A"]);
    f.upload.remove(at(f.upload.getSnapshot().items, 0).id);
    await tick();
    f.upload.reset(["/assets/B"]);
    const stateB = f.upload.getSnapshot();
    at(f.calls, 0).response.reject(new Error("A failed"));
    await tick();
    assert.equal(f.upload.getSnapshot(), stateB);
    assert.equal(f.upload.getSnapshot().error, undefined);
    assert.deepEqual(f.changed, [[]]);
    f.upload.dispose();
  });
}

test("reset and unmount during compression cannot start an obsolete HTTP request", async () => {
  for (const action of ["reset", "dispose"] as const) {
    const compression = deferred<CompressedImage>();
    const f = fixture("inspection_draft", () => compression.promise);
    f.upload.addFiles([image()]);
    await tick();
    if (action === "reset") f.upload.reset(["/assets/B"]); else f.upload.dispose();
    compression.resolve(compressed);
    await tick();
    assert.equal(f.calls.length, 0);
    assert.deepEqual(f.changed, []);
    assert.deepEqual(f.revoked, ["blob:test.png"]);
    f.upload.dispose();
    assert.deepEqual(f.revoked, ["blob:test.png"], "release exactly once");
  }
});

test("a late compression failure cannot contaminate a newer draft", async () => {
  const compression = deferred<CompressedImage>();
  const f = fixture("payment_in_draft", () => compression.promise);
  f.upload.addFiles([image()]);
  await tick();
  f.upload.reset(["/assets/B"]);
  compression.reject(new Error("old decode failed"));
  await tick();
  assert.deepEqual(f.upload.getSnapshot().items.map((item) => item.assetUrl), ["/assets/B"]);
  assert.equal(f.upload.isBlocking(), false);
  f.upload.dispose();
});

test("deletion and upload relation writes serialize and use the latest retained URLs", async () => {
  const f = fixture();
  f.upload.reset(["/assets/existing"]);
  const existingId = at(f.upload.getSnapshot().items, 0).id;
  f.upload.addFiles([image()]);
  await tick();
  f.upload.remove(existingId);
  await tick();
  assert.equal(f.calls.length, 1, "do not race two replace writes on one draft");
  at(f.calls, 0).response.resolve({urls: ["/assets/existing", "/assets/new"]});
  await tick();
  assert.equal(f.calls.length, 2);
  assert.deepEqual(at(f.calls, 1).input.images, ["/assets/new"]);
  assert.deepEqual(f.changed, [[], ["/assets/new"]]);
  at(f.calls, 1).response.resolve({urls: ["/assets/new"]});
  await tick();
  assert.equal(f.upload.isBlocking(), false);
  f.upload.dispose();
});

test("uploads serialize within a draft and retain every completed image", async () => {
  const f = fixture();
  f.upload.addFiles([image("one.png"), image("two.png")]);
  await tick();
  assert.equal(f.calls.length, 1);
  assert.equal(at(f.upload.getSnapshot().items, 1).status, "local");
  at(f.calls, 0).response.resolve({urls: ["/assets/one"]});
  await tick();
  assert.deepEqual(at(f.calls, 1).input.images, ["/assets/one", compressed.dataUrl]);
  at(f.calls, 1).response.resolve({urls: ["/assets/one", "/assets/two"]});
  await tick();
  assert.deepEqual(f.changed.at(-1), ["/assets/one", "/assets/two"]);
  f.upload.dispose();
});

test("failed upload blocks, can retry, and uses the latest form callback", async () => {
  const f = fixture();
  f.upload.addFiles([image()]);
  await tick();
  at(f.calls, 0).response.reject(new Error("service unavailable"));
  await tick();
  assert.equal(at(f.upload.getSnapshot().items, 0).error, "service unavailable");
  assert.equal(f.upload.isBlocking(), true);
  f.upload.retry(at(f.upload.getSnapshot().items, 0).id);
  assert.equal(at(f.upload.getSnapshot().items, 0).status, "local");
  const latest: string[][] = [];
  f.options.onUrlsChange = (urls) => latest.push(urls);
  await tick();
  at(f.calls, 1).response.resolve({urls: ["/assets/retried"]});
  await tick();
  assert.deepEqual(latest, [["/assets/retried"]]);
  assert.deepEqual(f.changed, []);
  f.upload.dispose();
});

test("remove queued/compressing/failed items cancels work and releases only their blobs", async () => {
  const compression = deferred<CompressedImage>();
  const f = fixture("purchase_draft", () => compression.promise);
  f.upload.addFiles([image("first.png"), image("queued.png"), new File(["bad"], "bad.txt", {type: "text/plain"})]);
  const [first, queued, failed] = f.upload.getSnapshot().items;
  assert.ok(first && queued && failed);
  f.upload.remove(queued.id);
  f.upload.remove(failed.id);
  await tick();
  f.upload.remove(first.id);
  compression.resolve(compressed);
  await tick();
  assert.equal(f.calls.length, 0);
  assert.equal(f.upload.isBlocking(), false);
  assert.deepEqual(f.revoked.sort(), ["blob:bad.txt", "blob:first.png", "blob:queued.png"]);
  f.upload.dispose();
});

test("whole-batch count rejection leaves the draft unchanged and creates no previews", async () => {
  const f = fixture();
  f.options.maxCount = 1;
  f.upload.addFiles([image("first.png"), image("second.png")]);
  assert.equal(f.upload.getSnapshot().items.length, 0);
  assert.match(f.upload.getSnapshot().error || "", /最多上传 1/);
  f.upload.addFiles([image()]);
  assert.equal(f.upload.getSnapshot().error, undefined);
  await tick();
  assert.equal(f.calls.length, 1);
  f.upload.dispose();
});

test("closed/disabled editors reject new changes and ignore a late response", async () => {
  const f = fixture();
  f.options.disabled = true;
  f.upload.addFiles([image()]);
  assert.equal(f.upload.getSnapshot().items.length, 0);
  f.options.disabled = false;
  f.upload.addFiles([image()]);
  await tick();
  f.options.enabled = false;
  assert.equal(f.upload.isCurrentDraft(f.upload.getDraftId()), false);
  at(f.calls, 0).response.resolve({urls: ["/assets/closed"]});
  await tick();
  assert.deepEqual(f.changed, []);
  f.upload.dispose();
});

test("effect replay retains a mounted draft; real disposal aborts pending work", async () => {
  const f = fixture();
  f.upload.addFiles([image()]);
  f.upload.detach();
  f.upload.attach();
  await tick();
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.revoked, []);
  f.upload.detach();
  f.upload.dispose();
  assert.equal(at(f.calls, 0).signal.aborted, true);
  at(f.calls, 0).response.resolve({urls: ["/assets/late"]});
  await tick();
  assert.deepEqual(f.changed, []);
  assert.deepEqual(f.revoked, ["blob:test.png"]);
});

test("all uncommitted image statuses count as pending or failed", () => {
  assert.deepEqual(summarizeDraftMedia([{status: "local"}, {status: "failed"}, {status: "uploaded"}]), {pending: true, failed: true, uploaded: 1, total: 3});
});
