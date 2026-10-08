/** Local API fixtures only. Run by the existing Playwright CLI smoke runner. */
export function mediaOwnershipSmokeCode(baseUrl, width, mode) {
  return `async page => {
    const width = ${JSON.stringify(width)}, mode = ${JSON.stringify(mode)}, base = ${JSON.stringify(baseUrl)};
    const context = await page.context().browser().newContext({viewport: {width, height: 1000}});
    const tabPage = await context.newPage();
    const held = [], requests = [], errors = [];
    tabPage.on("pageerror", error => errors.push(String(error)));
    let png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWWQAAAAASUVORK5CYII=";
    const cards = ["A", "B"].map(name => ({id: "KC-MEDIA-" + name, productId: "P-" + name, productName: "本地上传商品 " + name, category: "显卡", brand: "本地", model: "RTX5070", vram: "12G", condition: "95新", status: "待检测", sn: "", warehouseLocation: "A区货架-01", entryTime: "2026-10-04"}));
    const record = {id: "JC-MEDIA-EDIT", inventoryId: cards[0].id, recordVersion: 7, sn: "OLD-SN-A", condition: "95新", resultStatus: "通过", inspectTime: "2026-10-04 09:00:00", inspector: "本地检测员", images: ["/api/media/assets/IMG-EXISTING"]};
    const empty = Object.fromEntries(["products", "inventory", "inspections", "salesInvoices", "purchaseInvoices", "customers", "vendors", "systemUsers", "customPermissions"].map(key => [key, []]));
    const discard = async () => {
      const dialog = tabPage.getByRole("dialog", {name: "当前内容尚未保存", exact: true});
      if (await dialog.isVisible()) await dialog.getByRole("button", {name: "放弃并离开", exact: true}).click();
    };
    const switchTab = async name => {
      if (width < 1024) {
        await tabPage.locator('button[aria-label^="切换页面，当前为"]').click();
        await tabPage.locator("a:visible").filter({hasText: name}).click();
      } else await tabPage.locator('nav[aria-label="已打开页面"] a').filter({hasText: name}).click();
    };
    try {
      if (mode === "compression-close") await tabPage.addInitScript(() => {
        window.releaseReads = [];
        const read = FileReader.prototype.readAsDataURL;
        FileReader.prototype.readAsDataURL = function(file) {window.releaseReads.push(() => read.call(this, file));};
      });
      await tabPage.route(base + "/api/**", async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        let body;
        if (path === "/api/auth/me") body = {data: {id: "media-local", username: "media-local", displayName: "本地检测员", role: "老板", enabled: true, csrfToken: "local-media-csrf"}};
        else if (path.startsWith("/api/state")) body = {data: empty};
        else if (path === "/api/inspections/workspace") body = {data: {inventory: cards, inspections: mode === "delete-failure-switch" ? [record] : []}};
        else if (path === "/api/media" && request.method() === "POST") {requests.push(request.postDataJSON()); held.push(route); return;}
        else if (path.startsWith("/api/media/assets/")) {await route.fulfill({status: 200, contentType: "image/png", body: Buffer.from(png, "base64")}); return;}
        else if (!["GET", "HEAD"].includes(request.method()) && path !== "/api/ops/client-events") throw new Error("unexpected media smoke business write: " + path);
        else body = {data: []};
        await route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(body)});
      });
      await tabPage.goto(base + (mode === "delete-failure-switch" ? "/inspections" : "/inspections?inventory=KC-MEDIA-A"));
      await tabPage.waitForLoadState("networkidle");
      png = await tabPage.evaluate(() => {const c = document.createElement("canvas"); c.width = 40; c.height = 40; c.getContext("2d").fillRect(0, 0, 40, 40); return c.toDataURL("image/png").split(",")[1];});
      const form = tabPage.locator("form.erp-inspection-form");
      const chooseB = async () => {
        if (width < 768) {
          await tabPage.getByRole("button", {name: "返回列表", exact: true}).click();
          const pending = tabPage.getByRole("button", {name: /^待检 \\d+$/});
          if (await pending.isVisible()) await pending.click();
        }
        await tabPage.getByRole("button").filter({hasText: cards[1].productName}).click();
        await discard();
        await form.locator("h3").filter({hasText: cards[1].productName}).waitFor({state: "visible"});
      };
      if (mode === "delete-failure-switch") {
        if (width < 768) {
          await tabPage.getByRole("button", {name: "已完成 1", exact: true}).click();
          await tabPage.getByRole("button", {name: "编辑检测单", exact: true}).click();
          await tabPage.locator("summary").filter({hasText: "结论与附件"}).click();
        } else await tabPage.getByRole("button", {name: "编辑检测单 JC-MEDIA-EDIT", exact: true}).click();
        await tabPage.getByRole("button", {name: "删除检测图片 1", exact: true}).click();
        await tabPage.waitForTimeout(150);
        if (held.length !== 1) throw new Error("deletion did not start its relation update");
        await chooseB();
        try {await held.shift().fulfill({status: 500, contentType: "application/json", body: JSON.stringify({error: {message: "A deletion failed"}})});} catch {}
        await tabPage.waitForTimeout(150);
        if (await tabPage.getByRole("alert").filter({hasText: "图片引用删除同步失败"}).count()) throw new Error("A deletion error contaminated B");
      } else {
        if (width < 768) await tabPage.locator("summary").filter({hasText: "结论与附件"}).click();
        await form.locator('input[type="file"]').setInputFiles({name: "A.png", mimeType: "image/png", buffer: Buffer.from(png, "base64")});
        if (mode === "compression-close") {
          await tabPage.waitForFunction(() => window.releaseReads.length === 1);
          if (width < 1024) await tabPage.locator('button[aria-label^="切换页面，当前为"]').click();
          await tabPage.locator('button[aria-label="关闭检测质检"]').filter({visible: true}).click();
          await discard();
          if (await form.count()) throw new Error("closed Tab retained the form");
          await tabPage.evaluate(() => window.releaseReads.splice(0).forEach(release => release()));
          await tabPage.waitForTimeout(350);
          if (requests.length) throw new Error("compression started HTTP after Tab closure");
        } else {
          await tabPage.waitForFunction(() => document.body.innerText.includes("上传中"));
          await tabPage.waitForTimeout(150);
          if (requests.length !== 1) throw new Error("A did not upload exactly once");
          if (mode === "hidden-completion") {
            await switchTab("首页");
            const home = tabPage.url();
            await held.shift().fulfill({status: 200, contentType: "application/json", body: JSON.stringify({data: {urls: ["/api/media/assets/IMG-A"]}})});
            await tabPage.waitForTimeout(200);
            if (tabPage.url() !== home || await form.count() !== 1) throw new Error("hidden upload changed the active page or lost its form");
            await switchTab("检测质检");
            await form.locator('p[title="A.png"]').waitFor({state: "visible"});
            if (!(await form.innerText()).includes("已上传") || requests.length !== 1) throw new Error("kept-alive draft lost/restarted its upload");
          } else {
            await chooseB();
            if (width < 768) await tabPage.locator("summary").filter({hasText: "结论与附件"}).click();
            await form.locator('input[type="file"]').setInputFiles({name: "B.png", mimeType: "image/png", buffer: Buffer.from(png, "base64")});
            await tabPage.waitForTimeout(500);
            if (requests.length !== 2 || requests[0].entityId === requests[1].entityId) throw new Error("B did not get an independent draft/queue");
          }
        }
      }
      if (errors.length) throw new Error("media browser errors: " + errors.join("; "));
      if (await tabPage.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("media flow overflowed the page");
    } catch (caught) {
      await tabPage.screenshot({path: "media-failure-" + width + "-" + mode + ".png", fullPage: true});
      throw caught;
    } finally {
      for (const route of held) {try {await route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({data: {urls: ["/api/media/assets/IMG-LATE"]}})});} catch {}}
      await context.close();
    }
  }`;
}
