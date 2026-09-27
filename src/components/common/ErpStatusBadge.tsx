import {Badge, type BadgeTone} from "@/src/components/ui";
import type {ReactNode} from "react";

export function ErpStatusBadge({label, tone = "neutral"}: {label: ReactNode; tone?: BadgeTone}) {
  return <Badge tone={tone}>{label}</Badge>;
}
