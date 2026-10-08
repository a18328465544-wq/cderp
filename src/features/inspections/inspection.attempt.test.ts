import assert from "node:assert/strict";
import {test} from "node:test";
import {createInspectionDefaults} from "./inspection.defaults";
import {createInspectionAttempt, isCurrentInspectionAttempt, sameInspectionForm, snapshotInspectionForm} from "./inspection.attempt";

function values(inventoryId = "KC-A") {
  return {...createInspectionDefaults(null, "检测员"), inventoryId, serialNumber: " SN-A ", images: ["/media/a.webp"]};
}

test("inspection attempt captures both normalized command and original editor without sharing images", () => {
  const raw = values();
  const command = {...raw, serialNumber: "SN-A"};
  const scope = {inventoryId: raw.inventoryId};
  const attempt = createInspectionAttempt(scope, command, raw, {id: "JC-A", recordVersion: 7});
  assert.equal(isCurrentInspectionAttempt(attempt, scope, raw), true, "DTO trimming must not make an unchanged editor stale");
  raw.images.push("/media/new.webp");
  command.serialNumber = "SN-OTHER";
  assert.equal(attempt.values.serialNumber, "SN-A");
  assert.deepEqual(attempt.values.images, ["/media/a.webp"]);
  assert.deepEqual(attempt.formValues.images, ["/media/a.webp"]);
  assert.equal(attempt.inspectionId, "JC-A");
  assert.equal(attempt.expectedRecordVersion, 7);
  assert.equal(Object.isFrozen(attempt.values), true);
  assert.equal(Object.isFrozen(attempt.values.images), true);
  assert.equal(isCurrentInspectionAttempt(attempt, scope, raw), false);
});

test("late inspection success/error cannot own B or a reopened A editor", () => {
  const raw = values();
  const scope = {inventoryId: "KC-A"};
  const attempt = createInspectionAttempt(scope, raw, raw);
  assert.equal(isCurrentInspectionAttempt(attempt, scope, {...raw, images: [...raw.images]}), true);
  assert.equal(isCurrentInspectionAttempt(attempt, {inventoryId: "KC-B"}, values("KC-B")), false);
  assert.equal(isCurrentInspectionAttempt(attempt, {inventoryId: "KC-A"}, raw), false);
  assert.equal(isCurrentInspectionAttempt(undefined, scope, raw), false);
});

test("old inspection feedback no longer belongs to any edited field", () => {
  const raw = values();
  const scope = {inventoryId: "KC-A"};
  const attempt = createInspectionAttempt(scope, raw, raw);
  for (const patch of [{serialNumber: "SN-REVISED"}, {remarks: "新的备注"}, {condition: "全新" as const}, {temperature: 65}, {images: []}]) {
    assert.equal(isCurrentInspectionAttempt(attempt, scope, {...raw, ...patch}), false);
  }
  assert.equal(sameInspectionForm(snapshotInspectionForm(raw), {...raw, temperature: Number.NaN}), false);
});

test("inspection attempt rejects header/form inventory drift before sending a command", () => {
  assert.throws(() => createInspectionAttempt({inventoryId: "KC-B"}, values(), values()), /与所选库存不一致/);
  assert.throws(() => createInspectionAttempt({inventoryId: ""}, values(), values()), /与所选库存不一致/);
  assert.throws(() => createInspectionAttempt({inventoryId: "KC-A"}, values(), values("KC-B")), /与所选库存不一致/);
});
