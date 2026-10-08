"""Decode real generated Code128/QR images in a browser with synthetic video.
Local only; this validates the actual WASM engine, not physical phone hardware.
"""
import base64
import json
import os
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BARCODE_SMOKE_BASE_URL", "http://127.0.0.1:3010").rstrip("/")
if urlparse(BASE).hostname not in {"localhost", "127.0.0.1", "::1"}:
    raise RuntimeError("Barcode regression must use a local frontend")
ARTIFACTS = Path(os.environ.get("BARCODE_SMOKE_OUTPUT", "/private/tmp/erp-barcode-scanner"))
ARTIFACTS.mkdir(parents=True, exist_ok=True)
PRODUCTION = os.environ.get("BARCODE_SMOKE_PRODUCTION") == "1"

def production_api(route):
    path = urlparse(route.request.url).path
    if route.request.method not in {"GET", "HEAD"} and path != "/api/ops/client-events":
        raise AssertionError("Unexpected business write: " + path)
    stock = {"id":"KC-SCANNER", "productId":"P-SCANNER", "productName":"扫码回归显卡", "category":"显卡", "brand":"本地测试", "model":"RTX4090", "sn":"001-AbC-SN4090", "status":"已入库", "costPrice":100, "estSellPrice":150, "entryTime":"2026-10-08"}
    body = {"data":[], "meta":{"total":0,"page":1,"pageSize":20}}
    if path == "/api/auth/me":
        body = {"data":{"id":"U-SCANNER", "username":"scanner-local", "displayName":"本地扫码回归", "role":"老板", "enabled":True, "csrfToken":"local-only"}}
    elif path == "/api/state":
        body = {"data":{key:[] for key in ["inventory","products","salesInvoices","purchaseInvoices","customers","vendors","systemUsers","customPermissions"]}}
    elif path == "/api/inventory/items":
        body = {"data":[stock], "meta":{"total":1,"page":1,"pageSize":20}}
    elif path == "/api/inventory/summary":
        body = {"data":[{"totalCount":1,"availableCount":1,"totalCost":100}]}
    route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

fixtures = json.loads(subprocess.run([
    "node", "--input-type=module", "-e", """
import {readFileSync} from 'node:fs';
import {prepareZXingModule, writeBarcode} from 'zxing-wasm/writer';
await prepareZXingModule({overrides:{wasmBinary:readFileSync(new URL(import.meta.resolve('zxing-wasm/writer/zxing_writer.wasm')))},fireImmediately:true});
const output = {};
for (const [format, text] of [['Code128','001-AbC-SN4090'], ['QRCode','KC-0000123']]) {
  const encoded = await writeBarcode(text, {format, scale:4});
  output[format] = {text, png:Buffer.from(await encoded.image.arrayBuffer()).toString('base64')};
}
console.log(JSON.stringify(output));
"""], check=True, capture_output=True, text=True).stdout)

