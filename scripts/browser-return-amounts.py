"""Local-only return price/source regression; every API and draft is intercepted."""
import copy
import json
import os
import sys
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("FORM_SMOKE_BASE_URL", "http://127.0.0.1:3010").rstrip("/")
assert urlparse(BASE).hostname in ["127.0.0.1", "localhost"]
REPRODUCE = "--reproduce" in sys.argv
WIDTHS = [1440] if REPRODUCE else [1440, 1024, 390]
MODES = ["refreshed-zero"] if REPRODUCE else ["zero", "refreshed-zero", "missing", "positive", "negative", "invalid"]
PRODUCT = {"id": "P-LOCAL", "name": "本地 RTX4090", "category": "显卡", "model": "RTX4090", "brand": "本地", "version": "OC", "vram": "24G"}


def fixture(editor, scope, mode):
    purchase = {"id": "CG-LOCAL", "invoiceNo": "JH-LOCAL-001", "date": "2026-10-01", "supplierName": "本地供应商", "sourceType": "商家批发", "totalCost": 200, "paidAmount": 0, "unpaidAmount": 200, "items": [{**PRODUCT, "productId": PRODUCT["id"], "productName": PRODUCT["name"], "sn": f"SN-P-{i}", "buyPrice": 100} for i in range(2)]}
    sales = {"id": "XS-LOCAL", "invoiceNo": "XS-LOCAL-001", "date": "2026-10-01", "customerName": "本地客户", "outboundStatus": "已出库", "totalAmount": 300, "items": [{**PRODUCT, "productId": PRODUCT["id"], "productName": PRODUCT["name"], "sn": f"SN-S-{i}", "inventoryId": f"KC-S-{i}", "sellPrice": 150} for i in range(2)]}
    inventory = [{**PRODUCT, "id": f"KC-P-{i}", "productId": PRODUCT["id"], "productName": PRODUCT["name"], "sn": f"SN-P-{i}", "purchaseInvoiceNo": purchase["invoiceNo"], "status": "已入库", "warehouseLocation": "本地仓", "costPrice": 100} for i in range(2)] + [{**PRODUCT, "id": f"KC-S-{i}", "productId": PRODUCT["id"], "productName": PRODUCT["name"], "sn": f"SN-S-{i}", "salesInvoiceId": sales["id"], "status": "已售出", "warehouseLocation": "本地仓", "costPrice": 100} for i in range(2)]
    invoice = purchase if editor == "purchase" else sales
    price_key = "buyPrice" if editor == "purchase" else "sellPrice"
    if mode == "missing":
        invoice["items"][0].pop(price_key)
    elif mode != "positive":
        invoice["items"][0][price_key] = {"zero": 0, "refreshed-zero": 0, "negative": -5, "invalid": "INVALID-PRICE"}[mode]
    prefix = "P" if editor == "purchase" else "S"
    values = {"date": "2026-10-01", "relatedDocNo": invoice["invoiceNo"], "sourceInventoryId": f"KC-{prefix}-0", "amount": 999, "handler": "本地测试员", "reason": "原始原因", "remarks": "保留旧草稿", "returnScope": scope}
    if editor == "purchase":
        values.update({"settlementMode": "抵扣账款", "settlementAccountId": "", "inventoryAction": "退回供应商"})
    else:
        values.update({"sourceSalesItemIndex": 0, "productId": PRODUCT["id"], "productName": PRODUCT["name"], "sn": "SN-S-0", "partyName": sales["customerName"], "partyId": "", "contact": "", "inventoryAction": "退回待检测", "responsibility": "客户"})
    if scope != "single":
        values["returnItems"] = [{"sourceInventoryId": f"KC-{prefix}-{i}", "sourcePurchaseItemIndex" if editor == "purchase" else "sourceSalesItemIndex": i} for i in range(2)]
    return {"products": [PRODUCT], "inventory": inventory, "purchaseInvoices": [purchase], "salesInvoices": [sales]}, {f"return_{editor}": {"values": values}}


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        for width in WIDTHS:
            for editor in ["purchase", "sales"]:
                for scope in (["single", "multiple", "document"] if editor == "purchase" else ["single", "document"]):
                    for mode in MODES:
                        state, drafts = fixture(editor, scope, mode)
                        before = copy.deepcopy(state)
                        writes, errors = [], []
                        context = browser.new_context(viewport={"width": width, "height": 1000})
                        page = context.new_page()
                        page.on("pageerror", lambda error: errors.append(str(error)))

                        def runtime(route):
                            response = route.fetch()
                            body = response.text()
                            assert "const drafts = {};" in body
                            route.fulfill(response=response, body=body.replace("const drafts = {};", "const drafts = " + json.dumps(drafts, ensure_ascii=False) + ";"))

                        def api(route):
                            request = route.request
                            path = urlparse(request.url).path
                            if path == "/api/auth/me":
                                body = {"data": {"id": "local-return-amount", "username": "local-return-amount", "displayName": "本地测试员", "role": "老板", "enabled": True, "csrfToken": "local-csrf"}}
                            elif path.startswith("/api/returns/reference") or path.startswith("/api/state"):
                                body = {"data": state}
                                if mode == "refreshed-zero" and "selectedDocNo=" not in request.url:
                                    older = copy.deepcopy(state)
                                    older["purchaseInvoices" if editor == "purchase" else "salesInvoices"][0]["items"][0]["buyPrice" if editor == "purchase" else "sellPrice"] = 100 if editor == "purchase" else 150
                                    body = {"data": older}
                            elif path == "/api/returns" and request.method == "POST":
                                writes.append(request.post_data_json)
                                route.fulfill(status=400, content_type="application/json", body=json.dumps({"error": {"message": "本地拦截：不写入退货"}}))
                                return
                            elif request.method not in ["GET", "HEAD"] and path != "/api/ops/client-events":
                                raise AssertionError("Unexpected business write: " + path)
                            else:
                                body = {"data": [], "meta": {"total": 0}}
                            route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

                        page.route(BASE + "/api/**", api)
                        page.route(BASE + "/src/hooks/useWorkspaceTabRuntime.tsx*", runtime)
                        try:
                            page.goto(BASE + "/" + editor + "/returns/new")
                            page.wait_for_load_state("networkidle")
                            form = page.locator("form").filter(has=page.locator('textarea[placeholder^="补充"]'))
                            expect(form.locator('textarea[placeholder^="补充"]')).to_have_value("保留旧草稿")
                            label = "提交整单退货" if scope == "document" else "提交多件退货" if scope == "multiple" else "提交采购退货" if editor == "purchase" else "提交销售退货"
                            button = form.get_by_role("button", name=label, exact=True)
                            valid = mode == "positive" or (editor == "purchase" and mode == "missing")
                            if not REPRODUCE:
                                if valid:
                                    expect(button).to_be_enabled()
                                else:
                                    expect(button).to_be_disabled()
                                    expect(form.get_by_text("原单退货明细金额必须为大于 0 的有效数字，请先核对原单。", exact=True)).to_be_visible()
                                if mode in ["zero", "refreshed-zero"] and editor == "purchase":
                                    expected_amount = 0 if scope == "single" else 100
                                    expect(form.locator('[data-erp-component="metric-card"]').filter(has=page.get_by_text("退货金额", exact=True)).locator('[data-erp-region="metric-value"]')).to_have_text(f"¥{expected_amount}")
                            # Bypass disabled button to verify command validation as
                            # well as ready/invalid visual state.
                            form.evaluate("form=>form.requestSubmit()")
                            page.wait_for_timeout(250)
                            if REPRODUCE:
                                print(json.dumps({"editor": editor, "scope": scope, "mode": mode, "enabled": button.is_enabled(), "preview": form.locator('[data-erp-region="metric-value"]').all_text_contents(), "writes": writes}, ensure_ascii=False), flush=True)
                            elif valid:
                                expected_amount = (100 if editor == "purchase" else 150) * (1 if scope == "single" else 2)
                                assert len(writes) == 1 and writes[0]["amount"] == expected_amount, writes
                                if scope != "single":
                                    assert len(writes[0]["items"]) == 2, writes
                                expect(form.locator('textarea[placeholder^="补充"]')).to_have_value("保留旧草稿")
                            else:
                                assert not writes, writes
                            assert state == before
                            assert not errors, errors
                            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
                            if not REPRODUCE and mode == "zero" and scope == "single" and width in [1440, 390]:
                                page.screenshot(path=f"/private/tmp/erp-return-amount-{editor}-{width}-verified.png", full_page=True)
                            if not REPRODUCE:
                                print(json.dumps({"width": width, "editor": editor, "scope": scope, "mode": mode, "passed": True}), flush=True)
                        except Exception:
                            page.screenshot(path=f"/private/tmp/erp-return-amount-{editor}-{scope}-{mode}-{width}-failed.png", full_page=True)
                            print(page.locator("body").aria_snapshot(), flush=True)
                            raise
                        finally:
                            context.close()
    finally:
        browser.close()
