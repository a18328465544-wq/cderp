import {useId, useState, type ReactNode} from "react";
import {ChevronDown} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpDialogShell} from "./ErpDialogShell";
import {useErpPhone} from "@/src/hooks/useErpViewport";

/** Keep the full, authoritative metrics available without pushing a phone's
 * search results below the fold. No calculations or copies of data live here. */
export function ErpMobileSummary({label = "查看统计", summary, children}: {label?: string; summary?: ReactNode; children: ReactNode}) {
  const phone = useErpPhone();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  if (phone) return <section data-erp-component="mobile-summary"><Button type="button" variant="ghost" size="sm" className="w-full justify-between" onClick={() => setExpanded(true)} aria-expanded={expanded}><span>{summary || label}</span><span className="flex items-center gap-1 text-xs">{summary ? label : null}<ChevronDown className="h-4 w-4" /></span></Button><ErpDialogShell open={expanded} onOpenChange={setExpanded} title={label} mobilePresentation="sheet">{children}</ErpDialogShell></section>;
  return <section data-erp-component="mobile-summary">
    <div className="erp-mobile-summary-trigger"><span className="min-w-0 text-xs text-[var(--erp-color-text-secondary)]">{summary}</span><Button type="button" variant="ghost" size="sm" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}>{expanded ? "收起统计" : label}<ChevronDown className="h-4 w-4" /></Button></div>
    <div id={id} hidden={phone && !expanded || undefined}>{children}</div>
  </section>;
}
