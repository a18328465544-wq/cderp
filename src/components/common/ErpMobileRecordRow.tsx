import type {ReactNode} from "react";
import {ChevronRight, ImageOff} from "lucide-react";
import {Button} from "@/src/components/ui";

/** Presentation for a domain-owned record. No queries, permissions or business calculations. */
export function ErpMobileRecordRow({title, subtitle, meta, amount, amountLabel, status, statusPlacement = "end", imageUrl, icon, onOpen}: {
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  amount?: ReactNode;
  amountLabel?: ReactNode;
  status?: ReactNode;
  statusPlacement?: "title" | "end";
  imageUrl?: string;
  icon?: ReactNode;
  onOpen?: () => void;
}) {
  const content = <>
    <span className="erp-phone-record-image">{imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : icon || <ImageOff className="h-5 w-5" aria-label="暂无商品图片" />}</span>
    <span className="erp-phone-record-body"><span className="erp-phone-record-heading"><span className="erp-phone-record-title">{title}</span>{statusPlacement === "title" && status}</span>{subtitle && <span className="erp-phone-record-subtitle">{subtitle}</span>}{meta && <span className="erp-phone-record-meta">{meta}</span>}</span>
    <span className="erp-phone-record-end">{statusPlacement === "end" && status}{amountLabel && <span className="erp-phone-record-amount-label">{amountLabel}</span>}{amount !== undefined && amount !== null && <span className="erp-data-number">{amount}</span>}{onOpen && <ChevronRight className="h-4 w-4" aria-hidden="true" />}</span>
  </>;
  return onOpen ? <Button type="button" variant="ghost" className="erp-phone-record" data-status-placement={statusPlacement} onClick={onOpen} aria-label={`查看 ${title}`}>{content}</Button> : <div className="erp-phone-record" data-status-placement={statusPlacement}>{content}</div>;
}
