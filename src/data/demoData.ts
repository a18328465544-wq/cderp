/**
 * Compatibility barrel for the server bootstrap and tests.
 *
 * Demo fixtures live under src/data/demo by business domain. Keep this
 * stable export surface so callers do not need to know the storage layout.
 */
export {initialProducts} from "./demo/products";
export {initialInventory} from "./demo/inventory";
export {initialInspections} from "./demo/inspections";
export {initialPurchaseInvoices} from "./demo/purchases";
export {initialSalesInvoices} from "./demo/sales";
export {initialMarketQuotes} from "./demo/marketQuotes";
export {initialAftersales} from "./demo/aftersales";
export {initialCustomers} from "./demo/customers";
export {initialCrmFollowUps, initialCrmRequirements, initialCrmQuotes} from "./demo/crm";
export {initialVendors} from "./demo/vendors";
export {initialLogs} from "./demo/auditLogs";
