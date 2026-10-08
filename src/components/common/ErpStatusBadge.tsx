import {Badge, type BadgeTone} from "@/src/components/ui";
import type {ReactNode} from "react";

export function ErpStatusBadge({label, tone = "neutral", dot = true}: {label: ReactNode; tone?: BadgeTone; dot?: boolean}) {
  return <Badge tone={tone} dot={dot}>{label}</Badge>;
}
