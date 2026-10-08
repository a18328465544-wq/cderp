import base64
import json
import os
import re
import sys
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

# Run against a local Vite dev server. Every business API is intercepted; this
# test never saves a real product or financial record. Requires Python Playwright.
BASE = os.environ.get("FORM_SMOKE_BASE_URL", "http://127.0.0.1:3010").rstrip("/")
assert urlparse(BASE).hostname in ["localhost", "127.0.0.1"], "Only local test servers are allowed"
REPRODUCE = "--reproduce" in sys.argv
EMPTY = {key: [] for key in ["products", "inventory", "inspections", "salesInvoices", "purchaseInvoices", "customers", "vendors", "systemUsers", "customPermissions"]}
EDITORS = [("product", "/products", "新建模板", "product-template-form"), ("income", "/finance/income", "登记收入", "finance-entry-form"), ("expense", "/finance/expense", "登记支出", "finance-entry-form")]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        for width in ([1440] if REPRODUCE else [1440, 1024, 390]):
            for editor, path, opener, form_id in EDITORS:
                for mode in (["edit", "image"] if REPRODUCE else ["edit", "image", "close-reopen", "unchanged", "double"]):
                    context = browser.new_context(viewport={"width": width, "height": 1000})
                    page = context.new_page()
                    writes, media_calls, errors = [], [], []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.add_init_script("window.__delayValidation=false; window.__releaseValidation=[];")

                    def resolver(route):
                        response = route.fetch()
                        body = response.text()
                        export = re.search(r"\b([\w$]+) as zodResolver", body)
                        assert export, "Expected the real Vite Zod resolver export"
                        wrapped = """function delayedResolver(...args) {
                          const actual = RESOLVER_EXPORT(...args);
                          return (...callArgs) => {
                            const result = actual(...callArgs);
                            if (!window.__delayValidation) return result;
                            return new Promise(resolve => window.__releaseValidation.push(() => Promise.resolve(result).then(resolve)));
                          };
                        }
                        """
                        body = wrapped.replace("RESOLVER_EXPORT", export.group(1)) + body.replace(export.group(0), "delayedResolver as zodResolver")
                        route.fulfill(response=response, body=body)

                    def api(route):
                        request = route.request
                        target = urlparse(request.url).path
                        if target == "/api/auth/me":
                            body = {"data": {"id": "local-validation", "username": "local-validation", "displayName": "本地测试员", "role": "老板", "enabled": True, "csrfToken": "local-csrf"}}
                        elif target.startswith("/api/state"):
                            body = {"data": EMPTY}
                        elif target == "/api/products" and request.method == "GET":
                            body = {"data": {"products": []}, "meta": {"total": 0, "page": 1, "pageSize": 20}}
                        elif target.endswith("/settlement-accounts"):
                            body = {"data": [{"id": "SA-LOCAL", "name": "本地测试账户", "type": "微信", "enabled": True, "balance": 100}], "meta": {"total": 1}}
                        elif target == "/api/media" and request.method == "POST":
                            media_calls.append(request.post_data_json)
                            body = {"data": {"urls": ["/api/media/assets/IMG-VALIDATION"]}}
                        elif target.startswith("/api/media/assets/"):
                            route.fulfill(status=200, content_type="image/png", body=base64.b64decode(png))
                            return
                        elif request.method not in ["GET", "HEAD"] and target != "/api/ops/client-events":
                            writes.append({"path": target, "body": request.post_data_json})
                            route.fulfill(status=400, content_type="application/json", body=json.dumps({"error": {"message": "本地测试保存反馈"}}))
                            return
                        else:
                            body = {"data": [], "meta": {"total": 0}}
                        route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

                    page.route(BASE + "/node_modules/.vite/deps/@hookform_resolvers_zod.js*", resolver)
                    page.route(BASE + "/api/**", api)
                    png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWWQAAAAASUVORK5CYII="
                    try:
                        page.goto(BASE + path)
                        page.wait_for_load_state("networkidle")
                        page.get_by_role("button", name=opener, exact=True).click()
                        form = page.locator("#" + form_id)
                        if editor == "product":
                            form.locator('input[name="brand"]').fill("本地品牌")
                            form.locator('input[name="model"]').fill("RTX5090")
                        else:
                            form.locator('input[name="source"],input[name="party"]').fill("本地测试来源")
                            form.get_by_role("combobox", name="结算账户" if editor == "income" else "支出账户", exact=True).click()
                            page.get_by_role("option", name="本地测试账户 · 微信", exact=True).click()
                            form.get_by_role("textbox", name="收入金额" if editor == "income" else "支出金额", exact=True).fill("100")
                        form.locator('textarea[name="remarks"]').fill("原始备注")
                        page.evaluate("window.__delayValidation=true")
                        form.evaluate("form => form.requestSubmit()")
                        page.wait_for_function("window.__releaseValidation.length > 0")
                        if mode == "edit":
                            form.locator('textarea[name="remarks"]').fill("修改后的备注")
                        elif mode == "image":
                            png = page.evaluate("() => {const c=document.createElement('canvas');c.width=40;c.height=40;c.getContext('2d').fillRect(0,0,40,40);return c.toDataURL('image/png').split(',')[1];}")
                            form.locator('input[type="file"][accept*="image/jpeg"]').set_input_files({"name": "VALIDATION.png", "mimeType": "image/png", "buffer": base64.b64decode(png)})
                            expect(form.locator('p[title="VALIDATION.png"]')).to_be_visible()
                            expect(form.get_by_text("已上传", exact=True)).to_be_visible()
                            assert len(media_calls) == 1
                        elif mode == "close-reopen":
                            page.get_by_role("dialog").get_by_role("button", name="取消", exact=True).click()
                            expect(form).to_have_count(0)
                            page.get_by_role("button", name=opener, exact=True).click()
                            form.locator('textarea[name="remarks"]').fill("新表单备注")
                        elif mode == "double":
                            form.evaluate("form => form.requestSubmit()")
                            page.wait_for_timeout(150)
                        page.evaluate("window.__delayValidation=false; window.__releaseValidation.splice(0).forEach(fn=>fn())")
                        page.wait_for_timeout(450)
                        if REPRODUCE:
                            print(json.dumps({"editor": editor, "mode": mode, "staleWriteCount": len(writes), "submitted": writes}, ensure_ascii=False), flush=True)
                        elif mode in ["unchanged", "double"]:
                            assert len(writes) == 1, writes
                            assert writes[0]["body"]["remarks"] == "原始备注"
                            expect(form.get_by_role("alert")).to_contain_text("本地测试保存反馈")
                        else:
                            assert not writes, writes
                            if mode == "edit":
                                expect(form.locator('textarea[name="remarks"]')).to_have_value("修改后的备注")
                            if mode == "image":
                                expect(form.locator('p[title="VALIDATION.png"]')).to_be_visible()
                            if mode in ["edit", "image"]:
                                expect(form.get_by_role("alert")).to_contain_text("内容已更新")
                                # A cancelled stale validation must not lock the
                                # current editor or lose the newly uploaded file.
                                form.evaluate("form => form.requestSubmit()")
                                page.wait_for_timeout(450)
                                assert len(writes) == 1, writes
                                if mode == "edit":
                                    assert writes[0]["body"]["remarks"] == "修改后的备注"
                                else:
                                    key = "imageUrls" if editor == "product" else "images"
                                    assert writes[0]["body"][key] == ["/api/media/assets/IMG-VALIDATION"], writes
                        assert not [error for error in errors if REPRODUCE is False or error != "本地测试保存反馈"], errors
                        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
                        if not REPRODUCE:
                            print(json.dumps({"width": width, "editor": editor, "mode": mode, "passed": True}), flush=True)
                    finally:
                        context.close()
    finally:
        browser.close()
