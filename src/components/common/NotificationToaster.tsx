import {Toaster} from "sonner";
import {useErpPhone} from "@/src/hooks/useErpViewport";

/** One visual host for all application notifications. */
export function NotificationToaster() {
  const phone = useErpPhone();
  return <Toaster position={phone ? "bottom-center" : "top-right"} mobileOffset={{bottom: "calc(var(--erp-mobile-nav-height) + var(--erp-mobile-action-height) + env(safe-area-inset-bottom) + var(--erp-space-3))"}} richColors closeButton visibleToasts={phone ? 1 : 4} expand={false} />;
}
