"""Local-only mobile workbench regression. APIs are intercepted test fixtures;
no production data/session/database is accessed. Use against local Vite only.
"""
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("FORM_SMOKE_BASE_URL", "http://127.0.0.1:3010").rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost", "::1"}:
    raise RuntimeError("Mobile regression is restricted to a local frontend")
ARTIFACTS = Path(os.environ.get("MOBILE_SMOKE_OUTPUT", "/private/tmp/erp-mobile-workbench"))
ARTIFACTS.mkdir(parents=True, exist_ok=True)
PRODUCT = {"id": "P-MOBILE", "name": "技嘉 RTX4090 AERO OC 雪鹰 24G", "category": "显卡", "brand": "技嘉", "model": "RTX4090", "version": "AERO OC 雪鹰", "vram": "24G", "refBuyPrice": 100, "refSellPrice": 150}
PARTNER = {"id": "C-MOBILE", "name": "手机测试客户", "partnerType": "customer", "contact": "LOCAL-ONLY", "selectable": True}
ACCOUNT = {"id": "SA-MOBILE", "name": "本地测试账户", "enabled": True, "type": "微信", "balance": 10000}
STOCK = {**PRODUCT, "id": "KC-MOBILE", "productId": PRODUCT["id"], "productName": PRODUCT["name"], "sn": "SN-MOBILE-4090", "status": "已入库", "condition": "95新", "warehouseLocation": "A区货架01", "costPrice": 100, "estSellPrice": 150, "entryTime": "2026-10-01", "supplierName": PARTNER["name"], "purchaseHandler": "手机测试员"}
PENDING = [{**STOCK, "id": "KC-CHECK-USED", "sn": "", "status": "待检测"}, {**STOCK, "id": "KC-CHECK-NEW", "sn": "", "condition": "全新", "status": "待检测", "productName": "全新 技嘉 RTX4090 AERO OC 雪鹰 24G"}]
ORDER = {"id": "XS-MOBILE", "invoiceNo": "XS-MOBILE-001", "date": "2026-10-07", "customerName": PARTNER["name"], "totalCount": 1, "totalAmount": 150, "paidAmount": 150, "unpaidAmount": 0, "outboundStatus": "待出库", "items": [{"inventoryId": STOCK["id"], "productId": PRODUCT["id"], "productName": PRODUCT["name"], "sn": STOCK["sn"], "sellPrice": 150, "costPrice": 100, "profit": 50, "condition": "95新"}]}
PURCHASE_RETURN_SOURCE = {"id": "CG-MOBILE", "invoiceNo": "JH-MOBILE-001", "date": "2026-10-01", "supplierName": PARTNER["name"], "sourceType": "商家批发", "totalCost": 200, "paidAmount": 0, "unpaidAmount": 200, "vendorCreditAppliedAmount": 0, "items": [{**PRODUCT, "productId": PRODUCT["id"], "productName": PRODUCT["name"], "sn": f"SN-P-{index}", "buyPrice": 100} for index in range(2)]}
SALES_RETURN_SOURCE = {**ORDER, "id": "XS-RETURN-MOBILE", "invoiceNo": "XS-RETURN-MOBILE-001", "outboundStatus": "已出库", "totalCount": 2, "totalAmount": 300, "paidAmount": 300, "items": [{**ORDER["items"][0], "inventoryId": f"KC-S-{index}", "sn": f"SN-S-{index}"} for index in range(2)]}
RETURN_STOCK = [{**STOCK, "id": f"KC-P-{index}", "sn": f"SN-P-{index}", "purchaseInvoiceNo": PURCHASE_RETURN_SOURCE["invoiceNo"]} for index in range(2)] + [{**STOCK, "id": f"KC-S-{index}", "sn": f"SN-S-{index}", "salesInvoiceId": SALES_RETURN_SOURCE["id"], "status": "已售出"} for index in range(2)]
STATE = {key: [] for key in ["products", "inventory", "inspections", "salesInvoices", "purchaseInvoices", "customers", "vendors", "systemUsers", "customPermissions", "returnOrders", "marketQuotes"]}
STATE.update(products=[PRODUCT], inventory=[STOCK] + PENDING + RETURN_STOCK, purchaseInvoices=[PURCHASE_RETURN_SOURCE], salesInvoices=[ORDER, SALES_RETURN_SOURCE], customers=[PARTNER], settlementAccounts=[ACCOUNT])
SEED = """const drafts = {
  purchase_add: {values: {...createPurchaseDefaults('手机测试员'), sourcePartnerId: 'C-MOBILE', sourcePartnerType: 'customer', supplierName: '手机测试客户', contact: 'LOCAL-ONLY', settlementAccountId: 'SA-MOBILE', paidAmount: 100, remarks: '原始采购草稿', items: [{...createPurchaseDefaults('手机测试员').items[0], productId: 'P-MOBILE', productName: '技嘉 RTX4090 AERO OC 雪鹰 24G', brand: '技嘉', model: 'RTX4090', buyPrice: 100, estSellPrice: 150}, ...createPurchaseDefaults('手机测试员').items.slice(1)]}, selectedSource: PARTNER},
  sales_add: {values: {...createSalesDefaults('手机测试员'), customerId: 'C-MOBILE', customerName: '手机测试客户', contact: 'LOCAL-ONLY', settlementAccountId: 'SA-MOBILE', paidAmount: 150, remarks: '原始销售草稿', items: [{...createSalesDefaults('手机测试员').items[0], productId: 'P-MOBILE', productName: '技嘉 RTX4090 AERO OC 雪鹰 24G', brand: '技嘉', model: 'RTX4090', sellPrice: 150}, ...createSalesDefaults('手机测试员').items.slice(1)]}, selectedCustomer: PARTNER, selectedCandidatesByIndex: [{id: 'P-MOBILE', productId: 'P-MOBILE', productName: '技嘉 RTX4090 AERO OC 雪鹰 24G', category: '显卡', brand: '技嘉', model: 'RTX4090', vram: '24G', availableQuantity: 10, availabilityKnown: true, estimatedSellPrice: 150}]}
};""".replace("PARTNER", json.dumps(PARTNER, ensure_ascii=False))


