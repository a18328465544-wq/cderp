import {useState, type ReactNode} from "react";
import {ChevronDown, MoreHorizontal, Trash2} from "lucide-react";
import {Button} from "@/src/components/ui";

/** One presentation row; its feature supplies the original RHF controllers. */
export function ErpMobileOrderLine({
  label,
  name,
  metadata,
  imageUrl,
  price,
  quantity,
  total,
  disabled,
  onMore,
  onRemove,
  onReplace,
  extra,
  expanded,
  onExpandedChange,
}: {
  label: string;
  name: string;
  metadata?: ReactNode;
  imageUrl?: string;
  price: ReactNode;
  quantity: ReactNode;
  total: ReactNode;
  disabled?: boolean;
  onMore?: () => void;
  onRemove: () => void;
  onReplace: () => void;
  extra?: ReactNode;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = expanded !== undefined ? expanded : internalExpanded;
  const toggleExpanded = () => {
    if (extra) {
      if (onExpandedChange) onExpandedChange(!isExpanded);
      else setInternalExpanded((prev) => !prev);
    }
    onMore?.();
  };

  return (
    <article data-erp-component="mobile-order-line" className="erp-mobile-order-line" aria-label={label}>
      <div className="erp-mobile-order-line-identity">
        {imageUrl && <img src={imageUrl} alt="" className="erp-phone-order-image" />}
        <div>
          <Button
            type="button"
            variant="ghost"
            className="erp-mobile-order-line-name"
            disabled={disabled}
            aria-label={`更换${label}`}
            onClick={onReplace}
          >
            <h3>{name}</h3>
          </Button>
          {metadata && <p>{metadata}</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="iconTouch"
          disabled={disabled}
          title="商品补充信息"
          aria-label={`${label}补充信息`}
          aria-expanded={extra ? isExpanded : undefined}
          onClick={toggleExpanded}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
      <div className="erp-mobile-order-line-editors">
        <label>
          单价{price}
        </label>
        <div>
          <span className="erp-mobile-order-field-label">数量</span>
          {quantity}
        </div>
      </div>
      <div className="erp-mobile-order-line-total">
        <span>
          小计 <strong className="erp-data-number">{total}</strong>
        </span>
        <div className="flex items-center gap-1">
          {extra && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={toggleExpanded}
              className="text-xs text-[var(--erp-color-text-secondary)]"
            >
              {isExpanded ? "收起" : "备注/明细"}
              <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={`删除${label}`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
            移除
          </Button>
        </div>
      </div>
      {extra && isExpanded && (
        <div className="erp-mobile-order-line-extra mt-2.5 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border-soft)] bg-[var(--erp-color-surface-muted)] p-2.5">
          {extra}
        </div>
      )}
    </article>
  );
}
