/**
 * The service layer, for the desktop app. Counters run these same services
 * against their local PGlite database, so a sale, a stock receipt or a request
 * follows exactly the same rules offline as on the server.
 */
export type { ServiceContext } from "./context";
export { AppError } from "../http/errors";
export type { Actor } from "../auth/actor";
export { listBranches, listDiscounts, readSettings } from "./reference-service";
export { lookupProducts, searchProducts } from "./catalog-service";
export { listBatches, listInventory, listRestockSuggestions } from "./inventory-service";
export { getRequest, listRequests } from "./request-read-service";
export { getDashboard, getSale, listSales, exportSalesCsv } from "./report-service";
export { createSale, type SaleWriteOptions } from "./sale-service";
export { receiveStock } from "./stock-service";
export { createRequest } from "./request-service";
