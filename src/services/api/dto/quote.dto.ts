export interface MarketQuoteSnapshotResponseDto {
  data?: unknown;
  state?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
}

export interface MarketQuoteCreateRequestDto {
  model: string;
  brand: string;
  refBuyPrice: number;
  refSellPrice: number;
  trend: "up" | "down" | "stable";
  fluctuation?: string;
  updateTime: string;
}

export interface MarketQuoteUpdateRequestDto {
  todayBuyPrice: number;
  todaySellPrice: number;
  remarks?: string;
}

export interface MarketQuoteImportRequestDto {
  quotes: MarketQuoteCreateRequestDto[];
}
