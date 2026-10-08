import {createContext, useContext, useEffect, useId, useRef, useState, type ReactNode} from "react";
import {ArrowLeft, ArrowRight} from "lucide-react";
import {Button} from "@/src/components/ui";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {usePhoneBackLayer} from "@/src/hooks/usePhoneBack";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";

type WorkflowContext = {phone: boolean; step: number; select: (step: number) => void};
const Context = createContext<WorkflowContext | null>(null);
export type ErpMobileWorkflowStep = {label: string; ready?: boolean; blockedReason?: string};

/** Presentation only: all sections stay mounted, including hidden sections.
 * The owning form retains its one controller, mutations and draft lifecycle. */
export function ErpMobileWorkflow({steps, children, summary, pending = false, resetKey, errorStep}: {
  steps: ErpMobileWorkflowStep[];
  children: ReactNode;
  summary?: ReactNode;
  pending?: boolean;
  resetKey?: string;
  errorStep?: number;
}) {
  const phone = useErpPhone();
  const {active} = useWorkspaceTabActivity();
  const [selectedStep, setStep] = useState(0);
  const step = Math.max(0, Math.min(steps.length - 1, selectedStep));
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const select = (next: number) => {
    setStep(Math.max(0, Math.min(steps.length - 1, next)));
    root.current?.scrollIntoView({block: "start", behavior: "auto"});
  };
  // Changing intake mode changes its steps, not its registered form values.
  // Start at SN again instead of restoring an obsolete final-step index.
  useEffect(() => setStep(0), [resetKey, steps.length]);
  useEffect(() => {if (errorStep !== undefined) setStep(Math.max(0, Math.min(steps.length - 1, errorStep)));}, [errorStep, steps.length]);
  const current = steps[step];
  usePhoneBackLayer(active && step > 0, () => {if (!pending) select(step - 1);}, 100);
  const final = step === steps.length - 1;
  // Prevent Enter in an intermediate step from accidentally submitting a
  // partially hidden order. The same final submit handler remains authoritative.
  return <Context.Provider value={{phone, step, select}}><div ref={root} data-erp-component="mobile-workflow" data-mobile-step={step} data-mobile-final={String(final)} onSubmitCapture={(event) => {
    if (phone && !final) {event.preventDefault(); event.stopPropagation(); if (current?.ready !== false) select(step + 1);}
  }}>
    {steps.length > 1 && <nav className="erp-mobile-workflow-progress" aria-label="录入步骤">
      {steps.map((item, index) => <Button key={item.label} type="button" size="sm" variant={index === step ? "secondary" : "ghost"} aria-current={index === step ? "step" : undefined} disabled={pending || index > step && steps.slice(0, index).some((entry) => entry.ready === false)} onClick={() => select(index)}><span className="tabular-nums">{index + 1}</span>{item.label}</Button>)}
    </nav>}
    <div data-erp-region="mobile-workflow-content" data-workflow-id={id}>{children}</div>
    {!final && <div className="erp-mobile-workflow-actions" data-erp-region="mobile-workflow-actions">
      {summary && <div className="erp-mobile-workflow-summary">{summary}</div>}
      {current?.ready === false && current.blockedReason && <p role="status" className="text-xs text-[var(--erp-color-text-secondary)]">{current.blockedReason}</p>}
      <div className="flex gap-2">{step > 0 && <Button type="button" variant="secondary" disabled={pending} onClick={() => select(step - 1)}><ArrowLeft className="h-4 w-4" />上一步</Button>}<Button type="button" variant="primary" className="flex-1" disabled={pending || current?.ready === false} onClick={() => select(step + 1)}>下一步：{steps[step + 1]?.label}<ArrowRight className="h-4 w-4" /></Button></div>
    </div>}
  </div></Context.Provider>;
}

export function ErpMobileWorkflowSection({step, children}: {step: number; children: ReactNode}) {
  const workflow = useContext(Context);
  return <div data-erp-region="mobile-workflow-section" data-workflow-step={step} hidden={workflow?.phone && workflow.step !== step || undefined}>{children}</div>;
}

export function ErpMobileWorkflowEditButton({disabled = false}: {disabled?: boolean}) {
  const workflow = useContext(Context);
  return <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => workflow?.select(0)}>修改明细</Button>;
}
