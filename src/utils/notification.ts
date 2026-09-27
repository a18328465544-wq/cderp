import {toast, type ExternalToast} from "sonner";

export type NotificationMessage = Parameters<typeof toast.success>[0];
export type NotificationOptions = ExternalToast;

/**
 * The only business-facing notification API. Sonner stays an implementation
 * detail so page code does not couple itself to a particular toast library.
 */
const baseNotify = (...args: Parameters<typeof toast>) => toast(...args);

/**
 * Callable default notification plus semantic methods. Most business code
 * should choose success/error/info explicitly, while the callable form keeps
 * the facade compatible with generic notification helpers.
 */
export const notify = Object.assign(baseNotify, {
  success: (...args: Parameters<typeof toast.success>) => toast.success(...args),
  error: (...args: Parameters<typeof toast.error>) => toast.error(...args),
  warning: (...args: Parameters<typeof toast.warning>) => toast.warning(...args),
  info: (...args: Parameters<typeof toast.info>) => toast.info(...args),
  message: (...args: Parameters<typeof toast.message>) => toast.message(...args),
  loading: (...args: Parameters<typeof toast.loading>) => toast.loading(...args),
  custom: (...args: Parameters<typeof toast.custom>) => toast.custom(...args),
  promise: (...args: Parameters<typeof toast.promise>) => toast.promise(...args),
  dismiss: (...args: Parameters<typeof toast.dismiss>) => toast.dismiss(...args),
});
