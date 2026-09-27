export const WORKSPACE_KEEP_ALIVE_ENTRIES = [
  {key: "sales-create", pathname: "/sales/new", tabId: "sales_add"},
  {key: "purchase-create", pathname: "/purchase/new", tabId: "purchase_add"},
  {key: "purchase-return-create", pathname: "/purchase/returns/new", tabId: "return_purchase"},
  {key: "sales-return-create", pathname: "/sales/returns/new", tabId: "return_sales"},
  {key: "assembly", pathname: "/assembly", tabId: "assembly"},
] as const;

export type WorkspaceKeepAliveKey = (typeof WORKSPACE_KEEP_ALIVE_ENTRIES)[number]["key"];
