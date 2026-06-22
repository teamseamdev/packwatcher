import type { StockStatus } from "@/lib/types";

export type StockCheckInput = {
  id: string;
  url: string;
  storeName: string;
};

export type StockCheckResult = {
  status: StockStatus;
  price: number | null;
  rawMatchReason: string;
  checkedAt: string;
};

export type RetailerAdapter = {
  name: string;
  matches(url: string, storeName: string): boolean;
  check(input: StockCheckInput): Promise<StockCheckResult>;
};