RETURN_DRAFTS = {
    "return_purchase": {"values": {"date": "2026-10-01", "relatedDocNo": PURCHASE_RETURN_SOURCE["invoiceNo"], "sourceInventoryId": "KC-P-0", "amount": 100, "settlementMode": "抵扣账款", "settlementAccountId": "", "handler": "手机测试员", "reason": "本地退货原因", "inventoryAction": "退回供应商", "remarks": "原始退货草稿", "returnScope": "single"}},
    "return_sales": {"values": {"date": "2026-10-01", "relatedDocNo": SALES_RETURN_SOURCE["invoiceNo"], "sourceInventoryId": "KC-S-0", "sourceSalesItemIndex": 0, "productId": PRODUCT["id"], "productName": PRODUCT["name"], "sn": "SN-S-0", "partyName": PARTNER["name"], "partyId": PARTNER["id"], "contact": PARTNER["contact"], "amount": 150, "inventoryAction": "退回待检测", "reason": "本地退货原因", "responsibility": "客户", "handler": "手机测试员", "remarks": "原始退货草稿", "returnScope": "single"}},
}
SEED += "\nObject.assign(drafts, " + json.dumps(RETURN_DRAFTS, ensure_ascii=False) + ");"


def attach(page, allowed=None, return_outcome=None):
    requests, writes, errors = [], [], []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def runtime(route):
        response = route.fetch()
        body = response.text()
        assert "const drafts = {};" in body
        imports = 'import {createPurchaseDefaults} from "/src/features/purchase/purchase.defaults.ts"; import {createSalesDefaults} from "/src/features/sales/sales.defaults.ts";\n'
        route.fulfill(response=response, body=imports + body.replace("const drafts = {};", SEED))

    def api(route):
        request = route.request
        path = urlparse(request.url).path
        requests.append(path)
        body = {"data": [], "meta": {"total": 0, "page": 1, "pageSize": 20}}
        if path == "/api/auth/me":
            user = {"id": "local-mobile", "username": "local-mobile", "displayName": "手机测试员", "role": "老板" if allowed is None else "店员", "enabled": True, "csrfToken": "local-only"}
            if allowed is not None:
                user["permissionOverrides"] = {"allowedMenus": allowed, "showCost": False, "showProfit": False}
            body = {"data": user}
        elif path.startswith("/api/state") or path.startswith("/api/returns/reference") or path == "/api/purchase-invoices/reference":
            body = {"data": STATE}
        elif path == "/api/sales/customers":
            body = {"data": [{**PARTNER, "displayName": PARTNER["name"], "roles": ["customer"], "primaryPhone": "LOCAL-ONLY", "legacyCustomer": PARTNER}]}
        elif path == "/api/sales/product-candidates":
            body = {"data": [{**PRODUCT, "productId": PRODUCT["id"], "productName": PRODUCT["name"], "availableQuantity": 10, "availabilityKnown": True, "saleable": True, "estimatedSellPrice": 150}]}
        elif path == "/api/inventory/items":
            body = {"data": [STOCK], "meta": {"total": 1, "page": 1, "pageSize": 20}}
        elif path == "/api/inventory/summary":
            body = {"data": [{"totalCount": 3, "availableCount": 1, "pendingCount": 2, "lockedCount": 0, "totalCost": 300}]}
        elif path == "/api/inspections/workspace":
            body = {"data": STATE}
        elif path == "/api/sales-invoices/outbound":
            body = {"data": {**STATE, "salesInvoices": [ORDER]}, "meta": {"total": 1, "page": 1, "pageSize": 20, "totalPages": 1, "summary": {"pendingItemCount": 1, "pendingAmount": 150}}}
        elif path.endswith("/settlement-accounts"):
            body = {"data": [ACCOUNT]}
        elif path == "/api/returns" and request.method == "POST":
            writes.append({"path": path, "body": request.post_data_json, "key": request.headers.get("idempotency-key")})
            if return_outcome and return_outcome[0] == "success":
                route.fulfill(status=201, content_type="application/json", body=json.dumps({"data": {"id": "RET-MOBILE", "returnNo": "TH-MOBILE-001", "status": "待处理"}}))
            else:
                route.fulfill(status=400, content_type="application/json", body=json.dumps({"error": {"message": "本地退货失败：输入已保留"}}))
            return
        elif path in {"/api/purchase-invoices", "/api/sales-invoices"} and request.method == "POST":
            writes.append({"path": path, "body": request.post_data_json, "key": request.headers.get("idempotency-key")})
            route.fulfill(status=409, content_type="application/json", body=json.dumps({"error": {"message": "本地模拟冲突：当前输入已保留"}}))
            return
        elif request.method not in {"GET", "HEAD", "OPTIONS"} and path != "/api/ops/client-events":
            raise AssertionError("Unexpected business write: " + path)
        route.fulfill(status=200, content_type="application/json", body=json.dumps(body, ensure_ascii=False))

    page.route(BASE + "/api/**", api)
    page.route(BASE + "/src/hooks/useWorkspaceTabRuntime.tsx*", runtime)
    return requests, writes, errors


