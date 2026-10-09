import {ErpMobileRecordRow} from "@/src/components/common/ErpMobileRecordRow";
import {ErpEntityThumbnail} from "@/src/components/common/ErpEntityThumbnail";
import {InventoryStatus} from "@/src/components/domain";
import {formatCurrency} from "@/src/lib/format";
import type {InventoryListItem} from "@/src/types/inventory";

/** A presentation of the same fields used by the desktop inventory columns.
 * Missing prices stay missing; a zero price must not fall back to another price. */
export function InventoryMobileRecord({item, onOpen}: {item: InventoryListItem; onOpen: () => void}) {
  const sold = item.inventoryStatus === "已售出";
  const price = sold ? item.salesPrice : item.estimatedSellPrice;
  return <ErpMobileRecordRow title={item.productName} imageUrl={item.imageUrl}
    thumbnail={<ErpEntityThumbnail name={item.productName} category={item.category} imageUrl={item.imageUrl} />}
    statusPlacement="title"
    subtitle={<span className="erp-inventory-phone-subtitle"><InventoryStatus status={item.inventoryStatus} /><span>{[item.category, item.vram, item.condition].filter(Boolean).join(" · ")}</span></span>}
    meta={<><span className="erp-inventory-phone-sn">SN {item.serialNumber || "待录入"}</span><span className="erp-inventory-phone-location">{item.warehouse || "未设置库位"}<span>库龄 {item.inventoryDays} 天</span></span></>}
    amountLabel={sold ? "成交价" : "预计售价"} amount={price === undefined ? "未设置" : formatCurrency(price)}
    onOpen={onOpen} />;
}
