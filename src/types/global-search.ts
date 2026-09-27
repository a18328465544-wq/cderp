export const globalSearchResultKinds = [
  "product",
  "inventory",
  "inspection",
  "customer",
  "vendor",
  "purchase",
  "sales",
  "quote",
  "return",
  "order",
  "aftersales",
] as const;

export type GlobalSearchResultKind = typeof globalSearchResultKinds[number];

export interface GlobalSearchResult {
  id: string;
  kind: GlobalSearchResultKind;
  title: string;
  subtitle?: string;
  route: string;
  reference: string;
}

export interface GlobalSearchSnapshot {
  items: GlobalSearchResult[];
  query: string;
  total: number;
  truncated: boolean;
}
