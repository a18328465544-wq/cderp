import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./pages/InspectionWorkspacePage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");

test("inspection workspace uses the canonical page frame without changing its two-pane workflow", () => {
  const frame = source.indexOf("<ErpPageFrame");
  const header = source.indexOf("<ErpPageHeader");
  const content = source.indexOf("<ErpPageContent>");
  assert.ok(frame >= 0, "inspection workspace must use ErpPageFrame");
  assert.ok(header > frame, "page header must be inside the page frame");
  assert.ok(content > header, "page content must follow the canonical header");
  assert.match(source, /xl:grid-cols-\[minmax\(300px,360px\)_minmax\(0,1fr\)\]/);
});

test("quick inspection follows the live condition and keeps the condition selector outside collapsed metadata", () => {
  assert.match(source, /const isBrandNew = form.watch\("condition"\) === "全新"/);
  assert.doesNotMatch(source, /const isBrandNew = candidate.condition/);
  const selector = source.indexOf('<Field label="成色级别"');
  const optional = source.indexOf('{isBrandNew ? <details');
  assert.ok(selector > 0 && selector < optional);
  assert.equal((source.match(/name="condition"/g) || []).length, 1);
  assert.match(source, /variables.values.condition === "全新"/);
  assert.match(source, /!isBrandNew && isGpu && <GpuInspectionFields/);
  assert.match(source, /!isBrandNew \|\| media.items.length > 0/);
});

test("all inspection modes share intake controls without stretching checkbox cards", () => {
  assert.match(source, /<InspectionIntakeFields form=\{form\} showRepair=\{false\} includeRemarks/);
  assert.match(source, /<InspectionIntakeFields form=\{form\} showRepair=\{isGpu\}/);
  assert.equal((source.match(/name="warrantyDate"/g) || []).length, 1);
  assert.equal((source.match(/register\("warehouseLocation"\)/g) || []).length, 1);
  const intake = source.slice(source.indexOf('function InspectionIntakeFields'), source.indexOf('function GpuInspectionFields'));
  assert.match(intake, /<Field label="保修状态"><CheckField/);
  assert.match(intake, /<Field wide label="入库备注/);
  assert.doesNotMatch(intake, /md:|xl:|flex-1|sm:w-24/);
  const checkbox = source.slice(source.indexOf('function CheckField('));
  assert.match(checkbox, /<ErpCheckboxField id=\{id\} variant="card"/);
  assert.match(checkbox, /w-fit self-start/);
  assert.doesNotMatch(checkbox, /justify-center/);
});

test("inspection grids follow form width and share label control and error tracks", () => {
  assert.match(styles, /container: inspection-form \/ inline-size/);
  assert.match(styles, /@container inspection-form \(min-width: 600px\)/);
  assert.match(styles, /@container inspection-form \(min-width: 960px\)/);
  assert.match(styles, /\.erp-inspection-field-grid > \.erp-inspection-field \{[^}]*grid-template-rows: subgrid;[^}]*grid-row: span 3;/);
  const gpuFields = source.slice(source.indexOf('function GpuInspectionFields'), source.indexOf('function resultLabel'));
  assert.doesNotMatch(gpuFields, /md:grid-cols|xl:grid-cols/);
  assert.match(gpuFields, /erp-inspection-measurements/);
});

test("phone inspection keeps a single form alive while returning to its queue", () => {
  assert.ok(source.includes('if (form.getValues("inventoryId") === candidate.id && !editingHistory) {'));
  assert.match(source, /const activeInventoryId = formInventoryId \|\| selectedId/);
  assert.equal((source.match(/<InspectionFormDrawer /g) || []).length, 1);
  assert.match(source, /hidden=\{mobile && \(!selectedCandidate \|\| showMobileList\)\}/);
  assert.match(source, /onBack=\{\(\) => setShowMobileList\(true\)\}/);
  assert.match(source, /unsavedChanges.requestLeave\(applySelection\)/);
  assert.match(source, /setCompletedInventoryId\(attempt.values.inventoryId\)/);
});

test("inspection completions only reset their owning editor and never another Tab's URL", () => {
  assert.match(source, /mounted.current && isCurrentInspectionAttempt\(variables, scopeRef.current, form.getValues\(\)\)/);
  assert.match(source, /if \(latestActive.current\) clearSavedInspection\(variables\)/);
  assert.match(source, /deferredCompletion.current = variables/);
  assert.match(source, /if \(!active \|\| !attempt\) return/);
  assert.match(source, /isCurrentInspectionAttempt\(mutation.variables, scopeRef.current, formValues\)/);
  assert.match(source, /<fieldset disabled=\{draftPending\}/);
  assert.match(source, /inFlight.current = attempt;[\s\S]*mutation.mutate\(attempt\)/);
  assert.match(source, /if \(!currentUrlId \|\| currentUrlId === attempt.values.inventoryId\) setSelectedId\(""\)/);
});

test("phone groups expose errors and leave desktop fields flat", () => {
  assert.match(source, /if \(!mobile\) return <>\{children\}<\/>/);
  assert.match(source, /if \(errors && sectionRef.current\) sectionRef.current.open = true/);
  for (const title of ["入库信息", "外观与接口", "性能测试", "结论与附件"]) assert.ok(source.includes(`title="${title}"`));
  assert.match(source, /<form noValidate/);
  assert.match(source, /if \(mobile\) return;\s*const frame = requestAnimationFrame/);
  assert.match(styles, /\.erp-inspection-submit \{[^}]*position: sticky;[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(styles, /\[data-phone-keyboard="open"\]/);
  assert.doesNotMatch(source, /restingHeight - viewport.height/);
});

test("phone intake uses task hierarchy and a horizontal, reachable final action", () => {
  assert.match(source, /erp-inspection-task-header/);
  assert.match(source, /aria-label="返回入库待办"/);
  assert.match(source, /aria-label="入库序列号"/);
  assert.match(source, /aria-label="当前入库设置"/);
  assert.match(source, /erp-inspection-phone-product/);
  assert.match(source, /title=\{candidate.productName\}/);
  assert.match(styles, /\[data-erp-component="mobile-workflow"\]\[data-mobile-final="true"\] \.erp-inspection-submit \{ flex-direction: row;/);
  assert.match(styles, /\.erp-phone-warehouse-tasks > a \{[^}]*min-height: var\(--erp-mobile-touch-size\)/);
  assert.match(styles, /\.erp-inspection-task-header \{[^}]*position: sticky; top: 0;/);
  assert.match(styles, /:has\(\.erp-inspection-form\) \{ scroll-margin-top:/);
  const workflow = readFileSync(new URL("../../components/common/ErpMobileWorkflow.tsx", import.meta.url), "utf8");
  assert.match(workflow, /useEffect\(\(\) => setStep\(0\), \[resetKey, steps.length\]\)/);
});
