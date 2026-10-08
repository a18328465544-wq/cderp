import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {SalesOutboundScanControls} from "./SalesOutboundScanControls";
import {shouldAutofocusOutboundScan} from "../sales.outbound.focus";

function render(input = "", pending = false) {
  return renderToStaticMarkup(<SalesOutboundScanControls inputRef={null} input={input} codes="SN-001" pending={pending} onInputChange={() => {}} onCodesChange={() => {}} onAppend={() => {}} onOpenCamera={() => {}} />);
}

test("autofocus is limited to an active desktop scanner workstation", () => {
  for (const active of [false, true]) for (const narrow of [false, true]) for (const coarse of [false, true]) {
    assert.equal(shouldAutofocusOutboundScan(active, narrow, coarse), active && !narrow && !coarse);
  }
});

test("scan controls reuse labeled fields and never force the mobile keyboard open", () => {
  const html = render();
  assert.doesNotMatch(html, /autofocus/i);
  assert.match(html, /autoCapitalize="none"/);
  assert.match(html, /autoCorrect="off"/);
  assert.match(html, /spellCheck="false"/);
  assert.match(html, /enterKeyHint="done"/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of html.matchAll(/<label for="([^"]+)"/g)) assert.ok(ids.includes(match[1]));
});

test("empty input cannot be appended but camera entry stays available", () => {
  const html = render("  ");
  assert.match(html, /<button[^>]*\sdisabled=""[^>]*aria-label="追加扫码内容"/);
  assert.doesNotMatch(html, /<button[^>]*\sdisabled=""[^>]*aria-label="打开摄像头扫码"/);
  assert.match(render("SN-002"), />追加<\/button>/);
  assert.match(html, />摄像头<\/button>/);
});

test("pending outbound locks scan input, bulk input and both buttons", () => {
  const html = render("SN-002", true);
  assert.equal((html.match(/\sdisabled=""/g) || []).length, 4);
  assert.match(html, /flex w-full gap-2 sm:w-auto sm:self-end/);
  assert.match(html, /basis-full sm:basis-auto/);
});

test("page guards focus by tab activity and separates camera detections from keyboard refocusing", () => {
  const source = readFileSync("src/features/sales/pages/SalesOutboundPage.tsx", "utf8");
  assert.doesNotMatch(source, /autoFocus/);
  assert.match(source, /shouldAutofocusOutboundScan\(active,/);
  assert.match(source, /\[active, selectedInvoice\?\.id\]/);
  assert.match(source, /onDetected=\{appendCode\}/);
  assert.match(source, /mobileShowDetailAction=\{false\}/);
  assert.match(source, /scrollIntoView\(\{block: "start"\}\)/);
  assert.match(source, /shrink-0 whitespace-nowrap"><ErpStatusBadge label=\{row\.verified/);
});

test("outbound results and URL reconciliation belong to a mounted active editor", () => {
  const source = readFileSync("src/features/sales/pages/SalesOutboundPage.tsx", "utf8");
  assert.match(source, /!active \|\| query\.isPending \|\| query\.isFetching/);
  assert.match(source, /mounted\.current && isCurrentOutboundAttempt\(attempt, current\.draft\)/);
  assert.match(source, /if \(current\.active\) current\.commitOutboundState/);
  assert.match(source, /else completedSelection\.current = attempt\.invoiceId/);
  assert.match(source, /mutationFn: \(attempt: SalesOutboundAttempt\) => runOutboundAttempt\(attempt, salesApi/);
  assert.match(source, /disabled=\{draftPending\}/);
  assert.doesNotMatch(source, /outboundIdempotencyKeyRef/);
});
