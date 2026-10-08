"""Local-only outbound protocol regression; all business APIs are intercepted.

Run against a local Vite server via FORM_SMOKE_BASE_URL. PostgreSQL persistence
is verified separately by npm run test:backend-http:docker.
"""
import copy
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


BASE = os.environ.get("FORM_SMOKE_BASE_URL", "http://127.0.0.1:3010").rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost", "::1"}:
    raise RuntimeError("Browser regression is restricted to local servers")

ARTIFACTS = Path("output/playwright/sales-outbound")
ARTIFACTS.mkdir(parents=True, exist_ok=True)
STOCK = [
    {"id": "KC-OUTBOUND-1", "sn": "T8YVNC03WDS0SYD", "productId": "P-OUTBOUND-1", "productName": "华硕 RTX5070 PRIME OC 12G", "status": "已入库", "condition": "95新"},
    {"id": "KC-OUTBOUND-2", "sn": "郭老师拿回家", "productId": "P-OUTBOUND-2", "productName": "万丽 RTX5070 星云 12G", "status": "已入库", "condition": "95新"},
]
ORDER = {
    "id": "XS-local-outbound-id", "invoiceNo": "XS-20261003-005", "date": "2026-10-03",
    "customerName": "本地出库测试客户", "contact": "", "channel": "到店", "paymentMethod": "账期欠款",
    "paidAmount": 0, "unpaidAmount": 11200, "totalCount": 2, "totalAmount": 11200,
    "totalCost": 0, "totalProfit": 0, "outboundStatus": "待出库",
    "items": [{"inventoryId": item["id"], "productId": item["productId"], "productName": item["productName"],
               "sn": item["sn"], "sellPrice": 5600, "costPrice": 0, "profit": 0, "condition": "95新", "aftersalesTerms": ""}
              for item in STOCK],
}
STATE = {key: [] for key in ["products", "inventory", "salesInvoices", "purchaseInvoices", "customers", "vendors", "customPermissions", "systemUsers"]}


def run_case(browser, width, mode):
    context = browser.new_context(viewport={"width": width, "height": 900})
    page = context.new_page()
    calls = []
    page_errors = []
    unexpected = []
    completed = False
    user = {"id": "local-warehouse", "username": "local-warehouse", "displayName": "本地仓库员", "role": "店员", "enabled": True,
            "permissionOverrides": {"allowedMenus": ["sales_outbound"], "showCost": False, "showProfit": False, "canManualOutbound": mode == "manual"}}
    page.on("pageerror", lambda error: page_errors.append(str(error)))

    def route_api(route):
        nonlocal completed
        request = route.request
        path = urlparse(request.url).path
        response = {"data": []}
        if path == "/api/auth/me":
            response = {"data": {**user, "csrfToken": "local-test-csrf"}}
        elif path == "/api/state":
            response = {"data": STATE}
        elif path == "/api/state/revision":
            response = {"data": {"revision": 1}}
        elif path == "/api/sales-invoices/outbound":
            response = {"data": {**STATE, "salesInvoices": [] if completed else [ORDER], "inventory": STOCK},
                        "meta": {"total": 0 if completed else 1, "page": 1, "pageSize": 20, "totalPages": 1,
                                 "summary": {"pendingItemCount": 0 if completed else 2, "pendingAmount": 0 if completed else 11200}}}
        elif path in {f"/api/sales-invoices/{ORDER['id']}/outbound/preflight", f"/api/sales-invoices/{ORDER['id']}/outbound"}:
            command = request.post_data_json
            assert request.method == "POST"
            assert request.headers.get("x-csrf-token") == "local-test-csrf"
            assert command["codes"] == ([] if mode == "manual" else [item["sn"] for item in STOCK])
            assert command["manual"] == (mode == "manual")
            assert command["handler"] == user["displayName"]
            if mode == "manual":
                assert command["remarks"] == "扫码设备故障，人工复核"
            calls.append({"path": path, "command": command})
            if path.endswith("/preflight"):
                ready = mode != "reject"
                response = {"data": {"invoiceId": ORDER["id"], "invoiceNo": ORDER["invoiceNo"], "ready": ready,
                                     "expectedCount": 2, "matchedCount": 2 if ready else 1, "duplicateCodes": [], "unknownCodes": [],
                                     "rows": [{"lineId": str(index), "productName": item["productName"], "inventoryId": item["id"],
                                               "matched": ready or index == 0, "reason": "" if ready or index == 0 else "库存已售出"}
                                              for index, item in enumerate(STOCK)]}}
            else:
                assert mode != "reject" and len(calls) == 2 and calls[0]["path"].endswith("/preflight")
                assert request.headers.get("idempotency-key")
                completed = True
                response = {"data": {**copy.deepcopy(ORDER), "outboundStatus": "已出库"}}
        elif request.method not in {"GET", "HEAD", "OPTIONS"}:
            unexpected.append(path)
        route.fulfill(status=200, content_type="application/json", body=json.dumps(response, ensure_ascii=False))

    page.route(f"{BASE}/api/**", route_api)
    try:
        page.goto(f"{BASE}/sales/outbound")
        page.wait_for_load_state("networkidle")
        region = page.locator('[data-erp-region="outbound-verification"]')
        region.get_by_text(ORDER["invoiceNo"], exact=True).wait_for()
        if mode == "manual":
            region.get_by_role("textbox", name="出库备注 / 手动原因", exact=True).fill("扫码设备故障，人工复核")
            region.get_by_role("button", name="手动确认", exact=True).click()
        else:
            region.get_by_role("textbox", name="已扫描库存 ID / SN", exact=True).fill("\n".join(item["sn"] for item in STOCK))
            region.get_by_text("2/2 已核验", exact=True).wait_for()
            if mode == "scan":
                assert region.get_by_role("button", name="手动确认", exact=True).is_disabled()
                page.screenshot(path=str(ARTIFACTS / f"verified-{width}.png"), full_page=True)
            region.get_by_role("button", name="扫码确认出库", exact=True).click()
        if mode == "reject":
            region.get_by_role("alert").filter(has_text="服务器仍有 1 件商品无法匹配可售库存").wait_for()
            assert len(calls) == 1 and not completed
        else:
            page.get_by_text("暂无待出库销售单", exact=True).wait_for()
            assert len(calls) == 2 and completed
        assert not page_errors, page_errors
        assert not unexpected, unexpected
        print(json.dumps({"width": width, "mode": mode, "result": "pass", "requests": calls}, ensure_ascii=False))
    finally:
        context.close()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        for viewport_width in [1440, 1024, 390]:
            for scenario in ["scan", "manual", "reject"]:
                run_case(browser, viewport_width, scenario)
    finally:
        browser.close()
print("PASS: 9 local browser cases; business API responses are intercepted, not live database writes")
