import {Toaster} from "sonner";

/** One visual host for all application notifications. */
export function NotificationToaster() {
  return <Toaster position="top-right" richColors closeButton visibleToasts={4} expand={false} />;
}
