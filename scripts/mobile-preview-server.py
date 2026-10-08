"""Isolated IAB preview: loopback-only proxy to local Vite; no production API/DB.
Synthetic records reuse the regression fixtures. All business writes fail visibly.
"""
import ast
import base64
import json
import mimetypes
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import urlopen

root = Path(__file__).resolve().parent
source = (root / "browser-mobile-workbench.py").read_text()
tree = ast.parse(source.split("def attach(")[0])
tree.body = [node for node in tree.body if not (isinstance(node, ast.ImportFrom) and node.module == "playwright.sync_api")]
fixture = {}
exec(compile(tree, "mobile-fixtures", "exec"), fixture)
state = fixture["STATE"]
partner = {**fixture["PARTNER"], "type": "个人买家客户", "source": "微信", "level": "S级", "isCoreCustomer": True, "totalAmount": 128600, "totalProfit": 2800, "buyCount": 18, "lastDealTime": "2026-10-07", "owner": "手机测试员", "crmStatus": "已成交", "tags": ["核心客户"]}
state["customers"] = [partner]
state["vendors"] = [{"id": "V-MOBILE", "name": "本地测试供应商", "contact": "LOCAL-ONLY", "payableBalance": 200}]
state["systemUsers"] = [{"id": "local-mobile", "username": "local-mobile", "displayName": "手机测试员", "role": "老板", "enabled": True}]
state["paymentIns"] = [{"id": "IN-MOBILE", "customerName": partner["name"], "accountId": fixture["ACCOUNT"]["id"], "amount": 150, "handler": "手机测试员", "paymentMethod": "微信", "businessType": "销售收款", "time": "2026-10-07 14:30", "referenceNo": "XS-MOBILE-001", "images": []}]
state["paymentOuts"] = [{"id": "OUT-MOBILE", "supplierName": "本地测试供应商", "accountId": fixture["ACCOUNT"]["id"], "amount": 100, "handler": "手机测试员", "paymentMethod": "微信", "businessType": "采购付款", "time": "2026-10-07 14:30", "referenceNo": "JH-MOBILE-001", "images": []}]
state["settlementLedger"] = [{"id": "FLOW-MOBILE", "accountId": fixture["ACCOUNT"]["id"], "accountName": fixture["ACCOUNT"]["name"], "time": "2026-10-07 14:30", "businessType": "销售收款", "incomeAmount": 150, "expenseAmount": 0, "changeAmount": 150, "balanceAfter": 10000, "relatedDocNo": "XS-MOBILE-001", "handler": "手机测试员"}]
for invoice in state["salesInvoices"]:
    invoice.update(handleBy="手机测试员", totalProfit=50, totalCost=100, isPaid=True, paymentStatus="已收款", contact="LOCAL-ONLY", channel="到店", paymentMethod="微信")
meta = {"total": 1, "page": 1, "pageSize": 20, "totalPages": 1}
qa_mode = os.environ.get("ERP_MOBILE_QA_MODE", "owner")
qa_port = int(os.environ.get("ERP_MOBILE_QA_PORT", "3020"))
if qa_mode not in {"owner", "limited", "logged-out", "read-error"} or not 3020 <= qa_port <= 3029:
    raise ValueError("Invalid local QA scenario")

# Visual-only fixtures are opt-in: the user's existing 3020 preview keeps its
# original record. No business write or production API is ever enabled.
customer_scenario = os.environ.get("ERP_CUSTOMER_QA_SCENARIO", "baseline")
if customer_scenario not in {"baseline", "design", "stress", "many", "empty"}:
    raise ValueError("Invalid customer QA scenario")
sample_customers = [partner]
if customer_scenario in {"design", "stress", "many"}:
    sample_rows = [("星河硬件", "S级", 128600, "2026-10-07"), ("极客装机", "A级", 86400, "2026-10-06"), ("智联算力", "B级", 32500, "2026-10-06"), ("云杉科技", "A级", 256800, "2026-10-05"), ("北辰数码", "C级", 12600, "2026-10-04"), ("辰星贸易", "B级", 98200, "2026-10-03")]
    sample_customers = [{**partner, "id": f"C-DESIGN-{index}", "name": name, "level": level, "isCoreCustomer": level == "S级", "totalAmount": amount, "lastDealTime": date, "source": "微信", "tags": []} for index, (name, level, amount, date) in enumerate(sample_rows)]
    if customer_scenario == "stress":
        sample_customers[0].update(name="成都超长客户名称硬件回收与算力设备有限公司", totalAmount=1234567890)
    if customer_scenario == "many":
        sample_customers = [{**sample_customers[index % 6], "id": f"C-PAGE-{index}", "name": f"分页测试客户{index + 1:02d}"} for index in range(25)]
