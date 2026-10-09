import {useState, type ReactNode} from "react";
import {CircuitBoard, Computer, Cpu, Fan, HardDrive, MemoryStick, Monitor, Package, PcCase, PlugZap, Wrench} from "lucide-react";
import {cn} from "@/src/lib/cn";

const categoryIcons = {"显卡": CircuitBoard, "CPU": Cpu, "主板": CircuitBoard, "内存": MemoryStick, "硬盘": HardDrive, "电源": PlugZap, "散热": Fan, "机箱": PcCase, "整机": Computer, "显示器": Monitor, "组装拆卸": Wrench, "其他配件": Package};
const avatarTones = ["blue", "green", "amber", "neutral"] as const;

/** Name-derived decoration only: it never represents a customer's grade or risk. */
export function customerAvatarIdentity(name: string) {
  const text = name.trim().normalize("NFC");
  const characters = Array.from(text);
  const initial = /^[a-z\d]/i.test(text) ? characters.slice(0, 2).join("").toUpperCase() : characters[0] || "客";
  const hash = characters.reduce((value, character) => (value * 31 + character.codePointAt(0)!) >>> 0, 0);
  return {initial, tone: avatarTones[hash % avatarTones.length]};
}

/** Real images or honest visual fallbacks; no queries, invented photos or business state. */
export function ErpEntityThumbnail({name = "", kind = "product", category, imageUrl, fallbackIcon, className}: {name?: string; kind?: "customer" | "product"; category?: string; imageUrl?: string; fallbackIcon?: ReactNode; className?: string}) {
  const [failedImage, setFailedImage] = useState<string>();
  const avatar = customerAvatarIdentity(name);
  const Icon = categoryIcons[category as keyof typeof categoryIcons] || Package;
  const showImage = Boolean(imageUrl && failedImage !== imageUrl);
  return <span className={cn("erp-entity-thumbnail", className)} data-erp-component="entity-thumbnail" data-kind={kind} data-avatar-tone={kind === "customer" ? avatar.tone : undefined} data-has-image={showImage || undefined} role="img" aria-label={kind === "customer" ? `${name || "客户"}的姓名头像` : showImage ? `${name || "商品"}图片` : `暂无商品图片${category ? ` · ${category}` : ""}`}>
    {showImage ? <img src={imageUrl} alt="" loading="lazy" onError={() => setFailedImage(imageUrl)} /> : kind === "customer" ? <span aria-hidden="true">{avatar.initial}</span> : fallbackIcon || <Icon aria-hidden="true" />}
  </span>;
}
