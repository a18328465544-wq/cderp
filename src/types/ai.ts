/** Server-computed daily sales facts and the optional plain-language narrative. */

export interface DailySalesPriceBreakdown {
  unitPrice: number;
  quantity: number;
  amount: number;
}

export interface DailySalesProductSummary {
  key: string;
  productName: string;
  model: string;
  quantity: number;
  pricedQuantity: number;
  unknownPriceQuantity: number;
  amount: number;
  averageUnitPrice?: number;
  priceBreakdown: DailySalesPriceBreakdown[];
  grossProfit?: number;
}

export interface DailySalesMetrics {
  productCount: number;
  quantity: number;
  pricedQuantity: number;
  amount: number;
  averageUnitPrice?: number;
  grossProfit?: number;
}

export interface DailySalesComparison {
  quantityDelta: number;
  quantityChangeRatio?: number;
  amountDelta: number;
  amountChangeRatio?: number;
  averageUnitPriceDelta?: number;
}

export interface DailySalesReturnProductSummary {
  productName: string;
  quantity: number;
  amount: number;
}

export interface DailySalesReturnSummary {
  orderCount: number;
  quantity: number;
  amount: number;
  products: DailySalesReturnProductSummary[];
}

export interface DailySalesSummary {
  date: string;
  cutoff: string;
  today: DailySalesMetrics;
  yesterday: DailySalesMetrics;
  comparison: DailySalesComparison;
  products: DailySalesProductSummary[];
  returns: DailySalesReturnSummary;
  pendingOutboundOrders: number;
  dataQualityIssues: string[];
}

export type DailySalesAiNarrativeSource = "ai" | "rules";

export interface DailySalesAiNarrative {
  source: DailySalesAiNarrativeSource;
  generatedAt: string;
  headline: string;
  comparison: string;
  attention: string[];
  model?: string;
}

export interface DailySalesSummaryResult {
  summary: DailySalesSummary;
  narrative: DailySalesAiNarrative;
}
