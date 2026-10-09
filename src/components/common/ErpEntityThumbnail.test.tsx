import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpEntityThumbnail, customerAvatarIdentity} from "./ErpEntityThumbnail";
import {ErpMobileRecordRow} from "./ErpMobileRecordRow";

test("customer initials are name-derived, Unicode-safe and independent of customer grade", () => {
  assert.equal(customerAvatarIdentity("  星河硬件  ").initial, "星");
  assert.equal(customerAvatarIdentity("intel").initial, "IN");
  assert.equal(customerAvatarIdentity("").initial, "客");
  assert.equal(customerAvatarIdentity("𠮷田").initial, "𠮷");
  assert.deepEqual(customerAvatarIdentity("e\u0301clair"), customerAvatarIdentity("éclair"));
  assert.deepEqual(customerAvatarIdentity("星河硬件"), customerAvatarIdentity(" 星河硬件 "));
  const html = renderToStaticMarkup(<ErpEntityThumbnail kind="customer" name="星河硬件" />);
  assert.match(html, /星河硬件的姓名头像/);
  assert.match(html, /data-avatar-tone="(?:blue|green|amber|neutral)"/);
  assert.match(html, /aria-hidden="true">星</);
  assert.doesNotMatch(html, /<img|S级|A级/);
});

test("all twelve ERP product categories use honest icon fallbacks", () => {
  const categories = ["显卡", "CPU", "主板", "内存", "硬盘", "电源", "散热", "机箱", "整机", "显示器", "组装拆卸", "其他配件"];
  for (const category of categories) {
    const html = renderToStaticMarkup(<ErpEntityThumbnail name="真实商品" category={category} />);
    assert.match(html, new RegExp(`暂无商品图片 · ${category}`));
    assert.match(html, /<svg/);
    assert.doesNotMatch(html, /<img/);
  }
  assert.match(renderToStaticMarkup(<ErpEntityThumbnail category="未知类目" />), /lucide-package/);
});

test("supplied real photos and caller icons remain supported without duplicate images", () => {
  const html = renderToStaticMarkup(<ErpMobileRecordRow title="RTX4090" thumbnail={<ErpEntityThumbnail name="RTX4090" category="显卡" imageUrl="/media/real.webp" />} amount={0} />);
  assert.equal((html.match(/<img/g) || []).length, 1);
  assert.match(html, /src="\/media\/real.webp"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /erp-data-number[^>]*>0</);
  assert.match(renderToStaticMarkup(<ErpEntityThumbnail fallbackIcon={<span>原有业务图标</span>} />), /原有业务图标/);
});

test("failed photos fall back by source without fetching or inventing another image", () => {
  const source = readFileSync(new URL("./ErpEntityThumbnail.tsx", import.meta.url), "utf8");
  assert.match(source, /failedImage !== imageUrl/);
  assert.match(source, /onError=\{\(\) => setFailedImage\(imageUrl\)\}/);
  assert.doesNotMatch(source, /\bfetch\(|https?:\/\//);
});
