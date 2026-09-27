import assert from "node:assert/strict";
import test from "node:test";
import {hasBaseWidthUtilityClass, hasMaxWidthUtilityClass, hasWidthUtilityClass} from "./cn";

test("width utility helpers distinguish base, responsive and max-width contracts", () => {
  assert.equal(hasWidthUtilityClass("sm:w-36"), true);
  assert.equal(hasWidthUtilityClass("lg:!w-80"), true);
  assert.equal(hasBaseWidthUtilityClass("sm:w-36"), false);
  assert.equal(hasBaseWidthUtilityClass("w-full sm:w-36"), true);
  assert.equal(hasMaxWidthUtilityClass("md:max-w-4xl"), true);
  assert.equal(hasMaxWidthUtilityClass("!max-w-xl"), true);
  assert.equal(hasMaxWidthUtilityClass("w-full"), false);
});
