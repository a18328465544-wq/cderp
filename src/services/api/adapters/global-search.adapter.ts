import {globalSearchResultKinds, type GlobalSearchResult, type GlobalSearchSnapshot} from "@/src/types/global-search";
import type {GlobalSearchResponseDto} from "../dto/global-search.dto";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim();
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const knownRoutes = new Set([
  "/products",
  "/inventory",
  "/inspections",
  "/crm/customers",
  "/crm/vendors",
  "/purchase",
  "/sales",
  "/quotes",
  "/purchase/returns",
  "/sales/returns",
  "/order-pool",
  "/aftersales",
]);

function adaptItem(value: unknown): GlobalSearchResult | null {
  const dto = record(value);
  const id = text(dto.id);
  const kind = text(dto.kind);
  const route = text(dto.route);
  const title = text(dto.title);
  const subtitle = text(dto.subtitle);
  const reference = text(dto.reference) || id;
  if (!id || !title || !globalSearchResultKinds.includes(kind as typeof globalSearchResultKinds[number]) || !knownRoutes.has(route)) return null;
  return {id, kind: kind as GlobalSearchResult["kind"], title, ...(subtitle ? {subtitle} : {}), route, reference};
}

export function adaptGlobalSearch(response: GlobalSearchResponseDto): GlobalSearchSnapshot {
  const data = record(response.data);
  const meta = record(response.meta);
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items = rawItems.map(adaptItem).filter((item): item is GlobalSearchResult => Boolean(item));
  return {items, query: text(meta.query), total: Math.max(0, numberValue(meta.total, items.length)), truncated: meta.truncated === true};
}
