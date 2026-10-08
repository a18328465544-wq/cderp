"""Local-only Vite regressions for sales/purchase submission ownership.

Uses real defaults, RHF, Zod, pickers and adapters. Workspace drafts and all
business APIs are intercepted, so no real order/account/media is modified.
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
PARTNERS = [{"id": "C-A", "name": "本地客户A", "partnerType": "customer", "contact": "LOCAL-A", "selectable": True}, {"id": "C-B", "name": "本地客户B", "partnerType": "customer", "contact": "LOCAL-B", "selectable": True}]
ACCOUNTS = [{"id": "SA-A", "name": "本地账户A", "type": "微信", "enabled": True, "balance": 10000}, {"id": "SA-B", "name": "本地账户B", "type": "支付宝", "enabled": True, "balance": 10000}]
PRODUCT = {"id": "P-A", "name": "本地 RTX5090", "category": "显卡", "model": "RTX5090", "brand": "本地", "version": "OC", "vram": "32G", "refBuyPrice": 100, "refSellPrice": 150}
EMPTY = {key: [] for key in ["products", "inventory", "inspections", "salesInvoices", "purchaseInvoices", "customers", "vendors", "systemUsers", "customPermissions"]}
STATE = {**EMPTY, "products": [PRODUCT], "customers": PARTNERS, "settlementAccounts": ACCOUNTS}
SEED = """const drafts = {
  purchase_add: {values: {...createPurchaseDefaults('本地测试员'), sourcePartnerId: 'C-A', sourcePartnerType: 'customer', supplierName: '本地客户A', contact: 'LOCAL-A', settlementAccountId: 'SA-A', paymentMethod: '微信', paidAmount: 100, remarks: '原始备注', items: [{...createPurchaseDefaults('本地测试员').items[0], productId: 'P-A', productName: '本地 RTX5090', brand: '本地', model: 'RTX5090', buyPrice: 100, estSellPrice: 150}, ...createPurchaseDefaults('本地测试员').items.slice(1)]}, selectedSource: PARTNER_A},
  sales_add: {values: {...createSalesDefaults('本地测试员'), customerId: 'C-A', customerName: '本地客户A', contact: 'LOCAL-A', settlementAccountId: 'SA-A', paidAmount: 150, remarks: '原始备注', items: [{...createSalesDefaults('本地测试员').items[0], productId: 'P-A', productName: '本地 RTX5090', brand: '本地', model: 'RTX5090', sellPrice: 150}, ...createSalesDefaults('本地测试员').items.slice(1)]}, selectedCustomer: PARTNER_A, selectedCandidatesByIndex: [{id: 'P-A', productId: 'P-A', productName: '本地 RTX5090', category: '显卡', brand: '本地', model: 'RTX5090', vram: '32G', availableQuantity: 10, availabilityKnown: true, estimatedSellPrice: 150}]}
};""".replace("PARTNER_A", json.dumps(PARTNERS[0], ensure_ascii=False))
MODES = os.environ.get("ORDER_SMOKE_MODES", "edit,account,partner,items,hidden,double,unchanged,retry,invalid,pending-success,success-next").split(",")

def tabs(page, width):
    if width < 1024:
        page.locator('button[aria-label^="切换页面，当前为"]').click()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        for width in ([1440] if REPRODUCE else [int(value) for value in os.environ.get("ORDER_SMOKE_WIDTHS", "1440,1024,390").split(",")]):
            for editor in ["purchase", "sales"]:
                for mode in (["edit", "account", "partner", "items", "hidden", "retry", "pending-success"] if REPRODUCE else MODES):
                    context = browser.new_context(viewport={"width": width, "height": 1000})
                    page = context.new_page()
                    writes, held, errors = [], [], []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.add_init_script("window.__delayValidation=false;window.__releaseValidation=[];")

                    def resolver(route):
                        response = route.fetch()
                        body = response.text()
                        export = re.search(r"\b([\w$]+) as zodResolver", body)
                        assert export
                        wrapped = """function orderResolver(...args) { const actual=RESOLVER(...args); return (...values)=> { const result=actual(...values); return window.__delayValidation ? new Promise(resolve=>window.__releaseValidation.push(()=>Promise.resolve(result).then(resolve))) : result; }; }\n"""
                        route.fulfill(response=response, body=wrapped.replace("RESOLVER", export.group(1)) + body.replace(export.group(0), "orderResolver as zodResolver"))

                    def runtime(route):
                        response = route.fetch()
                        body = response.text()
                        assert "const drafts = {};" in body
                        imports = 'import {createPurchaseDefaults} from "/src/features/purchase/purchase.defaults.ts"; import {createSalesDefaults} from "/src/features/sales/sales.defaults.ts";\n'
                        route.fulfill(response=response, body=imports + body.replace("const drafts = {};", SEED))

                    def success(route):
                        command = route.request.post_data_json
                        invoice = {**command, "id": "DOC-LOCAL", "invoiceNo": "LOCAL-001", "items": command["items"], "outboundStatus": "待出库", "totalCount": 1, "totalAmount": 150}
                        body = {"data": invoice}
                        route.fulfill(status=201, content_type="application/json", body=json.dumps(body))

                    def api(route):
                        request = route.request
                        path = urlparse(request.url).path
                        if path == "/api/auth/me":
                            body = {"data": {"id": "local-order", "username": "local-order", "displayName": "本地测试员", "role": "老板", "enabled": True, "csrfToken": "local-csrf"}}
                        elif path.startswith("/api/state") or path.startswith("/api/purchase-invoices/reference"):
                            body = {"data": STATE}
                        elif path.endswith("/settlement-accounts"):
                            body = {"data": ACCOUNTS, "meta": {"total": 2}}
                        elif path == "/api/sales/customers":
                            body = {"data": [{"id": partner["id"], "displayName": partner["name"], "primaryWechat": partner["contact"], "roles": ["customer"], "legacyCustomer": {"id": partner["id"], "name": partner["name"], "wechat": partner["contact"]}} for partner in PARTNERS], "meta": {"total": 2}}
                        elif path == "/api/sales/product-candidates":
                            body = {"data": []}
                        elif path in ["/api/purchase-invoices", "/api/sales-invoices"] and request.method == "POST":
                            writes.append({"body": request.post_data_json, "key": request.headers.get("idempotency-key")})
                            if mode == "pending-success":
                                held.append(route)
                                return
                            if mode == "success-next":
                                success(route)
                                return
                            route.fulfill(status=400, content_type="application/json", body=json.dumps({"error": {"message": "本地订单保存反馈"}}))
                            return
                        elif request.method not in ["GET", "HEAD"] and path != "/api/ops/client-events":
                            raise AssertionError("Unexpected business write: " + path)
                        else:
                            body = {"data": [], "meta": {"total": 0}}
                        route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

                    page.route(BASE + "/api/**", api)
                    page.route(BASE + "/src/hooks/useWorkspaceTabRuntime.tsx*", runtime)
                    page.route(BASE + "/node_modules/.vite/deps/@hookform_resolvers_zod.js*", resolver)
                    try:
                        page.goto(BASE + "/" + editor + "/new")
                        page.wait_for_load_state("networkidle")
                        form = page.locator("form").filter(has=page.locator('textarea[name="remarks"]'))
                        remarks = form.locator('textarea[name="remarks"]')
                        expect(remarks).to_have_value("原始备注")
                        expect(form.get_by_role("button", name="确认提交 · 等待检测入库" if editor == "purchase" else "确认开单 · 待出库", exact=True)).to_be_enabled()
                        if mode == "invalid":
                            form.get_by_role("spinbutton", name="第 1 行数量", exact=True).fill("0")
                        delayed = mode not in ["retry", "pending-success", "success-next"]
                        page.evaluate("window.__delayValidation=" + ("true" if delayed else "false"))
                        form.evaluate("form=>form.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}))") if mode == "invalid" else form.evaluate("form=>form.requestSubmit()")
                        if delayed:
                            page.wait_for_function("window.__releaseValidation.length > 0")
                        if mode == "edit":
                            remarks.fill("修改后的备注")
                        elif mode == "account":
                            form.get_by_role("combobox", name="收款账户", exact=True).click()
                            page.get_by_role("option").filter(has_text="本地账户B").click()
                        elif mode == "partner":
                            form.get_by_role("button", name="清除采购来源" if editor == "purchase" else "清除客户", exact=True).click()
                            form.get_by_role("textbox", name="搜索采购来源" if editor == "purchase" else "搜索销售客户", exact=True).fill("本地客户B")
                            page.get_by_role("option").filter(has_text="本地客户B").click()
                        elif mode == "items":
                            form.get_by_role("spinbutton", name="第 1 行数量", exact=True).fill("2")
                        elif mode == "hidden":
                            tabs(page, width)
                            page.get_by_role("link", name="首页", exact=False).click()
                            page.wait_for_load_state("networkidle")
                        elif mode == "double":
                            form.evaluate("form=>form.requestSubmit()")
                        elif mode == "pending-success":
                            page.wait_for_timeout(250)
                            assert len(held) == 1, writes
                            if REPRODUCE:
                                print(json.dumps({"editor": editor, "mode": mode, "remarksLocked": remarks.is_disabled(), "partnerLocked": form.get_by_role("button", name="清除采购来源" if editor == "purchase" else "清除客户", exact=True).is_disabled()}), flush=True)
                            else:
                                expect(remarks).to_be_disabled()
                                expect(form.get_by_role("button", name="清除采购来源" if editor == "purchase" else "清除客户", exact=True)).to_be_disabled()
                                expect(form.get_by_role("spinbutton", name="第 1 行数量", exact=True)).to_be_disabled()
                                expect(form.get_by_role("combobox", name="收款账户", exact=True)).to_be_disabled()
                            success(held.pop())
                        if delayed:
                            page.evaluate("window.__delayValidation=false;window.__releaseValidation.splice(0).forEach(fn=>fn())")
                        page.wait_for_timeout(450)
                        if mode == "retry":
                            form.evaluate("form=>form.requestSubmit()")
                            page.wait_for_timeout(300)
                            remarks.fill("原始备注 ")
                            form.evaluate("form=>form.requestSubmit()")
                            page.wait_for_timeout(300)
                            remarks.fill("修改后的备注")
                            form.evaluate("form=>form.requestSubmit()")
                            page.wait_for_timeout(300)
                            assert len(writes) == 4, writes
                            if not REPRODUCE:
                                assert writes[0]["key"] == writes[1]["key"] == writes[2]["key"], writes
                                assert writes[3]["key"] != writes[0]["key"], writes
                        if REPRODUCE and mode != "pending-success":
                            print(json.dumps({"editor": editor, "mode": mode, "writes": writes}, ensure_ascii=False), flush=True)
                        elif not REPRODUCE:
                            if mode in ["edit", "account", "partner", "items", "hidden", "invalid"]:
                                assert not writes, writes
                                if mode not in ["hidden", "invalid"]:
                                    expect(page.get_by_role("alert").filter(has_text="内容已更新")).to_be_visible()
                                    form.evaluate("form=>form.requestSubmit()")
                                    page.wait_for_timeout(300)
                                    assert len(writes) == 1, writes
                                    body = writes[0]["body"]
                                    if mode == "edit":
                                        assert body["remarks"] == "修改后的备注"
                                    if mode == "account":
                                        assert body["settlementAccountId"] == "SA-B" and body["settlementAccountName"] == "本地账户B", body
                                        assert body["paymentMethod"] == "支付宝", body
                                    if mode == "partner":
                                        assert body["sourcePartnerId" if editor == "purchase" else "customerId"] == "C-B", body
                                        assert body["supplierName" if editor == "purchase" else "customerName"] == "本地客户B", body
                                        assert body["contact"] == "LOCAL-B", body
                                    if mode == "items":
                                        assert len(body["items"]) == 2, body
                                        assert body["paidAmount"] == (200 if editor == "purchase" else 300), body
                                if mode == "hidden":
                                    tabs(page, width)
                                    page.get_by_role("link", name="采购开单" if editor == "purchase" else "销售开单", exact=False).click()
                                    page.wait_for_load_state("networkidle")
                                    expect(remarks).to_have_value("原始备注")
                                    form.evaluate("form=>form.requestSubmit()")
                                    page.wait_for_timeout(300)
                                    assert len(writes) == 1, writes
                                if mode == "invalid":
                                    expect(page.get_by_role("alert")).to_be_visible()
                            elif mode in ["double", "unchanged"]:
                                assert len(writes) == 1, writes
                            elif mode in ["pending-success", "success-next"]:
                                expect(remarks).to_have_value("")
                                remarks.fill("下一张单据")
                                page.wait_for_timeout(200)
                                expect(remarks).to_have_value("下一张单据")
                                assert len(writes) == 1, writes
                            print(json.dumps({"width": width, "editor": editor, "mode": mode, "passed": True}), flush=True)
                        assert not errors, errors
                        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
                    except Exception:
                        page.screenshot(path=f"/private/tmp/erp-order-{editor}-{mode}-{width}-failed.png", full_page=True)
                        print(form.evaluate("form=>({valid:form.checkValidity(), invalid:[...form.elements].filter(e=>e.willValidate&&!e.validity.valid).map(e=>({label:e.getAttribute('aria-label'), value:e.value, message:e.validationMessage}))})"), flush=True)
                        print(page.locator("body").aria_snapshot(), flush=True)
                        raise
                    finally:
                        context.close()
    finally:
        browser.close()
