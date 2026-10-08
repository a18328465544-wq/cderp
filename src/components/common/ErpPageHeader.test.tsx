import assert from "node:assert/strict";
import test from "node:test";
import {Button} from "@/src/components/ui";
import {resolvePhonePageActions} from "./ErpPageHeader";

test("phone action presentation retains all actions across fragments and wrappers", () => {
  const actions = resolvePhonePageActions(<><Button>刷新</Button><div><Button variant="primary">新增</Button><Button disabled>导出</Button></div></>);
  assert.equal(actions.length, 3);
  assert.equal(resolvePhonePageActions(undefined).length, 0);
});
