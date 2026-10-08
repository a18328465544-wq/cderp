"""Local-only sales edit revision regressions using the real React form/cache.

All API traffic is intercepted. The only test instrumentation exposes the
existing QueryClient to trigger the same invalidation used by ERP mutations.
No production server, real business write, or visual redesign is involved.
"""
import json
import os
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("ERP_BROWSER_BASE", "http://127.0.0.1:3010").rstrip("/")
assert urlparse(BASE).hostname in ["127.0.0.1", "localhost"]
PRODUCT = {"id": "P-LOCAL", "name": "本地 RTX4090", "category": "显卡", "brand": "本地", "model": "RTX4090", "version": "OC", "vram": "24G", "refBuyPrice": 100, "refSellPrice": 150}
CUSTOMER = {"id": "C-LOCAL", "name": "本地版本客户", "contact": "LOCAL"}
ACCOUNT = {"id": "SA-LOCAL", "name": "本地账户", "type": "微信", "enabled": True, "balance": 10000}
CONFLICT = "该销售单已有新的修改、收款或出库记录，请刷新核对后重新编辑；本次修改未保存"

def fixture(full):
    return {"id": "XS-LOCAL", "invoiceNo": "XS-LOCAL-001", "recordVersion": 1, "date": "2026-10-04",
            "customerId": CUSTOMER["id"], "customerName": CUSTOMER["name"], "contact": "LOCAL", "channel": "到店",
            "paymentMethod": "账期欠款", "isPaid": False, "paidAmount": 0, "unpaidAmount": 150,
            "paymentStatus": "未收款", "settlementAccountId": ACCOUNT["id"], "needInvoice": False, "freeShipping": True,
            "aftersalesTerms": "店保三个月", "handleBy": "本地测试员", "paymentHandler": "本地测试员", "remarks": "原始备注",
            "outboundStatus": "待出库" if full else "已出库", "totalCount": 1, "totalCost": 100, "totalAmount": 150, "totalProfit": 50,
            "items": [{"productId": PRODUCT["id"], "productName": PRODUCT["name"], "brand": "本地", "model": "RTX4090", "vram": "24G",
                       "inventoryId": "" if full else "KC-LOCAL", "sn": "" if full else "SN-LOCAL", "quantity": 1,
                       "condition": "95新", "costPrice": 100, "sellPrice": 150, "profit": 50, "aftersalesTerms": "店保三个月"}]}

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        for width in [1440, 1024, 390]:
            for full in [True, False]:
                for scenario in ["conflict", "success"]:
                    context = browser.new_context(viewport={"width": width, "height": 1000})
                    page = context.new_page()
                    page.set_default_timeout(10000)
                    invoice, writes, errors, reads = fixture(full), [], [], []
                    page.on("pageerror", lambda error: errors.append(str(error)))

                    def providers(route):
                        response = route.fetch()
                        body = response.text()
                        assert "const queryClient = new QueryClient" in body
                        route.fulfill(response=response, body=body + "\nwindow.__salesDraftTestQueries = queryClient;\n")

                    def api(route):
                        request = route.request
                        parsed = urlparse(request.url)
                        path = parsed.path
                        if request.method == "PUT" and path == "/api/sales-invoices/XS-LOCAL":
                            command = request.post_data_json
                            writes.append(command)
                            if command["expectedRecordVersion"] != invoice["recordVersion"]:
                                route.fulfill(status=409, content_type="application/json", body=json.dumps({"error": {"code": "CONFLICT", "message": CONFLICT, "details": {"kind": "STALE_SALES_RECORD"}}}))
                                return
                            invoice.update({key: value for key, value in command.items() if key != "expectedRecordVersion"})
                            invoice["recordVersion"] += 1
                            body = {"data": invoice, "stateMerge": {"salesInvoices": [invoice]}}
                        elif path == "/api/auth/me":
                            body = {"data": {"id": "local-version-user", "username": "local-version-user", "displayName": "本地测试员", "role": "老板", "enabled": True, "csrfToken": "local-only-csrf"}}
                        elif path == "/api/sales-invoices":
                            reads.append(invoice["recordVersion"])
                            keyword = parse_qs(parsed.query).get("keyword", [""])[0]
                            rows = [invoice] if keyword in ["", invoice["id"], invoice["invoiceNo"]] else []
                            body = {"data": {"salesInvoices": rows, "inventory": []}, "meta": {"total": len(rows), "page": 1, "pageSize": 1}}
                        elif path.startswith("/api/state"):
                            body = {"data": {"products": [PRODUCT], "customers": [CUSTOMER], "settlementAccounts": [ACCOUNT], "salesInvoices": [invoice], "inventory": [], "purchaseInvoices": [], "systemUsers": [], "customPermissions": []}}
                        elif path.endswith("/settlement-accounts"):
                            body = {"data": [ACCOUNT], "meta": {"total": 1}}
                        elif path == "/api/sales/product-candidates":
                            body = {"data": []}
                        elif request.method not in ["GET", "HEAD"] and path != "/api/ops/client-events":
                            raise AssertionError("Unexpected business write: " + path)
                        else:
                            body = {"data": [], "meta": {"total": 0}}
                        route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

                    page.route(BASE + "/src/app/providers.tsx*", providers)
                    page.route(BASE + "/api/**", api)
                    try:
                        page.goto(BASE + "/sales/XS-LOCAL/edit")
                        page.wait_for_load_state("networkidle")
                        form = page.locator("form:visible").filter(has=page.locator('textarea[name="remarks"]'))
                        print(json.dumps({"width": width, "full": full, "scenario": scenario, "buttons": form.locator("button").all_text_contents()}, ensure_ascii=False))
                        remarks = form.locator('textarea[name="remarks"]')
                        expect(remarks).to_have_value("原始备注")
                        remarks.fill("保留我的编辑内容")
                        if scenario == "conflict":
                            invoice["recordVersion"] = 2
                            invoice["remarks"] = "别人刚保存的内容"
                            page.evaluate("async () => await window.__salesDraftTestQueries.invalidateQueries({queryKey: ['sales', 'detail', 'XS-LOCAL']})")
                            assert reads[-1] == 2, reads
                            expect(remarks).to_have_value("保留我的编辑内容")
                        save = form.get_by_role("button", name="保存销售单修改", exact=True)
                        expect(save).to_be_enabled()
                        save.click()
                        if scenario == "conflict":
                            expect(page.get_by_role("alert").filter(has_text=CONFLICT)).to_be_visible()
                            expect(page.get_by_role("alert")).to_contain_text("重新打开销售单核对")
                            expect(remarks).to_have_value("保留我的编辑内容")
                            assert page.url.endswith("/sales/XS-LOCAL/edit")
                            assert writes[0]["expectedRecordVersion"] == 1, writes
                            assert invoice["remarks"] == "别人刚保存的内容"
                            if not full:
                                assert set(writes[0]) == {"expectedRecordVersion", "expressNo", "remarks"}
                        else:
                            page.wait_for_url(BASE + "/sales/XS-LOCAL")
                            page.wait_for_load_state("networkidle")
                            assert writes[0]["expectedRecordVersion"] == 1, writes
                            assert invoice["recordVersion"] == 2
                            # Navigate back through the app's real router (not a page reload).
                            page.evaluate("async () => {const {router} = await import('/src/app/router.tsx'); await router.navigate({to: '/sales/$salesId/edit', params: {salesId: 'XS-LOCAL'}});}")
                            page.wait_for_load_state("networkidle")
                            form = page.locator("form:visible").filter(has=page.locator('textarea[name="remarks"]'))
                            remarks = form.locator('textarea[name="remarks"]')
                            expect(remarks).to_have_value("保留我的编辑内容")
                            remarks.fill("再次编辑已保存版本")
                            form.get_by_role("button", name="保存销售单修改", exact=True).click()
                            page.wait_for_url(BASE + "/sales/XS-LOCAL")
                            assert writes[1]["expectedRecordVersion"] == 2, writes
                            assert invoice["recordVersion"] == 3
                        assert not errors, errors
                        print(json.dumps({"passed": True, "width": width, "mode": "full" if full else "metadata", "scenario": scenario, "submittedVersions": [write["expectedRecordVersion"] for write in writes]}, ensure_ascii=False))
                    finally:
                        context.close()
    finally:
        browser.close()