SETUP = """async ({mode, png, text}) => {
  window.__barcodeTest = {stops:0, media:0};
  const stats = window.__barcodeTest;
  if (mode === 'native') window.BarcodeDetector = class {static async getSupportedFormats() {return ['qr_code','code_128','code_39','code_93','ean_13','ean_8','data_matrix'];} async detect() {return [{rawValue:text}];}};
  else if (mode === 'native-empty') window.BarcodeDetector = class {async detect() {return [];}};
  else if (mode === 'native-partial') window.BarcodeDetector = class {static async getSupportedFormats() {return ['qr_code'];} constructor() {throw Error('partial native must not be used');}};
  else Object.defineProperty(window, 'BarcodeDetector', {value:undefined, configurable:true});
  navigator.mediaDevices.getUserMedia = async () => {
    if (mode === 'denied') throw new DOMException('Permission denied', 'NotAllowedError');
    const image = new Image(); image.src = 'data:image/png;base64,' + png; await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(800, image.width); canvas.height = Math.max(480, image.height);
    const ctx = canvas.getContext('2d'); ctx.fillStyle='white'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,(canvas.width-image.width)/2,(canvas.height-image.height)/2);
    const stream = canvas.captureStream(10); stats.media++;
    stream.getTracks().forEach(track => {const stop=track.stop.bind(track); track.stop=()=>{stats.stops++; stop();};});
    return stream;
  };
}"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    passed = 0
    try:
        for width in ([390] if PRODUCTION else [390, 1440]):
            for mode in (['wasm', 'denied'] if PRODUCTION else ['native', 'wasm', 'native-partial', 'native-empty', 'denied', 'close-loading', 'retry-load']):
                context = browser.new_context(viewport={"width": width, "height": 844})
                page = context.new_page()
                errors, requests = [], []
                page.on("pageerror", lambda error: errors.append(str(error)))
                context.on("request", lambda request: requests.append(request.url))
                if PRODUCTION:
                    page.route(BASE + "/api/**", production_api)
                else:
                    page.route(BASE + "/__barcode-scanner", lambda route: route.fulfill(content_type="text/html", body='''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;</script>
<script type="module" src="/@vite/client"></script></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/BarcodeScannerHarness.tsx"></script></body></html>'''))
                try:
                    page.goto(BASE + ("/inventory" if PRODUCTION else "/__barcode-scanner"))
                    page.wait_for_load_state("networkidle")
                    open_button = page.get_by_role("button", name="扫码搜索库存" if PRODUCTION else "打开扫码", exact=True)
                    expect(open_button).to_be_visible()
                    result = page.get_by_role("searchbox", name="搜索库存", exact=True) if PRODUCTION else page.get_by_label("识别结果")
                    def assert_result(value):
                        if PRODUCTION:
                            expect(result).to_have_value(value, timeout=20000)
                        else:
                            expect(result).to_have_text(value, timeout=20000)
                    assert not any('.wasm' in url or 'barcodeScanner.worker' in url for url in requests), requests
                    fixture = fixtures['QRCode' if mode == 'denied' else 'Code128']
                    page.evaluate(SETUP, {"mode": mode, **fixture})
                    if mode in {'close-loading', 'retry-load'}:
                        context.route('**/*.wasm*', lambda route: route.abort())
                    open_button.click()
                    dialog = page.get_by_role("dialog")
                    if mode in {'denied', 'close-loading', 'retry-load'}:
                        expect(dialog).to_be_visible()
                    if mode == 'close-loading':
                        dialog.get_by_role("button", name="关闭", exact=True).last.click()
                        expect(dialog).to_have_count(0)
                        page.wait_for_timeout(250)
                        assert page.evaluate("window.__barcodeTest.media") == 0
                        assert_result("")
                    elif mode == 'retry-load':
                        expect(dialog.get_by_role("alert")).to_contain_text("加载失败", timeout=20000)
                        assert page.evaluate("window.__barcodeTest.media") == 0
                        context.unroute('**/*.wasm*')
                        dialog.get_by_role("button", name="重试扫码", exact=True).click()
                        assert_result(fixture['text'])
                        expect(dialog).to_have_count(0)
                    elif mode == 'denied':
                        expect(dialog.get_by_role("alert")).to_contain_text("未获授权", timeout=20000)
                        assert page.evaluate("window.__barcodeTest.media") == 0
                        expect(dialog.get_by_role("button", name="从图片识别", exact=True)).to_be_enabled()
                        page.screenshot(path=str(ARTIFACTS / f"scanner-denied-{width}.png"))
                        dialog.get_by_label("选择条码图片").set_input_files({"name":"qr.png", "mimeType":"image/png", "buffer":base64.b64decode(fixture['png'])})
                        assert_result(fixture['text'])
                        expect(dialog).to_have_count(0)
                    else:
                        assert_result(fixture['text'])
                        expect(dialog).to_have_count(0)
                        assert page.evaluate("window.__barcodeTest.stops") == 1
                        if mode == 'native':
                            assert not any('.wasm' in url or 'barcodeScanner.worker' in url for url in requests), requests
                        else:
                            assert any('.wasm' in url for url in requests), requests
                    assert not errors, errors
                    assert all(urlparse(url).hostname in {'localhost','127.0.0.1','::1',None} for url in requests), requests
                    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
                    passed += 1
                    print(f"PASS {width}px {mode}", flush=True)
                except Exception:
                    print(f"FAIL {width}px {mode}; browser errors: {errors}", flush=True)
                    page.screenshot(path=str(ARTIFACTS / f"failed-{width}-{mode}.png"))
                    raise
                finally:
                    context.close()
    finally:
        browser.close()
print(f"Barcode browser regression: {passed} passed")
