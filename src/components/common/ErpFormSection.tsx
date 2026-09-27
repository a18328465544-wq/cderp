import type {ReactNode} from "react";
import {Card, CardContent, CardHeader} from "@/src/components/ui";

export function ErpFormSection({title, description, children}: {title: ReactNode; description?: ReactNode; children: ReactNode}) {
  return <Card><CardHeader><div><h2 className="text-erp-lg font-semibold">{title}</h2>{description ? <p className="erp-annotation-slot mt-1 text-xs text-[var(--erp-color-text-secondary)]">{description}</p> : null}</div></CardHeader><CardContent>{children}</CardContent></Card>;
}
