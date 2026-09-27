import type {ImgHTMLAttributes} from "react";
import {cn} from "@/src/lib/cn";

export function Avatar({className, ...props}: ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...props} className={cn("h-9 w-9 rounded-full border border-[var(--erp-color-border)] object-cover", className)} />;
}
