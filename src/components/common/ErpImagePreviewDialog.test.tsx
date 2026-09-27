import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import type {ReactElement, ReactNode} from "react";
import {ErpDialogShell} from "./ErpDialogShell";
import {ErpImagePreviewDialog} from "./ErpImagePreviewDialog";

test("ErpImagePreviewDialog keeps the shared dialog shell and image semantics", () => {
  const shell = ErpImagePreviewDialog({open: true, src: "/assets/evidence.png", alt: "检测凭证", title: "检测图片", onOpenChange: () => undefined}) as ReactElement<{children: ReactNode; open: boolean}>;
  assert.equal(shell.type, ErpDialogShell);
  assert.equal(shell.props.open, true);
  assert.equal((shell.props as {title?: ReactNode}).title, "检测图片");
  const markup = renderToStaticMarkup(shell.props.children);
  assert.match(markup, /src="\/assets\/evidence\.png"/);
  assert.match(markup, /alt="检测凭证"/);
});
