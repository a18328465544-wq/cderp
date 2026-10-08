"""Local-only return submission regression using the real UI and HTTP adapters.

All business requests and draft seeds are intercepted. No real returns, stock,
accounts or production sessions are read or changed.
"""
import json
import os
import re
import sys
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("FORM_SMOKE_BASE_URL", "http://127.0.0.1:3010").rstrip("/")
assert urlparse(BASE).hostname in ["127.0.0.1", "localhost"]
REPRODUCE = "--reproduce" in sys.argv
# Phone step flows are exercised separately by browser-mobile-workbench.py;
# this suite retains desktop submit/overlay races.
MODES = os.environ.get("RETURN_SMOKE_MODES", "double,pending-success,hidden-success,hidden-error,closed-success,closed-error,retry,refresh-failure,refresh-throw,refresh-forbidden,success-next,document-success,multiple-success,open-picker,open-select,open-date").split(",")
PRODUCT = {"id": "P-LOCAL", "name": "本地 RTX4090", "category": "显卡", "model": "RTX4090", "brand": "本地", "version": "OC", "vram": "24G"}
PURCHASE = {"id": "CG-LOCAL", "invoiceNo": "JH-LOCAL-001", "date": "2026-10-01", "supplierName": "本地供应商", "sourceType": "商家批发", "totalCost": 200, "paidAmount": 0, "unpaidAmount": 200, "vendorCreditAppliedAmount": 0, "items": [{**PRODUCT, "productId": PRODUCT["id"], "productName": PRODUCT["name"], "sn": f"SN-P-{index}", "buyPrice": 100} for index in range(2)]}
SALES = {"id": "XS-LOCAL", "invoiceNo": "XS-LOCAL-001", "date": "2026-10-01", "customerId": "C-LOCAL", "customerName": "本地客户", "contact": "LOCAL-CONTACT", "outboundStatus": "已出库", "totalAmount": 300, "items": [{**PRODUCT, "productId": PRODUCT["id"], "productName": PRODUCT["name"], "sn": f"SN-S-{index}", "inventoryId": f"KC-S-{index}", "sellPrice": 150} for index in range(2)]}
INVENTORY = [{**PRODUCT, "id": f"KC-P-{index}", "productId": PRODUCT["id"], "productName": PRODUCT["name"], "sn": f"SN-P-{index}", "purchaseInvoiceNo": PURCHASE["invoiceNo"], "status": "已入库", "warehouseLocation": "本地仓", "costPrice": 100} for index in range(2)] + [{**PRODUCT, "id": f"KC-S-{index}", "productId": PRODUCT["id"], "productName": PRODUCT["name"], "sn": f"SN-S-{index}", "salesInvoiceId": SALES["id"], "status": "已售出", "warehouseLocation": "本地仓", "costPrice": 100} for index in range(2)]
STATE = {"products": [PRODUCT], "inventory": INVENTORY, "purchaseInvoices": [PURCHASE], "salesInvoices": [SALES]}
DRAFTS = {
    "return_purchase": {"values": {"date": "2026-10-01", "relatedDocNo": PURCHASE["invoiceNo"], "sourceInventoryId": "KC-P-0", "amount": 100, "settlementMode": "抵扣账款", "settlementAccountId": "", "handler": "本地测试员", "reason": "原始原因", "inventoryAction": "退回供应商", "remarks": "原始备注", "returnScope": "single"}},
    "return_sales": {"values": {"date": "2026-10-01", "relatedDocNo": SALES["invoiceNo"], "sourceInventoryId": "KC-S-0", "sourceSalesItemIndex": 0, "productId": PRODUCT["id"], "productName": PRODUCT["name"], "sn": "SN-S-0", "partyName": SALES["customerName"], "partyId": SALES["customerId"], "contact": SALES["contact"], "amount": 150, "inventoryAction": "退回待检测", "reason": "原始原因", "responsibility": "客户", "handler": "本地测试员", "remarks": "原始备注", "returnScope": "single"}},
}


