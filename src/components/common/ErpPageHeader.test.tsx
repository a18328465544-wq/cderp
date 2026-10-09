import assert from "node:assert/strict";
import test from "node:test";
import {RefreshCw} from "lucide-react";
import {Button} from "@/src/components/ui";
import {isRefreshAction, resolvePhonePageActions} from "./ErpPageHeader";

test("phone action presentation retains all actions across fragments and wrappers", () => {
  const actions = resolvePhonePageActions(<><Button>刷新</Button><div><Button variant="primary">新增</Button><Button disabled>导出</Button></div></>);
  assert.equal(actions.length, 3);
  assert.equal(resolvePhonePageActions(undefined).length, 0);
});

test("isRefreshAction detects refresh buttons to suppress them on phone", () => {
  assert.equal(isRefreshAction(<Button><RefreshCw />刷新</Button>), true);
  assert.equal(isRefreshAction(<Button aria-label="刷新页面"><RefreshCw /></Button>), true);
  assert.equal(isRefreshAction(<Button data-erp-action="refresh">重新加载</Button>), true);
  assert.equal(isRefreshAction(<Button variant="primary">新建单据</Button>), false);
  assert.equal(isRefreshAction(<Button variant="secondary">导出数据</Button>), false);
  assert.equal(isRefreshAction(null), false);
});
