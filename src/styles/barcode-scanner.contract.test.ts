import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const scanner = readFileSync(new URL("../components/common/ErpBarcodeScannerDialog.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

test("shared scanner is a compact dialog on phones, not a full-screen camera", () => {
  assert.match(scanner, /mobilePresentation="dialog"/);
  assert.doesNotMatch(scanner, /mobilePresentation="fullscreen"/);
  assert.match(css, /\.erp-barcode-camera\s*\{[^}]*aspect-ratio: var\(--erp-scanner-preview-ratio\)/);
  assert.doesNotMatch(css, /barcode-scanner-camera[^}]*?(?:56dvh|min-height: 12rem|aspect-ratio: auto)/);
  assert.match(tokens, /--erp-scanner-preview-ratio: 16 \/ 9/);
  assert.match(css, /\.erp-dialog-viewport > \.erp-dialog-popup\.erp-barcode-scanner-dialog \{[^}]*max-width: 32rem;[^}]*max-height: min\(var\(--erp-overlay-mobile-height\)/);
  assert.match(css, /\.erp-dialog-viewport:not\(\.erp-drawer-viewport\):has\(> \.erp-barcode-scanner-dialog\) \{[^}]*padding: max\(var\(--erp-overlay-gutter\), var\(--erp-safe-top\)\)/);
  // Match the legacy sheet selector's specificity so all four corners stay rounded.
  assert.match(css, /\.erp-dialog-viewport > \.erp-dialog-popup\[data-mobile-presentation="dialog"\] \{[^}]*border-radius: var\(--erp-radius-xl\)/);
});

test("barcode aiming guide is wide, centered and does not intercept camera interaction", () => {
  assert.match(tokens, /--erp-scanner-guide-ratio: 3 \/ 1/);
  assert.match(tokens, /--erp-scanner-guide-width: 82%/);
  assert.match(css, /\.erp-barcode-guide\s*\{[^}]*top: 50%;[^}]*left: 50%;[^}]*aspect-ratio: var\(--erp-scanner-guide-ratio\);[^}]*pointer-events: none/);
  assert.match(scanner, /data-erp-region="barcode-guide"[^>]*aria-hidden="true"/);
  for (let corner = 1; corner <= 4; corner++) assert.ok(css.includes(`.erp-barcode-guide > span:nth-child(${corner})`));
  assert.match(scanner, /将条形码横向放入框内，保留两侧白边/);
});

test("full-frame video, QR compatibility, fallback input and session cleanup stay intact", () => {
  assert.match(css, /\.erp-barcode-video\s*\{[^}]*object-fit: contain/);
  assert.match(scanner, /deliverActiveBarcode\(video, \(source\) => decoder!\.detect\(source\)/);
  assert.match(scanner, /"qr_code", "code_128"/);
  assert.match(scanner, /photoScanRef\.current\?\.\(file\)/);
  assert.match(scanner, /deliverCodeRef\.current\?\.\(manualCode\.trim\(\)\)/);
  assert.match(scanner, /ownedStream\?\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
});

test("unavailable camera cannot display a misleading active aiming guide", () => {
  assert.match(scanner, /\{!error && <div data-erp-region="barcode-guide"/);
  assert.match(scanner, /\{error && !starting && <div aria-hidden="true" className="erp-barcode-camera-status"/);
  assert.match(scanner, /role="alert"/);
});
