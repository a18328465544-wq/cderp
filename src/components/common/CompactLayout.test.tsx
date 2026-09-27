import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {DashboardSection} from "./DashboardShell";
import {ErpFormSection} from "./ErpFormSection";
import {ErpPageHeader} from "./ErpPageHeader";

test("compact page headers keep explanatory subtitles out of the first screen", () => {
  const markup = renderToStaticMarkup(<ErpPageHeader title="商品库" subtitle="维护商品规格模板并同步库存。" actions={<button type="button">新建</button>} />);
  assert.match(markup, /data-density="compact"/);
  assert.doesNotMatch(markup, /维护商品规格模板并同步库存/);
  assert.match(markup, />新建</);
});

test("default page headers preserve safety and decision context when opted in", () => {
  const markup = renderToStaticMarkup(<ErpPageHeader density="default" title="销售出库" subtitle="扫码核验完成后才会扣减库存。" />);
  assert.match(markup, /data-density="default"/);
  assert.match(markup, /data-erp-region="page-topbar"/);
  assert.match(markup, /data-erp-region="page-identity"/);
  assert.match(markup, /扫码核验完成后才会扣减库存/);
  const withoutSubtitle = renderToStaticMarkup(<ErpPageHeader density="default" title="销售出库" />);
  assert.doesNotMatch(withoutSubtitle, /erp-annotation-slot/);
  assert.doesNotMatch(withoutSubtitle, /data-empty="true"/);
});

test("compact sections hide implementation notes while default sections can show them", () => {
  const compact = renderToStaticMarkup(<DashboardSection title="商品规格列表" description="当前接口返回整库快照。"><span>table</span></DashboardSection>);
  assert.match(compact, /data-density="compact"/);
  assert.doesNotMatch(compact, /当前接口返回整库快照/);
  const expanded = renderToStaticMarkup(<DashboardSection density="default" title="出库核验" description="扫码模式必须完成全部实物核验。"><span>form</span></DashboardSection>);
  assert.match(expanded, /data-density="default"/);
  assert.match(expanded, /扫码模式必须完成全部实物核验/);
  const withoutDescription = renderToStaticMarkup(<DashboardSection density="default" title="出库核验"><span>form</span></DashboardSection>);
  assert.doesNotMatch(withoutDescription, /erp-annotation-slot/);
  assert.doesNotMatch(withoutDescription, /data-empty="true"/);
});

test("form sections do not reserve a blank annotation line", () => {
  const withoutDescription = renderToStaticMarkup(<ErpFormSection title="采购明细"><span>form</span></ErpFormSection>);
  const withDescription = renderToStaticMarkup(<ErpFormSection title="采购明细" description="记录采购明细"><span>form</span></ErpFormSection>);
  assert.doesNotMatch(withoutDescription, /erp-annotation-slot/);
  assert.match(withDescription, /记录采购明细/);
});
