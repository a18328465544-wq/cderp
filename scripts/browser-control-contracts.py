"""Local-only shared-control regression. All APIs are intercepted synthetic data.
No real accounts, database, order submissions or production hosts are accessed.
"""
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("CONTROL_SMOKE_BASE_URL", "http://127.0.0.1:3010").rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost", "::1"}:
    raise RuntimeError("Control regression requires a local frontend")
ARTIFACTS = Path(os.environ.get("CONTROL_SMOKE_OUTPUT", "/private/tmp/erp-control-contracts"))
ARTIFACTS.mkdir(parents=True, exist_ok=True)


def attach(page):
    errors, writes = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def api(route):
        request = route.request
        path = urlparse(request.url).path
        if request.method not in {"GET", "HEAD", "OPTIONS"} and path != "/api/ops/client-events":
            writes.append(path)
            route.fulfill(status=500, content_type="application/json", body=json.dumps({"error": {"message": "Business writes forbidden in control tests"}}))
            return
        data = {"id": "control-local", "username": "control-local", "displayName": "控件验收", "role": "老板", "enabled": True, "csrfToken": "local-only"} if path == "/api/auth/me" else []
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"data": data}, ensure_ascii=False))

    page.route(BASE + "/api/**", api)
    return errors, writes


def customer_and_stock(page, demo, width):
    selection = demo.get_by_test_id("contract-selection")
    expect(demo.get_by_text("更换", exact=True)).to_have_count(0)
    if width >= 768:
        customer = demo.get_by_role("combobox", name="验收客户", exact=True)
        customer.focus()
        customer.press("Enter")
        expect(page.get_by_role("listbox", name="客户候选", exact=True)).to_be_visible()
        customer.press("Escape")
        expect(customer).to_have_value("本地客户甲 · LOCAL-A")
        customer.click()
        expect(customer).to_have_value("")
        expect(selection).to_contain_text("本地客户甲")
        customer.fill("乙")
        customer.press("Escape")
        expect(customer).to_have_value("本地客户甲 · LOCAL-A")
        customer.click()
        expect(page.get_by_role("option").filter(has_text="停用客户")).to_be_disabled()
        page.get_by_role("option").filter(has_text="本地客户乙").click()
        expect(customer).to_have_value("本地客户乙 · LOCAL-B")
        customer.click()
        customer.fill("甲")
        expect(page.get_by_role("option").filter(has_text="本地客户甲")).to_be_visible()
        customer.evaluate("el => {el.dispatchEvent(new CompositionEvent('compositionstart', {bubbles:true})); el.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', isComposing:true, bubbles:true}));}")
        expect(selection).to_contain_text("本地客户乙")
        customer.evaluate("el => el.dispatchEvent(new CompositionEvent('compositionend', {bubbles:true}))")
        customer.press("Enter")
        expect(selection).to_contain_text("本地客户甲")
        demo.get_by_role("button", name="清除客户", exact=True).click()
        expect(selection).to_contain_text("当前客户：未选择")
        expect(customer).to_have_value("")
        expect(page.get_by_role("listbox", name="客户候选", exact=True)).to_have_count(0)
        customer.click()
        page.get_by_role("option").filter(has_text="本地客户甲").click()
        stock = demo.get_by_role("combobox", name="验收商品", exact=True)
        stock.click()
        expect(selection).to_contain_text("RTX4090")
        expect(page.get_by_role("option").filter(has_text="RTX3090")).to_be_disabled()
        stock.press("Escape")
        expect(stock).to_have_value("本地测试 RTX4090 24G")
        stock.click(position={"x": stock.bounding_box()["width"] - 16, "y": stock.bounding_box()["height"] / 2})
        page.get_by_role("option").filter(has_text="RTX4080").click()
        expect(selection).to_contain_text("RTX4080")
        demo.get_by_role("button", name="清除商品候选", exact=True).click()
        expect(selection).to_contain_text("当前商品：未选择")
        expect(stock).to_have_value("")
        expect(page.get_by_role("listbox", name="可销售商品", exact=True)).to_have_count(0)
        stock.click()
        page.get_by_role("option").filter(has_text="RTX4080").click()
        customer.click()
        demo.get_by_role("button", name="刷新远程候选样例", exact=True).click()
        expect(page.get_by_role("listbox", name="客户候选", exact=True)).to_have_count(0)
        expect(selection).to_contain_text("本地客户甲")
        demo.get_by_role("button", name="刷新远程候选样例", exact=True).click()
    else:
        demo.get_by_role("button", name="验收客户", exact=True).click()
        expect(page.get_by_role("dialog")).to_be_visible()
        expect(page.get_by_role("option").filter(has_text="停用客户")).to_be_disabled()
        page.keyboard.press("Escape")
        expect(selection).to_contain_text("本地客户甲")
        demo.get_by_role("button", name="验收客户", exact=True).click()
        page.get_by_role("option").filter(has_text="本地客户乙").click()
        expect(selection).to_contain_text("本地客户乙")
        demo.get_by_role("button", name="验收商品", exact=True).click()
        expect(page.get_by_role("dialog")).to_be_visible()
        expect(page.get_by_role("option").filter(has_text="RTX3090")).to_be_disabled()
        page.get_by_role("option").filter(has_text="RTX4080").click()
        expect(selection).to_contain_text("RTX4080")


