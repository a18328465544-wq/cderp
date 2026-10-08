"""Local-only Vite regression for an in-memory workspace draft's media.

The module interceptor seeds the existing runtime draft store, not localStorage.
All APIs are intercepted. No production purchase or media record is written.
"""
import base64
import json
import os
import sys
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("FORM_SMOKE_BASE_URL", "http://127.0.0.1:3010").rstrip("/")
assert urlparse(BASE).hostname in ["localhost", "127.0.0.1"], "Only local test servers are allowed"
REPRODUCE = "--reproduce" in sys.argv
EMPTY = {key: [] for key in ["products", "inventory", "inspections", "salesInvoices", "purchaseInvoices", "customers", "vendors", "systemUsers", "customPermissions"]}
EXISTING = "/api/media/assets/IMG-RESTORED"
NEW = "/api/media/assets/IMG-NEW"
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWWQAAAAASUVORK5CYII="

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        for width in ([1440] if REPRODUCE else [1440, 1024, 390]):
            context = browser.new_context(viewport={"width": width, "height": 1000})
            page = context.new_page()
            calls, writes, errors = [], [], []
            page.on("pageerror", lambda error: errors.append(str(error)))

            def runtime(route):
                response = route.fetch()
                body = response.text()
                assert "const drafts = {};" in body, "Expected the existing workspace draft store"
                seed = """const drafts = {purchase_add: {
                  values: {...createPurchaseDefaults('本地测试员'), images: ['/api/media/assets/IMG-RESTORED'], remarks: '已恢复草稿'},
                  selectedSource: null
                }};"""
                body = 'import {createPurchaseDefaults} from "/src/features/purchase/purchase.defaults.ts";\n' + body.replace("const drafts = {};", seed)
                route.fulfill(response=response, body=body)

            def api(route):
                request = route.request
                target = urlparse(request.url).path
                if target == "/api/auth/me":
                    body = {"data": {"id": "local-draft", "username": "local-draft", "displayName": "本地测试员", "role": "老板", "enabled": True, "csrfToken": "local-csrf"}}
                elif target.startswith("/api/state") or target.startswith("/api/purchase-invoices/reference"):
                    body = {"data": EMPTY}
                elif target.endswith("/settlement-accounts"):
                    body = {"data": [], "meta": {"total": 0}}
                elif target == "/api/media" and request.method == "POST":
                    command = request.post_data_json
                    calls.append(command)
                    urls = [url for url in command["images"] if not url.startswith("data:")]
                    if any(url.startswith("data:") for url in command["images"]):
                        urls.append(NEW)
                    body = {"data": {"urls": urls}}
                elif target.startswith("/api/media/assets/"):
                    route.fulfill(status=200, content_type="image/png", body=base64.b64decode(PNG))
                    return
                elif request.method not in ["GET", "HEAD"] and target != "/api/ops/client-events":
                    writes.append(target)
                    route.fulfill(status=400, content_type="application/json", body=json.dumps({"error": {"message": "Unexpected business write"}}))
                    return
                else:
                    body = {"data": [], "meta": {"total": 0}}
                route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

            page.route(BASE + "/src/hooks/useWorkspaceTabRuntime.tsx*", runtime)
            page.route(BASE + "/api/**", api)
            try:
                page.goto(BASE + "/purchase/new")
                page.wait_for_load_state("networkidle")
                expect(page.locator('textarea[name="remarks"]')).to_have_value("已恢复草稿")
                restored = page.locator('p[title="采购图片 1"]')
                initial_count = restored.count()
                if not REPRODUCE:
                    expect(restored).to_be_visible()
                png = page.evaluate("() => {const c=document.createElement('canvas');c.width=40;c.height=40;c.getContext('2d').fillRect(0,0,40,40);return c.toDataURL('image/png').split(',')[1];}")
                page.locator('input[type="file"][accept*="image/jpeg"]').set_input_files({"name": "NEW.png", "mimeType": "image/png", "buffer": base64.b64decode(png)})
                expect(page.locator('p[title="NEW.png"]')).to_be_visible()
                page.wait_for_function("document.body.innerText.includes('已上传')")
                page.wait_for_timeout(250)
                assert len(calls) == 1, calls
                if REPRODUCE:
                    print(json.dumps({"restoredPreviewCount": initial_count, "oldImageRetained": EXISTING in calls[0]["images"]}), flush=True)
                else:
                    assert calls[0]["images"][0] == EXISTING, calls
                    expect(restored).to_be_visible()
                    expect(page.get_by_text("已上传", exact=True)).to_have_count(2)
                    with page.expect_response(lambda response: urlparse(response.url).path == "/api/media" and response.request.method == "POST"):
                        page.get_by_role("button", name="删除采购图片 1", exact=True).click()
                    assert calls[-1]["images"] == [NEW], calls
                    expect(page.locator('p[title="NEW.png"]')).to_be_visible()
                    print(json.dumps({"width": width, "restoredUploadAndRemoval": True}), flush=True)
                assert not errors, errors
                assert not writes, writes
                assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
            finally:
                context.close()
    finally:
        browser.close()