elif customer_scenario == "empty":
    sample_customers = []

# Inventory scenarios only prove rendering and parameter wiring, not production
# search/SQL or balances. All mutations remain blocked by this preview server.
inventory_scenario = os.environ.get("ERP_INVENTORY_QA_SCENARIO", "baseline")
if inventory_scenario not in {"baseline", "design", "stress", "many", "empty"}:
    raise ValueError("Invalid inventory QA scenario")
sample_inventory = [fixture["STOCK"]]
if inventory_scenario in {"design", "stress", "many"}:
    inventory_samples = [
        ("技嘉 RTX4090 AERO OC 雪鹰 24G", "显卡", "技嘉", "RTX4090", "24G", "95新", "已入库", 23000),
        ("微星 RTX5090 SUPRIM 水超龙 32G", "显卡", "微星", "RTX5090", "32G", "全新", "待检测", 46500),
        ("华硕 RTX4090D TUF Gaming 24G", "显卡", "华硕", "RTX4090D", "24G", "95新", "已锁定", 19000),
        ("Intel Core i9-14900K 盒装 CPU", "CPU", "Intel", "i9-14900K", "", "全新", "已入库", 4280),
        ("宏碁 冰刃 DDR5 6000 C28 16G", "内存", "宏碁", "DDR5 6000 C28", "16G", "全新", "已入库", 0),
        ("索泰 RTX3090 天启 24G", "显卡", "索泰", "RTX3090", "24G", "95新", "已入库", None),
        ("七彩虹 RTX4090 Vulcan 火神 24G", "显卡", "七彩虹", "RTX4090", "24G", "95新", "已售出", 22500),
    ]
    sample_inventory = [{**fixture["STOCK"], "id": f"KC-QA-{index}", "productId": f"P-QA-{index}", "productName": name, "name": name, "category": category, "brand": brand, "model": model, "vram": vram, "condition": condition, "status": status, "inspectionStatus": "待检测" if status == "待检测" else "已入库", "sn": "" if status == "待检测" else f"QA-SN-{model}-{index}", "entryTime": f"2026-10-0{7-index}", "inventoryDays": index + 1, "estSellPrice": price, "salesPrice": price if status == "已售出" else None, "costPrice": 100} for index, (name, category, brand, model, vram, condition, status, price) in enumerate(inventory_samples)]
    if inventory_scenario == "stress":
        sample_inventory[0].update(productName="技嘉 RTX4090 AERO OC 雪鹰 官方盒装超长型号名称 24G", sn="SN-THIS-IS-A-VERY-LONG-UNBROKEN-SERIAL-4090-202610080001", warehouseLocation="成都仓库 A区超长货架名称 第01层", estSellPrice=1234567890)
    elif inventory_scenario == "many":
        sample_inventory = [{**sample_inventory[index % 6], "id": f"KC-PAGE-{index}", "sn": f"QA-PAGE-{index+1:02d}"} for index in range(25)]
elif inventory_scenario == "empty":
    sample_inventory = []

