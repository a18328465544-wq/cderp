"""Exercise the actual purchase form/query cache with local-only mocked APIs.

No production writes: every API request is intercepted, including authentication.
Only the existing QueryClient is exposed to simulate background invalidation.
"""
import json
import os
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("ERP_BROWSER_BASE", "http://127.0.0.1:3010").rstrip("/")
assert urlparse(BASE).hostname in ["127.0.0.1", "localhost"]
PRODUCT = {"id": "P-LOCAL", "name": "本地 RTX4090", "category": "显卡", "brand": "本地", "model": "RTX4090", "version": "OC", "vram": "24G", "refBuyPrice": 100, "refSellPrice": 150}
VENDOR = {"id": "V-LOCAL", "name": "本地版本供应商", "contact": "LOCAL", "returnCreditBalance": 0}
ACCOUNT = {"id": "SA-LOCAL", "name": "本地账户", "type": "微信", "enabled": True, "balance": 10000}
CONFLICT = "该采购单已被其他人修改，或已有新的付款、入库、退货记录；请刷新核对后重新编辑，本次修改未保存"


def fixture():
    return {"id": "PUR-LOCAL", "invoiceNo": "JH-LOCAL-001", "recordVersion": 1, "date": "2026-10-04",
            "sourceType": "同行拿货", "sourcePartnerId": VENDOR["id"], "sourcePartnerType": "vendor", "supplierName": VENDOR["name"], "contact": "LOCAL",
            "paymentMethod": "账期欠款", "isPaid": False, "paidAmount": 0, "unpaidAmount": 100, "paymentStatus": "未付款", "vendorCreditAppliedAmount": 0,
            "settlementAccountId": ACCOUNT["id"], "handleBy": "本地测试员", "paymentHandler": "本地测试员", "remarks": "原始备注",
            "totalCount": 1, "totalCost": 100, "estTotalSell": 150, "estTotalProfit": 50,
            "items": [{"tempId": "LINE-LOCAL", "productId": PRODUCT["id"], "productName": PRODUCT["name"], "category": "显卡", "brand": "本地", "model": "RTX4090", "version": "OC", "vram": "24G",
                       "sn": "", "quantity": 1, "condition": "95新", "inWarranty": False, "fullBox": True, "repaired": False, "gpuRisk": False, "buyPrice": 100, "estSellPrice": 150, "warehouseLocation": "待检测区"}]}


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        for width in [1440, 1024, 390]:
            for full in [True, False]:
                for scenario in ["conflict", "success"]:
                    context = browser.new_context(viewport={"width": width, "height": 1000})
                    page = context.new_page()
                    page.set_default_timeout(10000)
                    invoice, writes, errors, reads = fixture(), [], [], []
                    card = {"id": "KC-LOCAL", "productId": PRODUCT["id"], "productName": PRODUCT["name"], "purchaseInvoiceNo": invoice["invoiceNo"],
                            "sn": "" if full else "SN-LOCAL", "status": "待检测" if full else "已入库", "costPrice": 100, "warehouseLocation": "待检测区" if full else "A区"}
                    page.on("pageerror", lambda error: errors.append(str(error)))

                    def providers(route):
                        response = route.fetch()
                        body = response.text()
                        assert "const queryClient = new QueryClient" in body
                        route.fulfill(response=response, body=body + "\nwindow.__purchaseDraftTestQueries = queryClient;\n")

                    def api(route):
                        request = route.request
                        path = urlparse(request.url).path
                        if request.method == "PUT" and path == "/api/purchase-invoices/PUR-LOCAL":
                            command = request.post_data_json
                            writes.append(command)
                            if command["expectedRecordVersion"] != invoice["recordVersion"]:
                                route.fulfill(status=409, content_type="application/json", body=json.dumps({"error": {"code": "CONFLICT", "message": CONFLICT, "details": {"kind": "STALE_PURCHASE_RECORD"}}}))
                                return
                            invoice.update({key: value for key, value in command.items() if key != "expectedRecordVersion"})
                            invoice["recordVersion"] += 1
                            body = {"data": invoice, "stateMerge": {"purchaseInvoices": [invoice]}}
                        elif path == "/api/auth/me":
                            body = {"data": {"id": "local-version-user", "username": "local-version-user", "displayName": "本地测试员", "role": "老板", "enabled": True, "csrfToken": "local-only-csrf"}}
                        elif path == "/api/purchase-invoices/detail":
                            reads.append(invoice["recordVersion"])
                            body = {"data": {"purchaseInvoices": [invoice], "inventory": [card], "inspections": [], "paymentOutRecords": [], "returnOrders": []}, "meta": {"source": "database-detail"}}
                        elif path.startswith("/api/purchase-invoices/reference"):
                            body = {"data": {"products": [PRODUCT], "vendors": [VENDOR], "customers": [], "settlementAccounts": [ACCOUNT], "inventory": [], "purchaseInvoices": []}}
                        elif path.startswith("/api/state"):
                            body = {"data": {"products": [PRODUCT], "vendors": [VENDOR], "customers": [], "settlementAccounts": [ACCOUNT], "purchaseInvoices": [invoice], "inventory": [card], "systemUsers": [], "customPermissions": []}}
                        elif request.method not in ["GET", "HEAD"] and path != "/api/ops/client-events":
                            raise AssertionError("Unexpected business write: " + path)
                        else:
                            body = {"data": [], "meta": {"total": 0}}
                        route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

                    page.route(BASE + "/src/app/providers.tsx*", providers)
                    page.route(BASE + "/api/**", api)
                    try:
                        page.goto(BASE + "/purchase/PUR-LOCAL/edit")
                        page.wait_for_load_state("networkidle")
                        form = page.locator("form:visible").filter(has=page.locator('textarea[name="remarks"]'))
                        print(json.dumps({"width": width, "full": full, "scenario": scenario, "buttons": form.locator("button").all_text_contents()}, ensure_ascii=False), flush=True)
                        remarks = form.locator('textarea[name="remarks"]')
                        expect(remarks).to_have_value("原始备注")
                        remarks.fill("保留我的编辑内容")
                        if scenario == "conflict":
                            invoice["recordVersion"] = 2
                            invoice["remarks"] = "别人刚保存的内容"
                            page.evaluate("async () => await window.__purchaseDraftTestQueries.invalidateQueries({queryKey: ['purchase', 'detail', 'PUR-LOCAL']})")
                            assert reads[-1] == 2, reads
                            expect(remarks).to_have_value("保留我的编辑内容")
                        save = form.get_by_role("button", name="保存采购单修改", exact=True)
                        expect(save).to_be_enabled()
                        save.click()
                        if scenario == "conflict":
                            expect(page.get_by_role("alert").filter(has_text=CONFLICT)).to_be_visible()
                            expect(page.get_by_role("alert")).to_contain_text("重新打开采购单核对")
                            expect(remarks).to_have_value("保留我的编辑内容")
                            assert page.url.endswith("/purchase/PUR-LOCAL/edit")
                            assert writes[0]["expectedRecordVersion"] == 1, writes
                            assert invoice["remarks"] == "别人刚保存的内容"
                            if not full:
                                assert set(writes[0]) == {"expectedRecordVersion", "expressNo", "remarks"}
                            if width in [1440, 390] and full:
                                page.screenshot(path=f"/private/tmp/erp-purchase-edit-{width}.png", full_page=True)
                        else:
                            page.wait_for_url(BASE + "/purchase/PUR-LOCAL")
                            page.wait_for_load_state("networkidle")
                            assert writes[0]["expectedRecordVersion"] == 1, writes
                            assert invoice["recordVersion"] == 2
                            page.evaluate("async () => {const {router} = await import('/src/app/router.tsx'); await router.navigate({to: '/purchase/$purchaseId/edit', params: {purchaseId: 'PUR-LOCAL'}});}")
                            page.wait_for_load_state("networkidle")
                            form = page.locator("form:visible").filter(has=page.locator('textarea[name="remarks"]'))
                            remarks = form.locator('textarea[name="remarks"]')
                            expect(remarks).to_have_value("保留我的编辑内容")
                            remarks.fill("再次编辑已保存版本")
                            form.get_by_role("button", name="保存采购单修改", exact=True).click()
                            page.wait_for_url(BASE + "/purchase/PUR-LOCAL")
                            assert writes[1]["expectedRecordVersion"] == 2, writes
                            assert invoice["recordVersion"] == 3
                        assert not errors, errors
                        print(json.dumps({"passed": True, "width": width, "mode": "full" if full else "metadata", "scenario": scenario, "submittedVersions": [write["expectedRecordVersion"] for write in writes]}, ensure_ascii=False), flush=True)
                    finally:
                        context.close()
    finally:
        browser.close()
