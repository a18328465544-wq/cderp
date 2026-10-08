import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const css = readFileSync(new URL("src/styles/globals.css", root), "utf8");
test("Apple Home Screen startup uses a standalone same-origin manifest with real PNG icons", () => {
  const manifest = JSON.parse(readFileSync(new URL("public/manifest.webmanifest", root), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-mobile-web-app-capable[^>]+yes/);
  assert.match(html, /apple-mobile-web-app-status-bar-style[^>]+default/);
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/);
  for (const [filename, expected] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]] as const) {
    const png = readFileSync(new URL(`public/icons/${filename}`, root));
    assert.equal(png.readUInt32BE(16), expected);
    assert.equal(png.readUInt32BE(20), expected);
  }
});
test("phone safe areas and editable controls are shared, with reduced-motion support", () => {
  assert.match(css, /padding-top: var\(--erp-safe-top\)/);
  assert.match(css, /padding-inline: var\(--erp-safe-left\) var\(--erp-safe-right\)/);
  assert.match(css, /contenteditable="true"[\s\S]*font-size: var\(--erp-text-lg\)/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none/);
});
test("Home Screen metadata does not introduce offline business caches", () => {
  const main = readFileSync(new URL("src/main.tsx", root), "utf8");
  assert.doesNotMatch(main, /serviceWorker\.register|caches\.open/);
});
