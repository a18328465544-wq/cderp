# V2 手机扫码解码

所有入口继续复用 `src/components/common/ErpBarcodeScannerDialog.tsx`：库存查找、检测质检 SN、销售出库核验、组装拆卸。`onDetected(code)` 和原有单次识别后关闭行为保持一致；扫描仅回填当前输入/草稿，库存与出库仍由既有服务端接口最终核验。

## 引擎与资源

### 取景窗口（2026-10-09）

- 手机与桌面共用紧凑弹窗，不占满手机屏幕。相机预览为 16:9，中央引导框为 3:1、宽度 82%；共享 `--erp-scanner-*` Token 管理，不在各业务入口复制尺寸。
- 预览使用 `object-fit: contain`，不裁掉相机画面两侧的条码白边。引导框只帮助对准；解码继续读取完整源画面，不改变原二维码格式、识别队列、会话归属或出入库逻辑。
- 准备中与权限失败有独立状态；相机失败时隐藏引导框，保留重试、图片识别与手机手工输入。弹窗沿用共享安全区、键盘视口和内部滚动规则。
- 本地 Vite 可打开 `/scripts/fixtures/barcode-scanner.html?preview=frame` 或 `?preview=denied` 检查横向框及错误态。这是显式合成画面，不访问真实摄像头，也不作为真机扫码识别率证明。

- 原生 `BarcodeDetector` 支持全部请求格式时优先使用；能力查询失败、构造失败或格式支持不全时进入兼容引擎。
- 原生连续三个解码异常、单次解码超过 1.2 秒或持续 2.5 秒无结果时，当前会话切换为兼容引擎。单张图片无原生结果时立即尝试兼容引擎。
- 兼容引擎锁定 `barcode-detector@3.2.2` / `zxing-wasm@3.1.3`，通过 Vite 动态模块创建 Worker。版本匹配的 `zxing_reader.wasm` 是本站带内容哈希的构建资源，不使用库默认的公共 CDN 地址。
- 正常页面和正常原生扫码不加载 Worker/WASM。扫码画面最多 1280px 长边；视频串行解码最多约 8 帧/秒。兼容引擎初始化限制为 15 秒、单帧限制为 5 秒，失败后允许用户重试。
- `barcode-detector` / `zxing-wasm` 仅允许在共享组件适配层导入；业务页面不直接管理第三方引擎。

## 生命周期与失败处理

关闭、卸载、任务失活、重试、手动录入或识别成功都会终止对应 Worker 并释放已获得的相机轨道。晚到的权限请求和识别结果不属于新会话，不能回填、关闭新的弹窗。图片与视频共用同一串行解码队列。

相机需要 HTTPS（开发时 localhost/127.0.0.1 可用）以及浏览器授权；相机权限拒绝不阻止图片识别。JPG / PNG / WEBP / BMP 图片最多 12MB，只在设备端读取、缩放和解码，不上传相机画面或条码照片。无有效条码、加载失败及权限拒绝都有操作提示，手机保留手工 SN/编号输入。

显卡标签可能有 SN、P/N、商品码等多个条码。解码器只返回扫描内容，不在通用组件里猜测品牌 SN、不删除前导零、不自动改写大小写；现有领域核验继续判断是否属于当前库存/单据。未来连续扫码与多码选择应有单独的交互和业务验收。

## 验证

- 专项单元测试：`node --import tsx --test src/components/common/barcodeDecoder.test.ts src/components/common/barcodeScannerSession.test.ts src/components/common/barcodeScannerError.test.ts`。
- 浏览器测试：启动本地 Vite 后运行 `npm run test:barcode-browser`，可通过 `BARCODE_SMOKE_BASE_URL` 指定其他本地端口。测试用真实生成的 Code128/QR 图片和合成视频验证实际 WASM 解码、原生优先、格式不足、无结果切换、权限拒绝后的图片识别、加载失败重试、关闭清理以及本域名资源加载。
- 构建产物测试：启动本地 `npm run preview` 后运行 `npm run test:barcode-browser:production`（同样可设置 `BARCODE_SMOKE_BASE_URL`）。它打开实际库存页面并拦截 API 为本地测试数据，检查摄像头及图片结果回填搜索框，不产生业务写入，不访问生产服务器。
- `scripts/fixtures/BarcodeScannerHarness.tsx` 只用于本地回归，没有生产路由或生产入口。
- 本地构建后检查 WASM 资源与 Worker chunk 存在且未在首页预加载，再执行现有 lint、全量测试和构建。
- 合成视频验证不能替代 iPhone Safari、Android Chrome 的实体相机对焦、反光标签、权限流程和识别率验收。

### 本次本地验收（2026-10-08）

- 扫码专项单元测试：15 项通过。
- 开发浏览器：390px / 1440px 共 14 个场景通过；构建后库存页面：390px 共 2 个场景通过。
- 完整回归：1463 项，1426 通过、37 跳过、0 失败。跳过项不作为已验收。
- `npm run typecheck`、`npm run lint`、`npm run build`、`npm run check:performance` 通过。
- WASM 约 1.09MB（gzip 约 457KB），独立 Worker 约 43.66KB；扫码引擎未在首页预加载。兼容扫码第一次打开需要下载资源，真实设备低网速下的加载体验仍需验收。
- 本次未部署；真实 iPhone / Android 相机识别率未实测。

### 紧凑条码窗口验收（2026-10-09）

- 19 项扫码/布局专项测试通过，响应式及手机控件契约回归通过；本地完整测试 1530 通过、37 跳过、0 失败。跳过项不作为验收结果。
- 直接浏览器检查 320/390/430/768/1024/1440px、844×390 横屏和 390×420 短视口：横向比例正确、无页面横向溢出、关闭入口可见；短视口在弹窗正文内滚动。
- 合成权限拒绝时不显示活动取景框，图片入口可用，手机手工回填 `001-AbC-SN4090` 后正常关闭且保留前导零/大小写。
- `npm run lint`、`npm run build`、`npm run check:performance` 和差异检查通过。本轮只在本地修改，未上线，未验证实体手机摄像头或软键盘。

本次不新增原生 App、不接商业扫码 SDK、不新增出入库接口。原生 App 解码可在将来接到同一共享适配层。