def inputs_and_feedback(page, demo, width):
    expect(demo.get_by_test_id("contract-search-query")).to_have_text("")
    demo.get_by_role("button", name="刷新远程候选样例", exact=True).click()
    remote = demo.get_by_role("combobox" if width >= 768 else "button", name="验收远程选择", exact=True)
    if width >= 768:
        expect(remote).to_have_value("远程已选项甲")
        demo.get_by_role("button", name="清除验收远程选择", exact=True).click()
        expect(remote).to_have_value("")
        remote.fill("乙")
        expect(demo.get_by_test_id("contract-search-query")).to_have_text("乙")
        expect(page.get_by_role("option", name="远程候选乙", exact=True)).to_be_visible()
        remote.evaluate("el => {el.dispatchEvent(new CompositionEvent('compositionstart', {bubbles:true})); el.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', isComposing:true, bubbles:true}));}")
        expect(demo.get_by_role("button", name="清除验收远程选择", exact=True)).to_have_count(0)
        remote.evaluate("el => el.dispatchEvent(new CompositionEvent('compositionend', {bubbles:true}))")
        page.get_by_role("option", name="远程候选乙", exact=True).click()
        expect(remote).to_have_value("远程候选乙")
        expect(demo.get_by_test_id("contract-search-query")).to_have_text("")
    else:
        expect(remote).to_contain_text("远程已选项甲")
    amount = demo.get_by_role("textbox", name="验收金额", exact=True)
    amount.focus()
    expect(amount).to_have_value("¥ 0")
    page.wait_for_function("() => {const el=document.querySelector('[aria-label=验收金额]'); return el.selectionStart===0 && el.selectionEnd===el.value.length;}")
    amount.fill("")
    expect(amount).to_have_value("")
    amount.fill("1234.56")
    expect(amount).to_have_value("¥ 1,234.56")
    readonly = demo.get_by_role("textbox", name="验收只读", exact=True)
    expect(readonly).to_have_attribute("readonly", "")
    quantity = demo.get_by_role("spinbutton", name="验收数量", exact=True)
    quantity.fill("")
    expect(quantity).to_have_value("")
    quantity.fill("9")
    expect(quantity).to_have_value("3")
    expect(demo.get_by_role("button", name="增加验收数量", exact=True)).to_be_disabled()
    expect(page.get_by_text("数量最多为 3，已按上限保留", exact=True)).to_be_visible()
    segment = demo.get_by_role("group", name="验收键盘分段", exact=True)
    first = segment.get_by_role("button", name="选项一", exact=True)
    last = segment.get_by_role("button", name="选项三", exact=True)
    first.focus()
    first.press("ArrowRight")
    expect(last).to_be_focused()
    expect(last).to_have_attribute("aria-pressed", "true")
    last.press("Home")
    expect(first).to_be_focused()
    required = demo.get_by_role("textbox", name="验收必填字段", exact=True)
    # Missing required input remains locatable even before inline validation
    # marks aria-invalid; the locator does not infer monetary business rules.
    required.evaluate("el => el.removeAttribute('aria-invalid')")
    demo.get_by_role("button", name="定位问题", exact=True).click()
    expect(required).to_be_focused()
    required.fill("本地输入")
    expect(demo.get_by_role("button", name="定位问题", exact=True)).to_have_count(0)
    submit = demo.get_by_role("button", name="本地提交样例", exact=True)
    expect(submit).to_be_enabled()
    before = submit.bounding_box()
    demo.get_by_role("button", name="切换提交中样例", exact=True).click()
    expect(submit).to_have_attribute("aria-busy", "true")
    expect(submit).to_be_disabled()
    after = submit.bounding_box()
    assert abs(before["width"] - after["width"]) < 1, (before, after)
    assert abs(before["height"] - after["height"]) < 1, (before, after)
    demo.get_by_role("button", name="切换提交中样例", exact=True).click()