def inventory_rows(params):
    keyword = params.get("keyword", [""])[0].casefold()
    status = params.get("status", [""])[0]
    rows = [item for item in sample_inventory if (not keyword or keyword in " ".join(str(item.get(key, "")) for key in ["id", "productName", "brand", "model", "sn"]).casefold()) and (not status or item["status"] == status) and (status or params.get("includeSold", ["false"])[0] == "true" or item["status"] != "已售出")]
    for query_key, field in [("category", "category"), ("brand", "brand"), ("supplierName", "supplierName"), ("warehouseLocation", "warehouseLocation")]:
        value = params.get(query_key, [""])[0]
        if value:
            rows = [item for item in rows if value in str(item.get(field, ""))]
    sort_key = {"product": "productName", "days": "inventoryDays", "status": "status", "cost": "costPrice", "warehouseLocation": "warehouseLocation"}.get(params.get("sortKey", ["entryTime"])[0], "entryTime")
    rows.sort(key=lambda item: item.get(sort_key) or (0 if sort_key in {"inventoryDays", "costPrice"} else ""), reverse=params.get("sortDirection", ["desc"])[0] == "desc")
    return rows

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def respond(self, data, status=200, kind="application/json"):
        body = data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/__inventory-compare":
            html = '''<!doctype html><meta charset="utf-8"><title>Inventory mobile QA comparison</title><style>body{margin:0;background:#e8edf3;font:14px system-ui}main{display:flex;gap:24px;padding:20px}section{width:390px}h1{font-size:14px}img{display:block;width:390px;height:auto}</style><main><section><h1>Selected Option 2 · shared visual language, not inventory mock</h1><img src="/__customer-reference.png"></section><section><h1>Inventory implementation · local synthetic data · 390×844</h1><img src="/__qa/inv-final-390.jpg"></section></main>'''
            self.respond(html.encode(), kind="text/html; charset=utf-8")
            return
        if path == "/__customer-reference.png":
            image = root.parent / "docs" / "mobile-v2-evidence" / "20261008" / "thumb" / "selected-reference.png"
            self.respond(image.read_bytes(), kind="image/png")
            return
        if path == "/__customer-compare":
            capture = parse_qs(urlparse(self.path).query).get("capture", ["thumb-customers-initial-390.jpg"])[0]
            if not re.fullmatch(r"[a-z0-9-]{1,80}\.(jpg|png)", capture):
                self.respond({"error": "Invalid comparison capture"}, 400)
                return
            html = f'''<!doctype html><meta charset="utf-8"><title>Thumb-first customer comparison</title><style>body{{margin:0;background:#e8edf3;font:14px system-ui}}main{{display:flex;gap:24px;padding:20px}}section{{width:390px}}h1{{font-size:14px}}img{{display:block;width:390px;height:auto}}</style><main><section><h1>Selected source · 390 CSS px</h1><img src="/__customer-reference.png"></section><section><h1>Current implementation · synthetic local data</h1><img src="/__qa/{capture}"></section></main>'''
            self.respond(html.encode(), kind="text/html; charset=utf-8")
            return
        if path.startswith("/__qa/"):
            filename = path.removeprefix("/__qa/")
            if not re.fullmatch(r"[a-z0-9-]{1,80}\.(jpg|png)", filename):
                self.respond({"error": "Invalid evidence name"}, 400)
                return
            target = Path("/private/tmp/erp-mobile-v2-evidence") / filename
            if not target.is_file():
                self.respond({"error": "Capture not available"}, 404)
                return
            self.respond(target.read_bytes(), kind=mimetypes.guess_type(target)[0] or "image/jpeg")
            return
        if path == "/__intake_compare":
            focus = parse_qs(urlparse(self.path).query).get("focus", ["full"])[0]
            nav = focus == "nav"
            x, y, height = (959, 504, 54) if nav else (356, 678, 279)
            scale = 390 / 253
            crop_height = 60 if nav else 844
            image_top = -784 if nav else 0
            html = f'''<!doctype html><meta charset="utf-8"><title>Mobile intake comparison</title><style>body{{margin:0;background:#e8edf3;font:13px system-ui}}main{{display:flex;gap:20px;padding:20px}}section{{width:390px}}h1{{font-size:13px}}.source{{position:relative;overflow:hidden;width:390px;height:{height*scale}px;background:white}}.source img{{position:absolute;width:{1536*scale}px;max-width:none;left:{-x*scale}px;top:{-y*scale}px}}.capture{{position:relative;overflow:hidden;width:390px;height:{crop_height}px}}.capture img{{position:absolute;width:390px;top:{image_top}px}}</style><main><section><h1>Reference · task hierarchy, not same business flow</h1><div class="source"><img src="/__reference.png"></div></section><section><h1>Before · 390 x 844, new intake</h1><div class="capture"><img src="/__qa/nav-inbound-before-new-390.jpg"></div></section><section><h1>After · 390 x 844, new intake</h1><div class="capture"><img src="/__qa/nav-inbound-after-new-390.jpg"></div></section></main>'''
            self.respond(html.encode(), kind="text/html; charset=utf-8")
            return
        if path == "/__capture":
            html = '''<!doctype html><meta charset="utf-8"><title>Save local QA capture</title><form method="post"><label>Capture name<input name="name" value="home-390"></label><label>Screenshot base64<textarea name="png"></textarea></label><button>Save local screenshot</button></form>'''
            self.respond(html.encode(), kind="text/html; charset=utf-8")
            return
        if path == "/__reference.png":
            reference = root.parent / "docs" / "mobile-v2-evidence" / "reference-board.png"
            self.respond(reference.read_bytes(), kind="image/png")
            return
        if path == "/__compare":
            screen = parse_qs(urlparse(self.path).query).get("screen", ["home"])[0]
            screens = {"home": (49, 49, "/"), "sales": (356, 49, "/sales/new"), "customer": (664, 49, "/sales/new"), "inventory": (959, 49, "/inventory"), "product": (1253, 49, "/inventory?detail=KC-MOBILE"), "scanner": (49, 678, "/inventory"), "purchase": (356, 678, "/purchase/new"), "order": (664, 678, "/sales/XS-MOBILE"), "customer-detail": (959, 678, "/crm/customers"), "profile": (1253, 678, "/")}
            x, y, route = screens.get(screen, screens["home"])
            height = 500 if y < 600 else 279
            scale = 390 / 253
            html = f'''<!doctype html><html><meta charset="utf-8"><title>ERP Mobile visual comparison</title><style>body{{margin:0;background:#e8edf3;font:14px system-ui}}main{{display:flex;gap:24px;padding:20px}}section{{width:390px}}h1{{font-size:14px}}.source{{position:relative;overflow:hidden;width:390px;height:{height*scale}px;background:white}}img{{position:absolute;width:{1536*scale}px;max-width:none;left:{-x*scale}px;top:{-y*scale}px}}iframe{{width:390px;height:{height*scale}px;border:0;background:white}}</style><main><section><h1>Source · app-owned crop</h1><div class="source"><img src="/__reference.png"></div></section><section><h1>Implementation · synthetic local data</h1><iframe title="ERP mobile implementation" src="{route}"></iframe></section></main></html>'''
            self.respond(html.encode(), kind="text/html; charset=utf-8")
            return
        if path.startswith("/api/"):
            if qa_mode == "logged-out":
                self.respond({"error": {"message": "本地模拟：请登录"}}, 401)
                return
            if qa_mode == "read-error" and path != "/api/auth/me" and not path.startswith("/api/state"):
                self.respond({"error": {"message": "本地模拟：读取失败，可重试"}}, 503)
                return
            data = {"data": [], "meta": {**meta, "total": 0}}
            if path == "/api/auth/me":
                data = {"data": {"id": "local-mobile", "username": "local-mobile", "displayName": "手机测试员", "role": "老板", "enabled": True, "csrfToken": "local-only"}}
                if qa_mode == "limited":
                    data["data"].update(role="店员", permissionOverrides={"allowedMenus": ["inventory"], "showCost": False, "showProfit": False, "canDelete": False, "canEditHistory": False})
            elif path == "/api/customers/page":
                params = parse_qs(urlparse(self.path).query)
                keyword = params.get("keyword", [""])[0].casefold()
                level = params.get("level", ["all"])[0]
                channel = params.get("channel", ["all"])[0]
                customer_type = params.get("type", ["all"])[0]
                rows = [item for item in sample_customers if (not keyword or keyword in " ".join(str(item.get(key, "")) for key in ["name", "contact", "id", "source"]).casefold()) and (level == "all" or item["level"] == level) and (channel == "all" or item["source"] == channel) and (customer_type == "all" or item["type"] == customer_type)]
                sort_by = params.get("sortKey", ["lastDealTime"])[0]
                descending = params.get("sortDirection", ["desc"])[0] == "desc"
                rows.sort(key=lambda item: item.get(sort_by) or "", reverse=descending)
                page_size = int(params.get("pageSize", ["20"])[0])
                page = int(params.get("page", ["1"])[0])
                data = {"data": {"items": rows[(page - 1) * page_size:page * page_size]}, "meta": {"page": page, "pageSize": page_size, "total": len(rows), "summary": {"coreCount": sum(item["level"] == "S级" for item in rows), "receivable": 0, "payable": 0}, "facets": {"types": [partner["type"]], "channels": ["微信"]}}}
            elif path == "/api/sales/customers":
                data = {"data": [{**partner, "displayName": partner["name"], "primaryPhone": "LOCAL-ONLY", "roles": ["customer"], "legacyCustomer": partner}]}
            elif path == "/api/sales/product-candidates":
                data = {"data": [{**fixture["PRODUCT"], "productId": fixture["PRODUCT"]["id"], "productName": fixture["PRODUCT"]["name"], "availableQuantity": 10, "availabilityKnown": True, "estimatedSellPrice": 150, "saleable": True}]}
            elif path == "/api/finance/profit-report":
                query = {key: values[0] for key, values in parse_qs(urlparse(self.path).query, keep_blank_values=True).items() if key != "exportAll"}
                query.update(page=int(query.get("page", 1)), pageSize=int(query.get("pageSize", 20)))
                row = {"id": "P-MOBILE", "label": fixture["PRODUCT"]["name"], "secondary": "95新", "orderCount": 2, "quantity": 3, "revenue": 450, "cost": 300, "profit": 150, "margin": 1 / 3}
                data = {"data": {"filters": query, "sourceItems": [], "rows": [row], "pageRows": [row], "insightRows": [row], "trend": [{"date": "2026-10-07", "label": "10-07", "revenue": 450, "profit": 150, "netProfit": 150}], "summary": {**row, "profitableGroups": 1, "lossGroups": 0, "otherIncome": 0, "otherExpense": 0, "netProfit": 150}, "meta": meta}}
            elif path == "/api/products":
                data = {"data": state, "meta": meta}
            elif path == "/api/vendors":
                data = {"data": state, "meta": meta}
            elif path == "/api/users":
                data = {"data": state}
            elif path == "/api/logs":
                data = {"data": {"auditLogs": [{"id": "LOG-MOBILE", "time": "2026-10-07 14:30", "user": "手机测试员", "module": "销售", "type": "创建", "target": "XS-MOBILE-001", "beforeVal": "", "afterVal": "仅本地合成记录"}]}, "meta": meta}
            elif path.startswith(("/api/finance/dashboard", "/api/aftersales/workspace", "/api/assembly-operations", "/api/market-quotes")):
                data = {"data": state, "meta": meta}
            elif path.startswith(("/api/gpu_erp/finance/payment-ins", "/api/gpu_erp/finance/payment-outs", "/api/gpu_erp/finance/account-transfers")):
                data = {"data": state, "meta": meta}
            elif path == "/api/gpu_erp/finance/settlement-ledger":
                data = {"data": state["settlementLedger"], "meta": meta}
            elif path == "/api/inventory/items":
                if inventory_scenario == "baseline":
                    data = {"data": [fixture["STOCK"]], "meta": meta}
                else:
                    params = parse_qs(urlparse(self.path).query)
                    rows = inventory_rows(params)
                    page, page_size = int(params.get("page", ["1"])[0]), int(params.get("pageSize", ["20"])[0])
                    data = {"data": rows[(page-1)*page_size:page*page_size], "meta": {"total": len(rows), "page": page, "pageSize": page_size}}
            elif path == "/api/inventory/summary":
                if inventory_scenario == "baseline":
                    data = {"data": [{**fixture["PRODUCT"], "key": fixture["PRODUCT"]["id"], "productName": fixture["PRODUCT"]["name"], "warehouseLocation": "A区货架01", "warehouseLocations": ["A区货架01"], "totalCount": 3, "availableCount": 1, "pendingCount": 2, "lockedCount": 0, "soldCount": 0, "repairCount": 0, "totalCost": 300, "totalEstSell": 450, "avgCost": 100, "avgEstSell": 150, "estimatedProfit": 150}]}
                else:
                    rows = inventory_rows(parse_qs(urlparse(self.path).query))
                    data = {"data": [{**item, "key": item["productId"], "warehouseLocations": [item["warehouseLocation"]], "totalCount": 1, "availableCount": int(item["status"] == "已入库"), "pendingCount": int(item["status"] == "待检测"), "lockedCount": int(item["status"] == "已锁定"), "soldCount": int(item["status"] == "已售出"), "repairCount": 0, "totalCost": item["costPrice"], "totalEstSell": item["estSellPrice"], "avgCost": item["costPrice"], "avgEstSell": item["estSellPrice"]} for item in rows]}
            elif path.endswith("/journey"):
                stock = next((item for item in sample_inventory if item["id"] == path.split("/")[-2]), fixture["STOCK"])
                data = {"data": {"card": stock, "events": [], "purchases": [], "sales": [], "returns": [], "payments": [], "inspections": [], "aftersales": [], "assemblies": []}}
            elif path.endswith("/settlement-accounts"):
                data = {"data": [fixture["ACCOUNT"]]}
            elif path.startswith(("/api/state", "/api/returns/reference", "/api/purchase-invoices/reference", "/api/inspections/workspace")) or path in {"/api/purchase-invoices", "/api/purchase-invoices/detail", "/api/sales-invoices", "/api/sales-invoices/outbound"}:
                data = {"data": state, "meta": {**meta, "total": len(state["salesInvoices"]) if "sales" in path else 1}}
            self.respond(data)
            return
        try:
            build = root.parent / "dist"
            if (build / "index.html").is_file():
                target = (build / path.lstrip("/")).resolve()
                if not target.is_relative_to(build.resolve()):
                    self.respond({"error": "Invalid preview path"}, 400)
                    return
                if not target.is_file():
                    target = build / "index.html"
                self.respond(target.read_bytes(), kind=mimetypes.guess_type(target)[0] or "application/octet-stream")
                return
            with urlopen("http://127.0.0.1:3010" + self.path, timeout=20) as response:
                body = response.read()
                kind = response.headers.get("Content-Type", "text/plain")
            if path == "/src/hooks/useWorkspaceTabRuntime.tsx":
                text = body.decode()
                marker = "const drafts = {};"
                if marker not in text:
                    self.respond({"error": "Draft fixture marker changed"}, 500)
                    return
                imports = 'import {createPurchaseDefaults} from "/src/features/purchase/purchase.defaults.ts"; import {createSalesDefaults} from "/src/features/sales/sales.defaults.ts";\n'
                body = (imports + text.replace(marker, fixture["SEED"])).encode()
            self.respond(body, kind=kind)
        except Exception:
            self.respond({"error": "Local Vite preview is unavailable"}, 502)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 4_000_000:
            self.respond({"error": "Capture exceeds local limit"}, 413)
            self.close_connection = True
            return
        payload = self.rfile.read(length)
        if self.path == "/__capture":
            values = parse_qs(payload.decode())
            name = values.get("name", [""])[0]
            if not re.fullmatch(r"[a-z0-9-]{1,80}", name):
                self.respond({"error": "Invalid capture name"}, 400)
                return
            try:
                png = base64.b64decode(values.get("png", [""])[0], validate=True)
                extension = "png" if png.startswith(b"\x89PNG\r\n\x1a\n") else "jpg" if png.startswith(b"\xff\xd8\xff") else None
                if not extension:
                    raise ValueError("Unsupported screenshot")
                directory = Path("/private/tmp/erp-mobile-v2-evidence")
                directory.mkdir(exist_ok=True)
                target = directory / (name + "." + extension)
                target.write_bytes(png)
                self.respond(f"<!doctype html><meta charset='utf-8'><p>Saved {target}</p><a href='/__capture'>Next capture</a>".encode(), kind="text/html; charset=utf-8")
            except (ValueError, OSError):
                self.respond({"error": "Cannot save capture"}, 400)
            return
        if self.path == "/api/ops/client-events":
            self.respond({"data": {"accepted": True}})
            return
        self.respond({"error": {"message": "本地模拟冲突：输入已保留；此预览不会写入真实单据"}}, 409)

    do_PUT = do_POST
    do_PATCH = do_POST
    do_DELETE = do_POST

    def log_message(self, *_):
        pass

class PreviewServer(ThreadingHTTPServer):
    request_queue_size = 128

print(f"Isolated mobile preview http://127.0.0.1:{qa_port} ({qa_mode}; synthetic data; writes blocked)", flush=True)
PreviewServer(("127.0.0.1", qa_port), Handler).serve_forever()
