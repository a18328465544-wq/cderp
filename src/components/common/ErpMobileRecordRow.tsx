import type {ReactNode} from "react";
import {ChevronRight} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpEntityThumbnail} from "./ErpEntityThumbnail";

/** Presentation for a domain-owned record. No queries, permissions or business calculations. */
export function ErpMobileRecordRow({title, subtitle, meta, amount, amountLabel, status, statusPlacement = "end", imageUrl, icon, thumbnail, onOpen}: {
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  amount?: ReactNode;
  amountLabel?: ReactNode;
  status?: ReactNode;
  statusPlacement?: "title" | "end";
  imageUrl?: string;
  icon?: ReactNode;
  thumbnail?: ReactNode;
  onOpen?: () => void;
}) {
  const content = <>
    <span className="erp-phone-record-image">{thumbnail || <ErpEntityThumbnail name={title} imageUrl={imageUrl} fallbackIcon={icon} />}</span>
    <span className="erp-phone-record-body"><span className="erp-phone-record-heading"><span className="erp-phone-record-title">{title}</span>{statusPlacement === "title" && status}</span>{subtitle && <span className="erp-phone-record-subtitle">{subtitle}</span>}{meta && <span className="erp-phone-record-meta">{meta}</span>}</span>
    <span className="erp-phone-record-end">{statusPlacement === "end" && status}{amountLabel && <span className="erp-phone-record-amount-label">{amountLabel}</span>}{amount !== undefined && amount !== null && <span className="erp-data-number">{amount}</span>}{onOpen && <ChevronRight className="h-4 w-4" aria-hidden="true" />}</span>
  </>;
  return onOpen ? <Button type="button" variant="ghost" className="erp-phone-record" data-erp-component="mobile-record" data-status-placement={statusPlacement} onClick={onOpen} aria-label={`查看 ${title}`}>{content}</Button> : <div className="erp-phone-record" data-erp-component="mobile-record" data-status-placement={statusPlacement}>{content}</div>;
}