def dates(page, demo):
    trigger = demo.get_by_role("button", name="验收日期", exact=True)
    trigger.click()
    manual = page.get_by_role("textbox", name="输入验收日期", exact=True)
    manual.fill("2026-02-30")
    manual.press("Enter")
    expect(page.get_by_text("请输入有效日期：YYYY-MM-DD", exact=True)).to_be_visible()
    expect(trigger).to_contain_text("2026-10-09")
    manual.fill("2026-11-01")
    manual.press("Enter")
    expect(page.get_by_text("日期不能晚于 2026-10-31", exact=True)).to_be_visible()
    manual.fill("2026-10-15")
    manual.press("Enter")
    expect(trigger).to_contain_text("2026-10-15")
    trigger.click()
    page.get_by_role("button", name="清除日期", exact=True).click()
    expect(trigger).to_contain_text("选择日期")


def states(page, demo, width):
    state = demo.get_by_role("combobox", name="验收控件状态", exact=True)

    def change(label):
        state.click()
        page.get_by_role("option", name=label, exact=True).click()

    change("禁用")
    entity_role = "combobox" if width >= 768 else "button"
    expect(demo.get_by_role(entity_role, name="验收客户", exact=True)).to_be_disabled()
    expect(demo.get_by_role(entity_role, name="验收商品", exact=True)).to_be_disabled()
    expect(demo.get_by_role("textbox", name="验收金额", exact=True)).to_be_disabled()
    expect(demo.get_by_role("button", name="验收日期", exact=True)).to_be_disabled()
    change("加载中")
    selection = demo.get_by_test_id("contract-selection").inner_text()
    demo.get_by_role(entity_role, name="验收客户", exact=True).click()
    expect(page.get_by_text("正在搜索客户…", exact=True)).to_be_visible()
    expect(page.get_by_role("option").filter(has_text="本地客户")).to_have_count(0)
    if width >= 768:
        demo.get_by_role("combobox", name="验收客户", exact=True).press("Enter")
        expect(demo.get_by_test_id("contract-selection")).to_have_text(selection)
    page.keyboard.press("Escape")
    change("搜索失败")
    demo.get_by_role(entity_role, name="验收客户", exact=True).click()
    expect(page.get_by_text("本地模拟搜索失败", exact=True)).to_be_visible()
    page.get_by_role("button", name="重试", exact=True).click()
    expect(page.get_by_role("option").filter(has_text="本地客户乙")).to_be_visible()
    page.keyboard.press("Escape")
    expect(demo.get_by_test_id("contract-selection")).to_have_text(selection)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        for width in [320, 390, 768, 1024, 1440]:
            context = browser.new_context(viewport={"width": width, "height": 1000}, is_mobile=width < 768, has_touch=width < 768)
            page = context.new_page()
            errors, writes = attach(page)
            try:
                page.goto(BASE + "/__design-system")
                page.wait_for_load_state("networkidle")
                demo = page.get_by_test_id("control-contract-demo")
                expect(demo).to_be_visible(timeout=15000)
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), width
                customer_and_stock(page, demo, width)
                inputs_and_feedback(page, demo, width)
                dates(page, demo)
                states(page, demo, width)
                assert not writes, writes
                assert not errors, errors
                demo.screenshot(path=str(ARTIFACTS / f"controls-{width}.png"))
                print(f"PASS {width}px: replacement/cancel, unavailable options, selected identity, input drafts, keyboard, date bounds, problem focus, stable pending; no business writes", flush=True)
            finally:
                context.close()
    finally:
        browser.close()