def visit(page, route):
    page.goto(BASE + route)
    page.wait_for_load_state("networkidle")
    expect(page.locator("#main-content")).to_be_visible(timeout=15000)


def check_layout(page, width):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), page.url
    assert page.locator("#main-content").evaluate("el => el.scrollWidth <= el.clientWidth + 1"), page.url
    nav = page.get_by_role("navigation", name="手机主导航", exact=True)
    if width < 768:
        expect(nav).to_be_visible()
        for item in nav.locator("a,button").all():
            box = item.bounding_box()
            assert box["height"] >= 44 and box["width"] >= 44, box
    else:
        expect(nav).to_have_count(0)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        for width in [320, 360, 390, 430, 768, 1024, 1440]:
            context = browser.new_context(viewport={"width": width, "height": 844}, is_mobile=width < 768, has_touch=width < 768)
            page = context.new_page()
            return_outcome = ["error"]
            requests, writes, errors = attach(page, return_outcome=return_outcome)
            try:
                visit(page, "/")
                check_layout(page, width)
                if width < 768:
                    expect(page.get_by_role("heading", name="待处理", exact=True)).to_be_visible()
                    assert "/api/ai/insights" not in requests, requests
                    page.screenshot(path=str(ARTIFACTS / f"workbench-{width}.png"), full_page=True)
                    page.get_by_role("button", name="我的", exact=True).click()
                    expect(page.get_by_role("dialog")).to_be_visible()
                    expect(page.get_by_role("link", name="员工管理", exact=True)).to_have_count(0)
                    expect(page.get_by_role("link", name="月结与财务体检", exact=True)).to_have_count(0)
                    page.get_by_role("searchbox", name="查找手机功能").fill("质检")
                    page.get_by_role("link", name="检测质检", exact=True).click()
                    expect(page.get_by_role("dialog")).to_have_count(0)
                    expect(page.get_by_role("button").filter(has_text="技嘉 RTX4090 AERO OC 雪鹰 24G").first).to_be_visible()
                visit(page, "/inventory")
                check_layout(page, width)
                if width < 768:
                    cards = page.locator('[data-erp-region="mobile-table-cards"] article')
                    expect(cards).to_have_count(1)
                    assert cards.first.bounding_box()["y"] < 784, cards.first.bounding_box()
                    expect(cards.first.get_by_text(PRODUCT["name"], exact=True)).to_be_visible()
                    expect(cards.first.get_by_text("已入库", exact=True)).to_be_visible()
                    expect(cards.first.get_by_text("¥150", exact=True)).to_be_visible()
                    page.evaluate("""code => {
                      window.__cameraStops = 0;
                      window.BarcodeDetector = class { async detect() { return [{rawValue: code}]; } };
                      navigator.mediaDevices.getUserMedia = async () => {const stream = new MediaStream(); stream.getTracks = () => [{stop: () => window.__cameraStops++}]; return stream;};
                      HTMLMediaElement.prototype.play = async () => {};
                    }""", STOCK["sn"])
                    page.get_by_role("button", name="扫码搜索库存", exact=True).click()
                    expect(page.get_by_role("searchbox", name="搜索库存", exact=True)).to_have_value(STOCK["sn"])
                    expect(page.get_by_role("dialog")).to_have_count(0)
                    assert page.evaluate("window.__cameraStops") > 0
                    page.get_by_role("searchbox", name="搜索库存", exact=True).fill("")
                    expect(cards).to_have_count(1)
                    page.get_by_role("button", name="筛选", exact=True).click()
                    expect(page.get_by_role("dialog")).to_be_visible()
                    page.get_by_role("textbox", name="品牌", exact=True).fill("技嘉")
                    page.get_by_role("button", name="查看结果", exact=True).click()
                    expect(page.get_by_role("dialog")).to_have_count(0)
                    page.get_by_role("button", name="筛选", exact=False).click()
                    expect(page.get_by_role("textbox", name="品牌", exact=True)).to_have_value("技嘉")
                    page.get_by_role("button", name="查看结果", exact=True).click()
                    expect(page.locator('[data-erp-region="mobile-table-cards"] article')).to_have_count(1)
                    page.screenshot(path=str(ARTIFACTS / f"inventory-{width}.png"), full_page=True)
                for editor in ["sales", "purchase"]:
                    visit(page, "/" + editor + "/new")
                    check_layout(page, width)
                    workflow = page.locator('[data-erp-component="mobile-workflow"]:visible')
                    if width < 768:
                        expect(workflow.get_by_role("button", name="下一步：结算", exact=True)).to_be_enabled()
                        expect(workflow.locator('[data-erp-region="line-items-cards"] article:visible')).to_have_count(1)
                        workflow.get_by_role("button", name="增加第 1 行数量", exact=True).click()
                        workflow.get_by_role("button", name="下一步：结算", exact=True).click()
                        workflow.get_by_text("物流、质保与备注（可选）" if editor == "sales" else "物流、备注与图片（可选）", exact=True).click()
                        remarks = workflow.locator('textarea[name="remarks"]')
                        remarks.fill("手机切换保留草稿")
                        submit = workflow.get_by_role("button", name="确认开单 · 待出库" if editor == "sales" else "确认提交 · 等待检测入库", exact=True)
                        expect(submit).to_be_enabled()
                        assert submit.bounding_box()["y"] + submit.bounding_box()["height"] <= 784, submit.bounding_box()
                        page.screenshot(path=str(ARTIFACTS / f"{editor}-settlement-{width}.png"), full_page=True)
                        page.get_by_role("navigation", name="手机主导航", exact=True).get_by_role("link", name="库存", exact=True).click()
                        page.get_by_role("navigation", name="手机主导航", exact=True).get_by_role("button", name="开单", exact=True).click()
                        page.get_by_role("link", name="销售开单" if editor == "sales" else "采购开单", exact=False).click()
                        expect(remarks).to_have_value("手机切换保留草稿")
                        expect(workflow).to_have_attribute("data-mobile-step", "1")
                        submit.click()
                        expect(page.get_by_role("alert").filter(has_text="本地模拟冲突")).to_be_visible()
                        expect(remarks).to_have_value("手机切换保留草稿")
                        assert writes[-1]["body"]["items"][0]["productId"] == PRODUCT["id"], writes
                        expect(submit).to_be_enabled()
                        submit.click()
                        page.wait_for_timeout(250)
                        assert writes[-1]["key"] == writes[-2]["key"], writes
                        before = len(writes)
                        workflow.get_by_role("navigation", name="录入步骤").get_by_role("button").first.click()
                        workflow.locator("form").evaluate("form => form.requestSubmit()")
                        page.wait_for_timeout(100)
                        assert len(writes) == before
                        page.set_viewport_size({"width": 1440, "height": 844})
                        expect(workflow.locator('[data-erp-region="line-items-table"]')).to_be_visible()
                        expect(workflow.get_by_role("spinbutton", name="第 1 行数量", exact=True)).to_have_value("2")
                        expect(remarks).to_have_value("手机切换保留草稿")
                        page.set_viewport_size({"width": width, "height": 844})
                    else:
                        expect(workflow.locator("form")).to_have_count(1)
                        if width >= 1024:
                            expect(workflow.locator('[data-erp-region="line-items-table"]')).to_be_visible()
                            assert workflow.locator('table tbody tr').count() == 4
                if width < 768:
                    visit(page, "/inspections")
                    page.get_by_role("button").filter(has_text="全新 技嘉").click()
                    expect(page.get_by_role("button", name="确认全新入库", exact=True)).to_be_disabled()
                    page.locator('input[name="serialNumber"]').fill("NEW-MOBILE-UNIQUE")
                    expect(page.get_by_role("button", name="确认全新入库", exact=True)).to_be_enabled()
                    expect(page.get_by_role("button", name="下一步：检测", exact=True)).to_have_count(0)
                    page.screenshot(path=str(ARTIFACTS / f"inspection-new-{width}.png"), full_page=True)
                    page.get_by_role("button", name="返回列表", exact=True).click()
                    page.get_by_role("button").filter(has_text="经办人：手机测试员").filter(has_not_text="全新").first.click()
                    page.get_by_role("dialog", name="当前内容尚未保存", exact=True).get_by_role("button", name="放弃并离开", exact=True).click()
                    inspect = page.locator('[data-erp-component="mobile-workflow"]:visible')
                    expect(inspect.get_by_role("button", name="下一步：检测", exact=True)).to_be_disabled()
                    inspect.locator('input[name="serialNumber"]').fill("USED-MOBILE-UNIQUE")
                    inspect.get_by_role("button", name="下一步：检测", exact=True).click()
                    expect(inspect).to_have_attribute("data-mobile-step", "1")
                    expect(inspect.get_by_role("button", name="下一步：确认", exact=True)).to_be_disabled()
                    inspect.locator('input[name="furmarkResult"]').fill("本地模拟测试通过")
                    inspect.locator('input[name="threedMarkResult"]').fill("12345")
                    inspect.locator('input[name="temperature"]').fill("65")
                    inspect.locator('input[name="wattage"]').fill("300")
                    inspect.get_by_role("button", name="下一步：确认", exact=True).click()
                    expect(inspect).to_have_attribute("data-mobile-step", "2")
                    expect(inspect.get_by_role("button", name="提交检测入库", exact=True)).to_be_enabled()
                    expect(inspect.get_by_role("region", name="待确认检测信息").get_by_text("SN：USED-MOBILE-UNIQUE", exact=True)).to_be_visible()
                    page.screenshot(path=str(ARTIFACTS / f"inspection-used-{width}.png"), full_page=True)
                    visit(page, "/sales/outbound")
                    expect(page.get_by_role("button", name="扫码确认出库", exact=True)).to_have_count(0)
                    page.get_by_role("button", name="查看 " + ORDER["invoiceNo"], exact=True).click()
                    page.get_by_role("textbox", name="销售出库扫码枪输入").fill(STOCK["sn"])
                    page.get_by_role("button", name="追加扫码内容", exact=True).click()
                    expect(page.get_by_role("button", name="扫码确认出库", exact=True)).to_be_enabled()
                    page.get_by_role("button", name="返回待出库单据", exact=True).click()
                    page.get_by_role("button", name="查看 " + ORDER["invoiceNo"], exact=True).click()
                    expect(page.get_by_role("textbox", name="已扫描库存 ID / SN")).to_have_value(STOCK["sn"])
                if width == 390:
                    for editor in ["purchase", "sales"]:
                        for scope in (["single", "multiple", "document"] if editor == "purchase" else ["single", "document"]):
                            return_outcome[0] = "error"
                            visit(page, "/" + editor + "/returns/new")
                            workflow = page.locator('[data-erp-component="mobile-workflow"]:visible')
                            if editor == "sales":
                                workflow.get_by_role("button", name="下一步：商品", exact=True).click()
                            if scope == "document":
                                workflow.get_by_role("button", name="整单退货", exact=True).click()
                            elif scope == "multiple":
                                workflow.get_by_role("button", name="多件退货", exact=True).click()
                                workflow.get_by_role("checkbox").nth(1).check()
                            if editor == "purchase":
                                workflow.get_by_role("button", name="下一步：结算", exact=True).click()
                            workflow.get_by_role("button", name="下一步：确认", exact=True).click()
                            expect(workflow).to_have_attribute("data-mobile-step", "2")
                            remarks = workflow.locator('textarea[placeholder^="补充"]')
                            remarks.fill("手机退货保留草稿")
                            submit = workflow.get_by_role("button", name="提交整单退货" if scope == "document" else "提交多件退货" if scope == "multiple" else "提交采购退货" if editor == "purchase" else "提交销售退货", exact=True)
                            submit.click()
                            expect(page.get_by_role("alert").filter(has_text="本地退货失败")).to_be_visible()
                            expect(remarks).to_have_value("手机退货保留草稿")
                            expected_amount = (100 if editor == "purchase" else 150) * (1 if scope == "single" else 2)
                            assert writes[-1]["body"]["amount"] == expected_amount, writes[-1]
                            assert writes[-1]["body"]["relatedDocNo"] == (PURCHASE_RETURN_SOURCE if editor == "purchase" else SALES_RETURN_SOURCE)["invoiceNo"]
                            if scope != "single":
                                assert len(writes[-1]["body"]["items"]) == 2, writes[-1]
                            return_outcome[0] = "success"
                            expect(submit).to_be_enabled()
                            submit.click()
                            expect(page.get_by_role("status").filter(has_text="TH-MOBILE-001")).to_be_visible()
                            assert writes[-1]["key"] == writes[-2]["key"] and writes[-1]["key"], writes[-2:]
                            expect(remarks).to_have_value("")
                            expect(workflow).to_have_attribute("data-mobile-step", "0")
                            check_layout(page, width)
                            print(json.dumps({"phoneReturn": editor, "scope": scope, "passed": True}), flush=True)
                assert not errors, errors
                print(json.dumps({"width": width, "passed": True, "interceptedWrites": len(writes)}, ensure_ascii=False), flush=True)
            except Exception:
                page.screenshot(path=str(ARTIFACTS / f"failed-{width}.png"), full_page=True)
                print(json.dumps({"url": page.url, "errors": errors}, ensure_ascii=False), flush=True)
                print(page.locator("body").aria_snapshot()[:12000], flush=True)
                raise
            finally:
                context.close()
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()
        attach(page, ["inventory", "sales_outbound"])
        visit(page, "/inventory")
        nav = page.get_by_role("navigation", name="手机主导航", exact=True)
        expect(nav.get_by_role("button", name="开单", exact=True)).to_have_count(0)
        page.get_by_role("button", name="我的", exact=True).click()
        expect(page.get_by_role("link", name="员工管理", exact=True)).to_have_count(0)
        expect(page.get_by_role("link", name="销售出库", exact=True)).to_be_visible()
        context.close()
        print("permission-filtered phone navigation passed", flush=True)
    finally:
        browser.close()
