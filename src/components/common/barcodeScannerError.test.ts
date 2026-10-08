import assert from "node:assert/strict";
import test from "node:test";
import {barcodeScannerErrorMessage} from "./barcodeScannerError";

test("camera errors provide localized fallback guidance without raw browser diagnostics", () => {
  for (const name of ["NotAllowedError", "NotFoundError", "NotReadableError", "OverconstrainedError", "SecurityError"]) {
    const error = Object.assign(new Error("Requested device not found"), {name});
    const message = barcodeScannerErrorMessage(error);
    assert.match(message, /手动输入 SN/);
    assert.doesNotMatch(message, /Requested device/);
  }
  assert.match(barcodeScannerErrorMessage(null), /启动失败/);
  assert.equal(barcodeScannerErrorMessage(new Error("当前浏览器不支持条码识别")), "当前浏览器不支持条码识别");
});
