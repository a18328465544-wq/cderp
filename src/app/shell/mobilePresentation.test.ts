import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

test("phone navigation centers links and buttons within the same equal-width touch target", () => {
  const css = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");
  const itemRule = css.match(/\.erp-mobile-bottom-nav \.erp-mobile-nav-item\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(itemRule, /display:\s*flex/);
  assert.match(itemRule, /flex:\s*1 1 0/);
  assert.match(itemRule, /min-width:\s*0/);
  assert.match(itemRule, /min-height:\s*var\(--erp-mobile-touch-size\)/);
  assert.match(itemRule, /flex-direction:\s*column/);
  // Anchor destinations do not inherit the Button primitive's items-center utility.
  assert.match(itemRule, /align-items:\s*center/);
  assert.match(itemRule, /justify-content:\s*center/);
  assert.match(itemRule, /text-align:\s*center/);
});

test("only actually open overlays hide phone navigation", () => {
  const css = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");
  assert.match(css, /body:has\(\[role="dialog"\]\[data-open\]:not\(\[data-mobile-presentation="tab"\]\), \.erp-option-popup\[data-open\], \.erp-popover-surface\[data-open\]\)/);
  assert.doesNotMatch(css, /body:has\(\[role="dialog"\], \[role="listbox"\]/);
});

test("phone select matcher has no runtime dependency on its parent selector", () => {
  const source = readFileSync(new URL("../../components/ui/phone-search-select.tsx", import.meta.url), "utf8");
  assert.match(source, /import type \{SelectProps\} from "\.\/select"/);
  assert.match(source, /from "\.\/select-search"/);
  assert.match(source, /Dialog.Viewport className="fixed inset-0 erp-modal-layer/);
  assert.match(source, /onOpenChangeComplete=/);
});

test("phone inventory missing-image placeholder overrides the real-image hero size", () => {
  const css = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");
  const imageRule = '[data-phone-detail="inventory"] > section:first-child > div:first-child';
  const emptyRule = '[data-phone-detail="inventory"] > section:first-child > div[data-phone-image-empty="true"]:first-child';
  assert.ok(css.includes(`${emptyRule} { height: var(--erp-space-16); }`));
  assert.ok(css.indexOf(emptyRule) > css.indexOf(imageRule));
});

test("phone feedback leaves the back header and persistent action controls reachable", () => {
  const source = readFileSync(new URL("../../components/common/NotificationToaster.tsx", import.meta.url), "utf8");
  assert.match(source, /position=\{phone \? "bottom-center" : "top-right"\}/);
  assert.match(source, /visibleToasts=\{phone \? 1 : 4\}/);
  assert.match(source, /var\(--erp-mobile-nav-height\) \+ var\(--erp-mobile-action-height\)/);
});
