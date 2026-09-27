import {cn} from "@/src/lib/cn";

export function Separator({className}: {className?: string}) {
  return <div aria-hidden="true" className={cn("h-px w-full bg-[var(--erp-color-border)]", className)} />;
}