def tabs(page, width):
    if width < 1024:
        page.locator('button[aria-label^="切换页面，当前为"]').click()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        for width in ([1440] if REPRODUCE else [int(value) for value in os.environ.get("RETURN_SMOKE_WIDTHS", "1440,1024").split(",")]):
            for editor in ["purchase", "sales"]:
                for mode in (["double", "pending-success", "retry", "refresh-failure"] if REPRODUCE else MODES):
                    if mode == "multiple-success" and editor != "purchase":
                        continue
                    context = browser.new_context(viewport={"width": width, "height": 1000})
                    page = context.new_page()
                    writes, held, errors = [], [], []
                    committed = [False]
                    page.on("pageerror", lambda error: errors.append(str(error)))

                    def runtime(route):
                        response = route.fetch()
                        body = response.text()
                        assert "const drafts = {};" in body
                        route.fulfill(response=response, body=body.replace("const drafts = {};", "const drafts = " + json.dumps(DRAFTS, ensure_ascii=False) + ";"))

                    def success(route):
                        committed[0] = True
                        route.fulfill(status=201, content_type="application/json", body=json.dumps({"data": {"id": "RET-LOCAL", "returnNo": "TH-LOCAL-001", "status": "待处理"}}))

                    def invalidation(route):
                        response = route.fetch()
                        body = response.text()
                        pattern = r"((?:async )?function refreshErpAfterDocument\([^)]*\) \{)"
                        body, count = re.subn(pattern, r'\1 throw new Error("本地模拟读取刷新异常");', body)
                        assert count == 1
                        route.fulfill(response=response, body=body)

                    def api(route):
                        request = route.request
                        path = urlparse(request.url).path
                        if path == "/api/auth/me":
                            body = {"data": {"id": "local-return", "username": "local-return", "displayName": "本地测试员", "role": "老板", "enabled": True, "csrfToken": "local-csrf"}}
                        elif path.startswith("/api/returns/reference") or path.startswith("/api/state"):
                            if mode in ["refresh-failure", "refresh-forbidden"] and committed[0] and path.startswith("/api/returns/reference"):
                                route.fulfill(status=403 if mode == "refresh-forbidden" else 503, content_type="application/json", body=json.dumps({"error": {"message": "本地模拟权限收回" if mode == "refresh-forbidden" else "本地模拟基础数据刷新失败"}}))
                                return
                            body = {"data": STATE}
                        elif path == "/api/returns" and request.method == "POST":
                            writes.append({"body": request.post_data_json, "key": request.headers.get("idempotency-key")})
                            if mode in ["double", "pending-success", "hidden-success", "hidden-error", "closed-success", "closed-error", "open-picker", "open-select", "open-date"]:
                                held.append(route)
                                return
                            if mode in ["refresh-failure", "refresh-forbidden", "refresh-throw", "success-next", "document-success", "multiple-success"]:
                                success(route)
                                return
                            route.fulfill(status=400, content_type="application/json", body=json.dumps({"error": {"message": "本地退货保存反馈"}}))
                            return
                        elif request.method not in ["GET", "HEAD"] and path != "/api/ops/client-events":
                            raise AssertionError("Unexpected business write: " + path)
                        else:
                            body = {"data": [], "meta": {"total": 0}}
                        route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

                    page.route(BASE + "/api/**", api)
                    page.route(BASE + "/src/hooks/useWorkspaceTabRuntime.tsx*", runtime)
                    if mode == "refresh-throw":
                        page.route(BASE + "/src/services/api/invalidation.ts*", invalidation)
                    try:
                        page.goto(BASE + "/" + editor + "/returns/new")
                        page.wait_for_load_state("networkidle")
                        # Modal pickers hide the editor from accessibility while
                        # open; retain its real DOM identity for the race check.
                        form = page.locator("form").filter(has=page.locator('textarea[placeholder^="补充"]'))
                        remarks = form.locator('textarea[placeholder^="补充"]')
                        reason = form.locator('textarea[required]')
                        expect(remarks).to_have_value("原始备注")
                        expect(form.get_by_role("button", name="提交采购退货" if editor == "purchase" else "提交销售退货", exact=True)).to_be_enabled()
                        if mode == "document-success":
                            form.get_by_role("button", name="整单退货", exact=True).click()
                            expect(form.get_by_role("button", name="提交整单退货", exact=True)).to_be_enabled()
                        elif mode == "multiple-success":
                            form.get_by_role("button", name="多件退货", exact=True).click()
                            form.get_by_role("checkbox").nth(1).check()
                            expect(form.get_by_role("status").filter(has_text="已选 2 件")).to_be_visible()
                        elif mode == "open-picker":
                            form.get_by_role("combobox", name="搜索原采购单" if editor == "purchase" else "关联销售单", exact=True).click()
                            expect(page.get_by_role("option").first).to_be_visible()
                        elif mode == "open-select":
                            form.get_by_role("combobox", name="采购退货结算方式" if editor == "purchase" else "责任归属", exact=True).click()
                            expect(page.get_by_role("option").first).to_be_visible()
                        elif mode == "open-date":
                            form.get_by_role("button", name="采购退货日期" if editor == "purchase" else "退货日期", exact=True).click()
                            expect(page.get_by_role("grid")).to_be_visible()
                        if mode == "double":
                            form.evaluate("form=>{form.requestSubmit();form.requestSubmit();}")
                        else:
                            form.evaluate("form=>form.requestSubmit()")
                        if mode in ["double", "pending-success", "hidden-success", "hidden-error", "closed-success", "closed-error", "open-picker", "open-select", "open-date"]:
                            page.wait_for_timeout(200)
                            if REPRODUCE:
                                print(json.dumps({"editor": editor, "mode": mode, "writes": len(writes), "remarksLocked": remarks.is_disabled(), "reasonLocked": reason.is_disabled()}, ensure_ascii=False), flush=True)
                                if mode == "pending-success" and remarks.is_enabled():
                                    remarks.fill("等待时的新输入")
                            else:
                                assert len(writes) == 1, writes
                                expect(remarks).to_be_disabled()
                                expect(reason).to_be_disabled()
                                expect(form.get_by_role("combobox", name="搜索原采购单" if editor == "purchase" else "关联销售单", exact=True, include_hidden=True)).to_be_disabled()
                                expect(form.get_by_role("button", name="采购退货日期" if editor == "purchase" else "退货日期", exact=True, include_hidden=True)).to_be_disabled()
                                if mode in ["open-picker", "open-select"]:
                                    expect(page.get_by_role("option")).to_have_count(0)
                                if mode == "open-date":
                                    expect(page.get_by_role("grid")).to_have_count(0)
                            if mode.startswith("hidden"):
                                tabs(page, width)
                                page.get_by_role("link", name="首页", exact=False).click()
                                page.wait_for_load_state("domcontentloaded")
                            elif mode.startswith("closed"):
                                tabs(page, width)
                                page.get_by_role("button", name="关闭采购退货" if editor == "purchase" else "关闭销售退货", exact=True).click()
                                dialog = page.get_by_role("dialog")
                                expect(dialog.get_by_role("heading", name="当前内容尚未保存", exact=True)).to_be_visible()
                                dialog.get_by_role("button", name="放弃并离开", exact=True).click()
                                page.wait_for_url(BASE + "/")
                                page.go_back(wait_until="domcontentloaded")
                                expect(remarks).to_have_value("")
                                expect(remarks).to_be_enabled()
                                remarks.fill("重新打开的新草稿")
                            for route in held[:]:
                                if mode in ["hidden-error", "closed-error"]:
                                    route.fulfill(status=400, content_type="application/json", body=json.dumps({"error": {"message": "本地退货保存反馈"}}))
                                else:
                                    success(route)
                            held.clear()
                        page.wait_for_timeout(500)
                        if mode.startswith("hidden"):
                            tabs(page, width)
                            page.get_by_role("link", name="采购退货" if editor == "purchase" else "销售退货", exact=False).click()
                            page.wait_for_load_state("networkidle")
                        if mode == "retry":
                            form.evaluate("form=>form.requestSubmit()")
                            page.wait_for_timeout(250)
                            if editor == "purchase":
                                remarks.fill("原始备注 ")
                                form.evaluate("form=>form.requestSubmit()")
                                page.wait_for_timeout(250)
                            remarks.fill("修改后的备注")
                            form.evaluate("form=>form.requestSubmit()")
                            page.wait_for_timeout(250)
                            if REPRODUCE:
                                print(json.dumps({"editor": editor, "mode": mode, "writes": writes}, ensure_ascii=False), flush=True)
                            else:
                                assert len(writes) == (4 if editor == "purchase" else 3), writes
                                assert writes[0]["key"] and writes[0]["key"] == writes[1]["key"], writes
                                if editor == "purchase":
                                    assert writes[2] == writes[0], writes
                                assert writes[-1]["key"] != writes[0]["key"], writes
                                expect(remarks).to_have_value("修改后的备注")
                        elif REPRODUCE:
                            print(json.dumps({"editor": editor, "mode": mode, "formPresent": form.count(), "remarks": remarks.input_value() if remarks.count() else None}, ensure_ascii=False), flush=True)
                        elif mode.startswith("closed"):
                            assert len(writes) == 1, writes
                            expect(remarks).to_have_value("重新打开的新草稿")
                            expect(remarks).to_be_enabled()
                            expect(page.get_by_role("status").filter(has_text="TH-LOCAL-001")).to_have_count(0)
                            expect(page.get_by_role("alert").filter(has_text="本地退货保存反馈")).to_have_count(0)
                        elif mode == "refresh-forbidden":
                            assert len(writes) == 1, writes
                            expect(page.get_by_text("本地模拟权限收回", exact=True)).to_be_visible()
                            expect(form).to_have_count(0)
                        else:
                            assert len(writes) == 1, writes
                            assert writes[0]["body"]["relatedDocNo"] == (PURCHASE if editor == "purchase" else SALES)["invoiceNo"]
                            batch = mode in ["document-success", "multiple-success"]
                            assert writes[0]["body"]["amount"] == (100 if editor == "purchase" else 150) * (2 if batch else 1), writes
                            if batch:
                                assert writes[0]["body"]["batchMode"] == ("多件退货" if mode == "multiple-success" else "整单退货"), writes
                                assert writes[0]["body"]["items"] == [{"sourceInventoryId": f"KC-{'P' if editor == 'purchase' else 'S'}-{index}", "sourcePurchaseItemIndex" if editor == "purchase" else "sourceSalesItemIndex": index} for index in range(2)], writes
                            if mode == "hidden-error":
                                expect(page.get_by_role("alert").filter(has_text="本地退货保存反馈")).to_be_visible()
                            else:
                                # Wait for the committed UI, not an arbitrary delay: font/
                                # chunk loading can postpone the React update on slower CI.
                                expect(page.get_by_role("status").filter(has_text="TH-LOCAL-001")).to_be_visible()
                            expect(remarks).to_be_enabled()
                            if mode == "hidden-error":
                                expect(remarks).to_have_value("原始备注")
                                expect(page.get_by_role("alert").filter(has_text="本地退货保存反馈")).to_be_visible()
                            else:
                                expect(remarks).to_have_value("")
                                expect(page.get_by_role("status").filter(has_text="TH-LOCAL-001")).to_be_visible()
                                remarks.fill("下一张退货单")
                                expect(remarks).to_have_value("下一张退货单")
                            if mode == "refresh-failure":
                                expect(page.get_by_role("alert").filter(has_text="刷新失败")).to_be_visible()
                            if mode == "refresh-throw":
                                expect(page.get_by_text("退货单已提交，但列表刷新失败，请手动刷新。不要重复提交。", exact=True)).to_be_visible()
                                expect(page.get_by_role("alert").filter(has_text="本地模拟读取刷新异常")).to_have_count(0)
                            if mode == "pending-success":
                                page.screenshot(path=f"/private/tmp/erp-return-{editor}-{width}-verified.png", full_page=True)
                        assert not errors, errors
                        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
                        if not REPRODUCE:
                            print(json.dumps({"width": width, "editor": editor, "mode": mode, "passed": True}), flush=True)
                    except Exception:
                        page.screenshot(path=f"/private/tmp/erp-return-{editor}-{mode}-{width}-failed.png", full_page=True)
                        print(page.locator("body").aria_snapshot(), flush=True)
                        raise
                    finally:
                        context.close()
    finally:
        browser.close()
