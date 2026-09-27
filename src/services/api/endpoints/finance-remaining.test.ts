import assert from "node:assert/strict";
import test from "node:test";
import {toUserMutationRequest, type UserMutationInput} from "./finance-remaining";

test("user mutation request omits blank password and preserves explicit reset values", () => {
  const input: UserMutationInput = {
    username: " sales ",
    password: " ",
    displayName: " 销售小王 ",
    role: "店员",
    enabled: true,
    remarks: " 一线销售 ",
    permissionOverrides: {showCost: null, showProfit: false, allowedMenus: null},
  };
  assert.deepEqual(toUserMutationRequest(input), {
    username: "sales",
    displayName: "销售小王",
    role: "店员",
    enabled: true,
    remarks: "一线销售",
    permissionOverrides: {showCost: null, showProfit: false, allowedMenus: null},
  });
});
