// Local browser regression only. This entry is not part of the production build.
import {useState} from "react";
import {createRoot} from "react-dom/client";
import {ErpBarcodeScannerDialog} from "../../src/components/common/ErpBarcodeScannerDialog";
import {WorkspaceTabActivityProvider} from "../../src/hooks/useWorkspaceTabRuntime";
import {Button} from "../../src/components/ui";
import "../../src/styles/globals.css";

// Explicit local-only geometry fixtures avoid requesting the user's camera.
// No real barcode is returned; hardware recognition still needs device QA.
const preview = new URLSearchParams(location.search).get("preview");
if (preview === "frame" || preview === "denied") {
  class PreviewDetector {
    static async getSupportedFormats() {return ["qr_code", "code_128", "code_39", "code_93", "ean_13", "ean_8", "data_matrix"];}
    async detect() {return [];}
  }
  Object.defineProperty(window, "BarcodeDetector", {value: PreviewDetector, configurable: true});
  navigator.mediaDevices.getUserMedia = async () => {
    if (preview === "denied") throw new DOMException("Local camera denial fixture", "NotAllowedError");
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#374151";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.captureStream(8);
  };
}

function Harness() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(true);
  const [codes, setCodes] = useState<string[]>([]);
  return <main id="main-content">
    {preview && <p>本地模拟相机 · 不访问设备摄像头</p>}
    <Button onClick={() => setOpen(true)}>打开扫码</Button>
    <Button onClick={() => setActive((current) => !current)}>切换任务</Button>
    <output aria-label="识别结果">{codes.join("\n")}</output>
    <WorkspaceTabActivityProvider value={{tabId: "scanner-test", pageKey: "inventory", active}}>
      <ErpBarcodeScannerDialog open={open} onOpenChange={setOpen} onDetected={(code) => setCodes((current) => [...current, code])} />
    </WorkspaceTabActivityProvider>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
