import type {ReactNode} from "react";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";

/** A phone-only presentation slot. The feature still owns search, permissions,
 * mutation state and overlays; inactive keep-alive pages never expose a dock. */
export function ErpMobileActionDock({children, primaryAction, hidden = false, ariaLabel = "快捷操作"}: {
  children: ReactNode;
  primaryAction?: ReactNode;
  hidden?: boolean;
  ariaLabel?: string;
}) {
  const phone = useErpPhone();
  const {active} = useWorkspaceTabActivity();
  if (!phone || !active || hidden) return null;
  return <>
    <div data-erp-region="mobile-action-spacer" aria-hidden="true" />
    <section data-erp-component="mobile-action-dock" aria-label={ariaLabel}>
      {children}
      {primaryAction && <div data-erp-region="mobile-action-primary">{primaryAction}</div>}
    </section>
  </>;
}
