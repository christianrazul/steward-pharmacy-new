/**
 * Stock status of a product at a branch, in the order the rules are checked:
 * out of stock, then low stock, then expiring, then in stock. "not_carried"
 * means the branch has never had a batch of the product.
 * The function that computes it arrives with the stock rules in Milestone 3.
 */
export const STOCK_STATUSES = [
  "out_of_stock",
  "low_stock",
  "expiring",
  "in_stock",
  "not_carried",
] as const;

export type StockStatus = (typeof STOCK_STATUSES)[number];
