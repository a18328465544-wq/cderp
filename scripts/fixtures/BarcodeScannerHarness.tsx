// Local browser regression only. This entry is not part of the production build.
import {useState} from "react";
import {createRoot} from "react-dom/client";
import {ErpBarcodeScannerDialog} from "../../src/components/common/ErpBarcodeScannerDialog";
import {WorkspaceTabActivityProvider} from "../../src/hooks/useWorkspaceTabRuntime";
import {Button} from "../../src/components/ui";
import "../../src/styles/globals.css";

function Harness() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(true);
  const [codes, setCodes] = useState<string[]>([]);
  return <main id="main-content">
    <Button onClick={() => setOpen(true)}>打开扫码</Button>
    <Button onClick={() => setActive((current) => !current)}>切换任务</Button>
    <output aria-label="识别结果">{codes.join("\n")}</output>
    <WorkspaceTabActivityProvider value={{tabId: "scanner-test", pageKey: "inventory", active}}>
      <ErpBarcodeScannerDialog open={open} onOpenChange={setOpen} onDetected={(code) => setCodes((current) => [...current, code])} />
    </WorkspaceTabActivityProvider>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
