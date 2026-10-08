import express from "express";
import compression from "compression";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { acquireAuthWriteLock, acquireStateWriteLock, createDatabaseSessionStore, dataFilePath, findActiveTenantMembership, findSystemUserById, findSystemUserByUsername, getAccountingEvent, getStateRevision, isAccountingPeriodClosed, listAccountingEvents, listAccountingReversalDocuments, listFinanceIntegrityAlerts, loadState, loadStateCollections, saveState, saveStateCollections, saveStateRecords, syncFinanceIntegrityAlertsInTransaction } from "./db.ts";
import type { StateCollectionKey } from "./db.ts";
import { createInitialState, createStoreActions, type AppState, type StoreActionContext } from "./store.ts";
import { notifyFeishuMarketQuotePriceChanged, notifyFeishuSalesInvoiceCreated } from "./feishu.ts";
import { createSessionManager } from "./security.ts";
import { createRequireAuth, createRequireCsrf, createRequireOpenApiToken } from "./httpAuth.ts";
import { AppError, ConflictError, toDomainError, UnauthorizedError } from "./errors.ts";
import {
  getPermissionsForUser as getScopedPermissions,
  publicCollectionForUser as getPublicCollection,
  publicStateForUser as getPublicState,
  type PublicStateMode,
} from "./publicState.ts";
import {
  getPersistenceKeysForRequest,
  getAuthenticationReloadKeys,
  getReloadKeysForRequest,
  getStatePatchKeysForRequest,
  INITIAL_STATE_RELOAD_KEYS,
  shouldAttachFreshStateToResponse,
  shouldReloadStateFromDatabase,
  AI_INSIGHT_STATE_KEYS,
  AI_DAILY_SALES_STATE_KEYS,
} from "./requestStatePolicy.ts";
import { statePatchResponse, type StateDeletePatch, type StateMergePatch } from "./statePatch.ts";
import type {StateCommandTransactionHook} from "./stateCommand.ts";
import { storeDate, storeDateDiffDays } from "../src/utils/storeTime.ts";
import { addDateDays, startOfMonth } from "../src/lib/dateRangePickerUtils.ts";
import { matchesKeyword } from "../src/utils/search.ts";
import { upsertCrmCustomerAccount } from "./crmAccountRepository.ts";
import { createSerializedMutationRunner, isMutationAbortedError } from "./mutationQueue.ts";
import { createAuthMutationRunner } from "./authMutation.ts";
import { requiresStateSerialization } from "./mutationPolicy.ts";
import { createRequestMetrics, redactRequestPath, safeErrorMessage, safeErrorStack } from "./observability.ts";
import { QuickCaptureValidationError } from "./crmQuickCapture.ts";
import { registerMasterDataRoutes } from "./routes/masterData.ts";
import { registerPurchaseReadRoutes } from "./routes/purchaseRead.ts";
import { registerOperationalReadRoutes } from "./routes/operationalReads.ts";
import { registerGlobalSearchRoutes } from "./routes/globalSearch.ts";
import { registerFinanceClosingRoutes } from "./routes/financeClosing.ts";
import {registerPagedRecordRoutes} from "./routes/pagedRecords.ts";
import { registerSystemRoutes } from "./routes/system.ts";
import { registerFinanceCommissionRoutes } from "./routes/financeCommissions.ts";
import { MediaValidationError, replaceEntityImages } from "./mediaRepository.ts";
import {clearSessionCookie, createCsrfToken, setSessionCookie} from "./authCookies.ts";
import {assertStateRuntimeMode} from "./runtimeConfig.ts";
import {registerInventoryJourneyRoutes} from "./routes/inventoryJourney.ts";
import { registerSalesProductCandidateRoutes } from "./routes/salesProductCandidates.ts";
import { registerSalesCustomerRoutes } from "./routes/salesCustomers.ts";
import {registerSalesOutboundRoutes} from "./routes/salesOutbound.ts";
import {registerCustomerDirectoryRoutes} from "./routes/customerDirectory.ts";
import { registerProductLedgerRoutes } from "./routes/productLedger.ts";
import { registerMarketQuoteRoutes } from "./routes/marketQuotes.ts";
import { registerCommercialRoutes } from "./routes/commercial.ts";
import { registerAiDailySalesRoutes } from "./routes/aiDailySales.ts";
import { registerBackupRoutes } from "./routes/backup.ts";
import { registerStateRevisionRoute, registerStateRoutes } from "./routes/state.ts";
import { registerFinanceReadModelRoutes } from "./routes/financeReadModels.ts";
import { registerFinanceAccountingControlRoutes } from "./routes/financeAccountingControls.ts";
import { registerFinanceAccountRoutes } from "./routes/financeAccounts.ts";
import { registerFinancePaymentRoutes } from "./routes/financePayments.ts";
import {
  accountTransferMerge as buildAccountTransferMerge,
  paymentInMerge as buildPaymentInMerge,
  paymentOutMerge as buildPaymentOutMerge,
} from "./financeStateMerges.ts";
import {
  productTemplateMerge as buildProductTemplateMerge,
  sanitizeInventoryRowsForUser as buildSanitizedInventoryRows,
} from "./productStateMerges.ts";
import {
  deleteStateMerge as buildDeleteStateMerge,
  simpleRecordCreateMerge as buildSimpleRecordCreateMerge,
  vendorRecordMerge as buildVendorRecordMerge,
} from "./partnerStateMerges.ts";
import { registerProductMutationRoutes } from "./routes/productMutations.ts";
import { registerMediaRoutes } from "./routes/media.ts";
import { registerPartnerMutationRoutes } from "./routes/partnerMutations.ts";
import { registerCrmReadModelRoutes } from "./routes/crmReadModels.ts";
import { registerCrmMutationRoutes } from "./routes/crmMutations.ts";
import { registerCrmNormalizedReadRoutes } from "./routes/crmNormalizedReads.ts";
import { registerAiRoutes } from "./routes/aiRoutes.ts";
import { registerPurchaseMutationRoutes } from "./routes/purchaseMutations.ts";
import { registerSalesMutationRoutes } from "./routes/salesMutations.ts";
import { registerReturnMutationRoutes } from "./routes/returnMutations.ts";
import { registerAftersalesMutationRoutes } from "./routes/aftersalesMutations.ts";
import { registerMarketQuoteMutationRoutes } from "./routes/marketQuoteMutations.ts";
import { registerInspectionMutationRoutes } from "./routes/inspectionMutations.ts";
import { registerAssemblyMutationRoutes } from "./routes/assemblyMutations.ts";
import { registerInventoryMutationRoutes } from "./routes/inventoryMutations.ts";
import { registerLogRoutes } from "./routes/logs.ts";
import { registerFinanceLedgerMutationRoutes } from "./routes/financeLedgerMutations.ts";
import { registerUserManagementRoutes } from "./routes/userManagement.ts";
import { registerCrmQuickCaptureRoutes } from "./routes/crmQuickCaptureRoutes.ts";
import { registerOrderPoolRoutes } from "./routes/orderPool.ts";
import { registerOpenApiRoutes } from "./routes/openApi.ts";
import { registerLoginRoute, registerLogoutRoute, registerResetRoute } from "./routes/auth.ts";
import { CommercialValidationError, assertCommercialTenantActive, assertSeatAvailable, claimIdempotencyKey, completeIdempotencyKeyInTransaction, commercialFeatureEnabled, estimateAiUsageUnits, hashIdempotencyPayload, recordCommercialUsage, releaseIdempotencyKey, releaseInventoryReservationsInTransaction, reserveSalesOutboundInventoryInTransaction, upsertCommercialMembershipInTransaction } from "./commercialRepository.ts";
import { createStateProxy, getCurrentState, getFallbackState, replaceCurrentState, runTenantContext } from "./requestTenantContext.ts";
import { DEFAULT_STORE_ID, DEFAULT_TENANT_ID } from "./commercialConstants.ts";
import type {
  ProductTemplate,
  SystemUserAccount,
} from "../src/types.ts";
const PORT = Number(process.env.API_PORT || process.env.PORT || 3001);
const LOGIN_RATE_LIMIT_WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const LOGIN_RATE_LIMIT_MAX = Number(process.env.LOGIN_RATE_LIMIT_MAX || 8);
const OPEN_API_TOKEN = process.env.OPEN_API_TOKEN || "";
const OPEN_API_RATE_LIMIT_WINDOW_MS = Number(process.env.OPEN_API_RATE_LIMIT_WINDOW_MS || 60 * 1000);
const OPEN_API_RATE_LIMIT_MAX = Number(process.env.OPEN_API_RATE_LIMIT_MAX || 240);
export const app = express();
const requestMetrics = createRequestMetrics();
app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use(helmet());
// Generate the request id before parsers or route handlers so even malformed/oversized payloads
// can be correlated with a structured error response.
app.use(requestContext);
app.use(requestMetrics.middleware);
// State snapshots and analytics payloads can grow with inventory and invoice
// history. Compress only responses large enough to benefit; compression
// handles content negotiation and skips downloads/already encoded responses.
app.use(compression({threshold: 1024}));
app.use(express.json({ limit: "2mb" }));
app.use((req, _res, next) => {
  // Liveness must remain useful while PostgreSQL is unavailable. Authenticated and
  // business routes still initialize state before reaching their handlers.
  if (req.path === "/api/health" || req.path === "/api/ready") {
    next();
    return;
  }
  void ensureStateReady().then(() => next()).catch(next);
});
const loginRateLimiter = rateLimit({
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  limit: LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => sendApiError(req, res, 429, "LOGIN_RATE_LIMITED", "登录尝试过多，请稍后再试。", true),
});
const openApiRateLimiter = rateLimit({
  windowMs: OPEN_API_RATE_LIMIT_WINDOW_MS,
  limit: OPEN_API_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => sendApiError(req, res, 429, "OPEN_API_RATE_LIMITED", "开放接口请求过于频繁，请稍后再试。", true),
});
// Keep module import side-effect free with respect to PostgreSQL. The first request initializes
// the state, which keeps HTTP tests and app composition independent from a database connection
// at import time.
const state = createStateProxy<AppState>();
let stateRevision = 0;
let stateReady: Promise<void> | undefined;
const sessions = createSessionManager(createDatabaseSessionStore(), {cleanupIntervalMs: Number(process.env.SESSION_CLEANUP_INTERVAL_MS || 15 * 60 * 1_000)});
type AuthRequest = express.Request & {
  authToken?: string;
  authMode?: "bearer" | "cookie";
  authUser?: SystemUserAccount;
  requestId?: string;
  requestStartedAt?: number;
  tenantId?: string;
  storeId?: string;
};
async function ensureStateReady() {
  if (!stateReady) {
    stateReady = (async () => {
      if (process.env.NODE_ENV === "production") assertStateRuntimeMode();
      replaceCurrentState(await loadState());
      stateRevision = await getStateRevision();
    })().catch((error) => {
      stateReady = undefined;
      throw error;
    });
  }
  await stateReady;
}
const runSerializedStateMutation = createSerializedMutationRunner(
  acquireStateWriteLock,
  async () => {
    await reloadStateFromDatabase();
  },
);
const runSerializedAuthMutation = createAuthMutationRunner(
  acquireAuthWriteLock,
  async () => {
    await reloadStateFromDatabase();
  },
);
function createMutationRequestSignal(req: express.Request, res: express.Response) {
  const controller = new AbortController();
  let responseFinished = false;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    req.off("aborted", abort);
    res.off("finish", finished);
    res.off("close", closed);
  };
  const abort = () => {
    if (!responseFinished) controller.abort();
  };
  const finished = () => {
    responseFinished = true;
    dispose();
  };
  const closed = () => {
    abort();
    dispose();
  };
  req.once("aborted", abort);
  res.once("finish", finished);
  res.once("close", closed);
  if (req.aborted || res.destroyed) controller.abort();

  return { signal: controller.signal, dispose };
}

async function withStateMutation<T>(req: AuthRequest | undefined, res: express.Response | undefined, operation: () => T | PromiseLike<T>) {
  const requestSignal = req && res ? createMutationRequestSignal(req, res) : undefined;
  try {
    return await runSerializedStateMutation(async () => {
      // The request-level reload middleware deliberately runs outside this lock. Reload again
      // here so every mutation calculates from the committed snapshot it actually owns.
      // Legacy commands cross several aggregates (including returns/inspection
      // guards). Keep their complete snapshot inside the lock, loaded once;
      // authentication no longer preloads it outside the consistency boundary.
      await reloadStateFromDatabase();
      if (req?.authUser) {
        const freshUser = await applyAuthenticatedUser(req.authUser.id, { tenantId: req.tenantId });
        if (!freshUser) {
          await sessions.revoke(req.authToken);
          throw new UnauthorizedError("账号已停用或不存在");
        }
        req.authUser = freshUser;
      }
      await assertAccountingPeriodOpen(req);
      return operation();
    }, { signal: requestSignal?.signal });
  } finally {
    requestSignal?.dispose();
  }
}

const ACCOUNTING_MUTATION_PATHS = [
  /^\/api\/gpu_erp\/finance\//,
  /^\/api\/purchase-invoices(?:\/|$)/,
  /^\/api\/sales-invoices(?:\/|$)/,
  /^\/api\/returns(?:\/|$)/,
  /^\/api\/aftersales(?:\/|$)/,
  /^\/api\/finance\/commissions\/settle$/,
];

function isAccountingMutationRequest(req: AuthRequest) {
  const path = req.path.replace(/\/$/, "") || "/";
  if (/^\/api\/finance\/accounting-periods\//.test(path)) return false;
  return ACCOUNTING_MUTATION_PATHS.some((pattern) => pattern.test(path));
}

function firstBusinessDate(value: unknown) {
  if (typeof value !== "string") return undefined;
  const date = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

function requestBusinessDate(req: AuthRequest) {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
  for (const key of ["date", "time", "businessDate", "paymentDate", "returnDate", "completedAt"]) {
    const date = firstBusinessDate(body[key]);
    if (date) return date;
  }

  const id = typeof req.params?.id === "string" ? req.params.id : undefined;
  if (id) {
    const currentState = getCurrentState<AppState>() || state;
    const collections = [
      currentState.purchaseInvoices,
      currentState.salesInvoices,
      currentState.returnOrders,
      currentState.aftersales,
      currentState.paymentInRecords,
      currentState.paymentOutRecords,
      currentState.accountTransfers,
      currentState.financeLedger,
      currentState.settlementLedger,
    ] as unknown as Array<Array<Record<string, unknown>>>;
    for (const records of collections) {
      const record = records.find((item) => item.id === id || item.invoiceNo === id || item.returnNo === id);
      if (!record) continue;
      for (const key of ["date", "time", "businessDate", "paymentDate", "returnDate", "completedAt"]) {
        const date = firstBusinessDate(record[key]);
        if (date) return date;
      }
    }
  }
  return storeDate();
}

async function assertAccountingPeriodOpen(req?: AuthRequest) {
  if (!req || !isAccountingMutationRequest(req)) return;
  const date = requestBusinessDate(req);
  if (await isAccountingPeriodClosed(date, req.tenantId, req.storeId)) {
    throw new ConflictError(`会计期间 ${date.slice(0, 7)} 已结账，不能修改账务数据；请先重开期间或通过冲销/红字更正处理`);
  }
}

async function withAuthMutation<T>(req: AuthRequest, res: express.Response, operation: () => T | PromiseLike<T>) {
  const requestSignal = createMutationRequestSignal(req, res);
  try {
    return await runSerializedAuthMutation(async () => {
      // Login/logout only need these two collections. Refresh them while holding the
      // auth lock so two processes cannot calculate audit/account writes from stale rows.
      const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
      // A tenant member may share a username with another tenant.  The optional
      // tenantId is therefore used only as a lookup scope; it never grants access
      // by itself because the session still requires an active membership below.
      const requestedTenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId.trim() : undefined;
      const candidate = username ? await findSystemUserByUsername(username, requestedTenantId) : null;
      const tenantId = requestedTenantId || candidate?.tenantId || req.tenantId || DEFAULT_TENANT_ID;
      const storeId = candidate?.storeId || req.storeId || DEFAULT_STORE_ID;
      const baseState = getFallbackState<AppState>() || state;
      const authState = tenantId === DEFAULT_TENANT_ID
        ? await loadStateCollections(baseState, ["systemUsers", "logs"], tenantId, storeId)
        : await loadState(tenantId, storeId);
      return runTenantContext({ tenantId, storeId, state: authState }, operation);
    }, { signal: requestSignal.signal });
  } finally {
    requestSignal.dispose();
  }
}

function normalizeRequestId(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(candidate)
    ? candidate
    : randomUUID();
}

function requestContext(req: express.Request, res: express.Response, next: express.NextFunction) {
  const requestId = normalizeRequestId(req.headers["x-request-id"]);
  const authRequest = req as AuthRequest;
  authRequest.requestId = requestId;
  authRequest.requestStartedAt = Date.now();
  res.setHeader("X-Request-Id", requestId);
  next();
}

function requestIdFor(req: express.Request) {
  return (req as AuthRequest).requestId || randomUUID();
}

function logRequestError(req: express.Request, error: unknown, code: string) {
  const cause = error && typeof error === "object" && "cause" in error
    ? (error as {cause?: unknown}).cause
    : undefined;
  const stack = safeErrorStack(error);
  const causeStack = safeErrorStack(cause);
  console.error(JSON.stringify({
    event: "api_error",
    requestId: requestIdFor(req),
    method: req.method,
    path: redactRequestPath(req.originalUrl || req.url),
    userId: (req as AuthRequest).authUser?.id || null,
    username: (req as AuthRequest).authUser?.username || null,
    durationMs: Math.max(0, Date.now() - ((req as AuthRequest).requestStartedAt || Date.now())),
    name: error instanceof Error ? error.name : "UnknownError",
    code,
    message: safeErrorMessage(error),
    ...(stack ? {stack} : {}),
    ...(cause instanceof Error ? {causeName: cause.name, causeMessage: safeErrorMessage(cause)} : {}),
    ...(causeStack ? {causeStack} : {}),
  }));
}

function logSecurityDenial(req: express.Request, details: { status: number; code: string }) {
  console.warn(JSON.stringify({
    event: "security_denied",
    requestId: requestIdFor(req),
    method: req.method,
    path: redactRequestPath(req.originalUrl || req.url),
    userId: (req as AuthRequest).authUser?.id || null,
    username: (req as AuthRequest).authUser?.username || null,
    status: details.status,
    code: details.code,
  }));
}

function sendApiError(
  req: express.Request,
  res: express.Response,
  status: number,
  code: string,
  message: string,
  audit = false,
) {
  if (audit) logSecurityDenial(req, { status, code });
  res.status(status).json({ error: { code, message, requestId: requestIdFor(req) } });
}

function isPublicApiPath(pathname: string) {
  return pathname === "/api/health"
    || pathname === "/api/ready"
    || /^\/api\/auth\/login\/?$/.test(pathname)
    || pathname.startsWith("/api/open/");
}

// Authentication is applied before every private API route. Public health/login/open routes
// opt out explicitly, while open routes still enforce their own token middleware below.
function requireApiAuthentication(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.path.startsWith("/api/") || isPublicApiPath(req.path)) {
    next();
    return;
  }
  requireAuth(req as AuthRequest, res, () => {
    const authRequest = req as AuthRequest;
    const tenantId = authRequest.tenantId || authRequest.authUser?.tenantId || DEFAULT_TENANT_ID;
    const storeId = authRequest.storeId || authRequest.authUser?.storeId || DEFAULT_STORE_ID;
    // Keep the resolved scope on the request as well as in AsyncLocalStorage.
    // Read-model routes (including global search) consume these fields directly;
    // older sessions may not have scope columns populated yet, so leaving them
    // undefined would make an otherwise valid authenticated search return no data.
    authRequest.tenantId = tenantId;
    authRequest.storeId = storeId;
    const keys = getAuthenticationReloadKeys(req.method, req.path, req.path === "/api/state" && req.query.mode === "initial");
    void assertCommercialTenantActive(tenantId)
      .then(() => keys === null
        ? loadState(tenantId, storeId)
        : loadStateCollections(createInitialState({includeDemoData: false}), keys, tenantId, storeId))
      .then((tenantState) => runTenantContext({ tenantId, storeId, state: tenantState }, next))
      .catch(next);
  });
}

app.use(requireApiAuthentication);
app.use(createRequireCsrf({onDenied: logSecurityDenial}));

function actions(req?: AuthRequest, context?: StoreActionContext) {
  // `state` is a request-aware Proxy kept for legacy action callers. Pass the
  // concrete tenant snapshot into action factories so snapshot/clone operations
  // (for example return completion rollback) never receive a Proxy.
  const actionState = getCurrentState<AppState>() || state;
  const storeActions = createStoreActions(
    actionState,
    req?.authUser ? {
      userId: req.authUser.id,
      role: req.authUser.role,
      tenantId: req.tenantId || req.authUser.tenantId,
      storeId: req.storeId || req.authUser.storeId,
      requestId: req.requestId,
    } : context,
  );
  return new Proxy(storeActions, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        try {
          return Reflect.apply(value, target, args);
        } catch (error) {
          throw toDomainError(error);
        }
      };
    },
  });
}

async function persist<T>(result: T, keys?: StateCollectionKey[] | null) {
  if (keys?.length) {
    await saveStateCollections(state, keys);
    return result;
  } else {
    await saveState(state);
  }
  replaceCurrentState(await loadState());
  return result;
}

async function persistRequest<T>(req: AuthRequest, result: T) {
  return persist(result, getPersistenceKeysForRequest(req.method, req.path));
}

async function persistUserWithMembership(req: AuthRequest, user: SystemUserAccount) {
  // Store the canonical in-memory record rather than the sanitized response.
  // `createUser`/`updateUser` intentionally strip the password from their return
  // value; persisting that response would silently erase the credential and make
  // the next login fail.  The membership transaction still receives the safe
  // projection below, while the state record retains the hashed password.
  const persistedUser = state.systemUsers.find((item) => item.id === user.id) || user;
  await saveStateRecords(
    [
      { key: "systemUsers", items: [persistedUser] },
      { key: "logs", items: state.logs.slice(0, 1) },
    ],
    (client) => upsertCommercialMembershipInTransaction(client, {
      tenantId: user.tenantId,
      userId: user.id,
      storeId: user.storeId,
      role: user.role,
      status: user.enabled ? "active" : "deactivated",
      permissions: user.permissionOverrides as Record<string, unknown> | undefined,
      invitedBy: req.authUser?.id,
    }),
    req.tenantId,
  );
  return user;
}

async function reloadStateFromDatabase() {
  replaceCurrentState(await loadState());
  stateRevision = await getStateRevision();
}

async function reloadRequestStateFromDatabase(req: AuthRequest) {
  // The client deliberately requests `mode=initial` during login, focus and background sync.
  // Do not turn that lightweight response into a full database read by loading audit/ledger
  // histories first; those collections have their own on-demand endpoints.
  if (req.path === "/api/state" && req.query.mode === "initial") {
    replaceCurrentState(await loadStateCollections(state, INITIAL_STATE_RELOAD_KEYS));
    stateRevision = await getStateRevision();
    return;
  }
  const keys = getReloadKeysForRequest(req.method, req.path);
  // PostgreSQL-backed list endpoints return an empty key list because they
  // query their read model directly. Their request tenant state was already
  // loaded by authentication; replacing it with the shared state proxy here
  // would create a self-referencing proxy and overflow on the next read.
  if (keys === null) replaceCurrentState(await loadState());
  else if (keys.length) replaceCurrentState(await loadStateCollections(state, keys));
  stateRevision = await getStateRevision();
}

function getPermissionsForUser(user?: SystemUserAccount) {
  return getScopedPermissions(state, user);
}

function ok(data: unknown = null, user?: SystemUserAccount, mode: PublicStateMode = "full") {
  return user ? { data, state: getPublicState(state, user, mode) } : { data };
}

function publicState(req?: AuthRequest, mode: PublicStateMode = "full") {
  return getPublicState(state, req?.authUser, mode);
}

function publicCollectionForUser(key: StateCollectionKey, user?: SystemUserAccount) {
  return getPublicCollection(state, key, user);
}

function publicStatePatch(req: AuthRequest, keys: StateCollectionKey[]) {
  return Object.fromEntries(
    Array.from(new Set(keys))
      .map((key) => [key, publicCollectionForUser(key, req.authUser)])
      .filter(([, value]) => value !== undefined),
  );
}

function okMerge(data: unknown, stateMerge: StateMergePatch, stateDelete: StateDeletePatch = {}) {
  return statePatchResponse(data, stateMerge, stateDelete);
}

type IdempotencyContext = {
  request: {
    tenantId: string;
    route: string;
    key: string;
    requestHash: string;
  };
  replay?: {statusCode: number; response: unknown};
};

function idempotencyContext(req: AuthRequest): IdempotencyContext | null {
  const raw = req.headers["idempotency-key"];
  const key = String(Array.isArray(raw) ? raw[0] || "" : raw || "").trim();
  if (!key) return null;
  return {
    request: {
      tenantId: req.tenantId || req.authUser?.tenantId || DEFAULT_TENANT_ID,
      route: (req.originalUrl || req.path).split("?", 1)[0] || req.path,
      key,
      requestHash: hashIdempotencyPayload(req.body ?? null),
    },
  };
}

async function claimMutationIdempotency(req: AuthRequest) {
  const context = idempotencyContext(req);
  if (!context) return null;
  const claim = await claimIdempotencyKey(context.request);
  if (claim.replay) context.replay = {statusCode: claim.statusCode, response: claim.response};
  return context;
}

async function releaseMutationIdempotency(context: IdempotencyContext | null) {
  if (!context || context.replay) return;
  await releaseIdempotencyKey(context.request).catch(() => undefined);
}

function transactionHookWithIdempotency<T>(
  context: IdempotencyContext | null,
  statusCode: number,
  hook?: (client: Parameters<StateCommandTransactionHook<T>>[0], data: T, patch?: {stateMerge: StateMergePatch; stateDelete?: StateDeletePatch}) => void | Promise<unknown>,
) {
  if (!context && !hook) return undefined;
  return async (
    client: Parameters<StateCommandTransactionHook<T>>[0],
    data: T,
    patch?: {stateMerge: StateMergePatch; stateDelete?: StateDeletePatch},
  ) => {
    await hook?.(client, data, patch);
    if (context && patch) {
      await completeIdempotencyKeyInTransaction(client, context.request, statusCode, okMerge(data, patch.stateMerge, patch.stateDelete || {}));
    }
  };
}

async function persistProductImages(req: AuthRequest, product: ProductTemplate) {
  const urls = await persistEntityImages(req, "product", product.id, "product-image", "imageUrls");
  if (urls) product.imageUrls = urls;
  return product;
}

function hasImagePayload(req: AuthRequest) {
  return Object.prototype.hasOwnProperty.call(req.body || {}, "images") ||
    Object.prototype.hasOwnProperty.call(req.body || {}, "imageUrls");
}

async function persistEntityImages(
  req: AuthRequest,
  entityType: string,
  entityId: string,
  relationRole: string,
  preferredField: "images" | "imageUrls" = "images",
) {
  if (!hasImagePayload(req)) return undefined;
  const body = req.body || {};
  const rawValues = Object.prototype.hasOwnProperty.call(body, preferredField)
    ? body[preferredField]
    : preferredField === "images" ? body.imageUrls : body.images;
  const values = Array.isArray(rawValues) ? rawValues : [];
  return replaceEntityImages({
    tenantId: (req as AuthRequest).tenantId,
    entityType,
    entityId,
    relationRole,
    values,
    createdBy: crmActor(req),
  });
}

function withoutImagePayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const clean = { ...(body as Record<string, unknown>) };
  delete clean.images;
  delete clean.imageUrls;
  return clean;
}

function paginated<T>(items: T[], req: express.Request) {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.max(1, Math.min(200, Number(req.query.pageSize || req.query.per_page || 20)));
  const start = (page - 1) * pageSize;
  return {
    data: items.slice(start, start + pageSize),
    meta: {
      page,
      pageSize,
      total: items.length,
    },
  };
}

function asyncRoute(handler: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => {
    const invoke = () => Promise.resolve(handler(req, res, next));
    const operation = requiresStateSerialization(req.method, req.originalUrl)
      ? withStateMutation(req as AuthRequest, res, invoke)
      : invoke();
    operation.catch((error) => {
      if (isMutationAbortedError(error) && (req.destroyed || res.destroyed || res.writableEnded)) return;
      next(error);
    });
  };
}

function authMutationRoute(handler: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => {
    const operation = withAuthMutation(req as AuthRequest, res, () => handler(req, res, next));
    operation.catch((error) => {
      if (isMutationAbortedError(error) && (req.destroyed || res.destroyed || res.writableEnded)) return;
      next(error);
    });
  };
}

const requireOpenApiToken = createRequireOpenApiToken(OPEN_API_TOKEN, { onDenied: logSecurityDenial });

async function applyAuthenticatedUser(userId: string, session?: { tenantId?: string; storeId?: string }) {
  const tenantId = session?.tenantId || DEFAULT_TENANT_ID;
  // Always resolve the account inside the session tenant first. Falling back to
  // the process snapshot is only a compatibility path for legacy in-memory
  // tests; it must never allow a default-tenant row to authorize another tenant.
  const persisted = await findSystemUserById(userId, tenantId)
    || (tenantId === DEFAULT_TENANT_ID ? state.systemUsers.find((item) => item.id === userId) : undefined);
  if (!persisted?.enabled) return null;
  const membership = await findActiveTenantMembership(userId, tenantId, session?.storeId);
  if (!membership) return null;
  const membershipRole = ["老板", "店员", "检测员", "财务"].includes(membership.role)
    ? membership.role as SystemUserAccount["role"]
    : persisted.role;
  return {
    ...persisted,
    role: membershipRole,
    permissionOverrides: membership.permissions && Object.keys(membership.permissions).length
      ? { ...(persisted.permissionOverrides || {}), ...membership.permissions } as SystemUserAccount["permissionOverrides"]
      : persisted.permissionOverrides,
    tenantId,
    storeId: membership.storeId,
    membershipStatus: "active" as const,
  };
}

const requireAuth = createRequireAuth(sessions, applyAuthenticatedUser, { onDenied: logSecurityDenial });

function requireAuthenticatedUser(req: AuthRequest, res: express.Response): req is AuthRequest & { authUser: SystemUserAccount } {
  if (req.authUser) return true;
  sendApiError(req, res, 401, "UNAUTHORIZED", "请先登录系统", true);
  return false;
}

function requireBoss(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (!requireAuthenticatedUser(req, res)) return;
  if (req.authUser?.role !== "老板") {
    sendApiError(req, res, 403, "FORBIDDEN", "仅老板账号可执行该操作", true);
    return;
  }
  next();
}

function requireDeletePermission(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (!requireAuthenticatedUser(req, res)) return;
  if (!getPermissionsForUser(req.authUser).canDelete) {
    sendApiError(req, res, 403, "FORBIDDEN", "当前账号没有删除权限", true);
    return;
  }
  next();
}

function requireHistoryEditPermission(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (!requireAuthenticatedUser(req, res)) return;
  const permissions = getPermissionsForUser(req.authUser);
  if (req.authUser?.role !== "老板" && !permissions.canEditHistory) {
    sendApiError(req, res, 403, "FORBIDDEN", "当前账号没有历史单据编辑权限", true);
    return;
  }
  next();
}

function requireManualOutboundPermission(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (!requireAuthenticatedUser(req, res)) return;
  if (req.body?.manual && req.authUser?.role !== "老板" && !getPermissionsForUser(req.authUser).canManualOutbound) {
    sendApiError(req, res, 403, "FORBIDDEN", "当前账号没有手动确认出库权限，请使用扫码出库或联系管理员授权", true);
    return;
  }
  next();
}

function requireMenu(menuId: string): express.RequestHandler {
  return (req: AuthRequest, res, next) => {
    if (!requireAuthenticatedUser(req, res)) return;
    const permissions = getPermissionsForUser(req.authUser);
    if (!permissions.allowedMenus.includes("all") && !permissions.allowedMenus.includes(menuId)) {
      sendApiError(req, res, 403, "FORBIDDEN", "当前账号没有该窗口入口权限", true);
      return;
    }
    next();
  };
}

function crmActor(req: AuthRequest) {
  return req.authUser?.displayName || req.authUser?.username || req.authUser?.role || "系统";
}

function requireAnyMenu(menuIds: string[]): express.RequestHandler {
  return (req: AuthRequest, res, next) => {
    if (!requireAuthenticatedUser(req, res)) return;
    const permissions = getPermissionsForUser(req.authUser);
    if (permissions.allowedMenus.includes("all") || menuIds.some((menuId) => permissions.allowedMenus.includes(menuId))) {
      next();
      return;
    }
    sendApiError(req, res, 403, "FORBIDDEN", "当前账号没有该窗口入口权限", true);
  };
}

registerPagedRecordRoutes(app, {requireMenu, requireAnyMenu, permissionsForRequest: (req) => getScopedPermissions(state, (req as AuthRequest).authUser)});
registerMasterDataRoutes(app, {requireMenu, requireAnyMenu, permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser)});
registerPurchaseReadRoutes(app, {requireMenu, requireAnyMenu, permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser), getStoreDate: storeDate});
registerOperationalReadRoutes(app, {requireMenu, requireAnyMenu, permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser)});
registerGlobalSearchRoutes(app, {
  asyncRoute,
  permissionsForRequest: (req) => getPermissionsForUser(req.authUser as SystemUserAccount),
});

registerSystemRoutes(app, {
  dataFilePath,
  ensureReady: ensureStateReady,
  getRevision: () => stateRevision,
  logRequestError,
  sendServiceUnavailable: (req, res, message) => sendApiError(req, res, 503, "SERVICE_NOT_READY", message),
  requireBoss,
  getMetricsSnapshot: requestMetrics.snapshot,
});

registerFinanceClosingRoutes(app, {
  requireMenu,
  requireBoss,
  asyncRoute,
  sendValidationError: (req, res, message) => sendApiError(req, res, 400, "VALIDATION_ERROR", message),
  claimMutationIdempotency: (req) => claimMutationIdempotency(req as AuthRequest),
  releaseMutationIdempotency,
});
registerFinanceCommissionRoutes(app, {
  requireBoss,
  requireAnyMenu,
  asyncRoute,
  actions: (req) => actions(req as AuthRequest),
  persist: (req, result) => persistRequest(req as AuthRequest, result),
  permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser),
  claimMutationIdempotency: (req) => claimMutationIdempotency(req as AuthRequest),
  releaseMutationIdempotency,
  transactionHookWithIdempotency,
});
registerCommercialRoutes(app, {
  requireBoss,
  requireAnyMenu,
  asyncRoute,
  createSession: (userId, scope) => sessions.create(userId, scope),
  revokeSession: (token) => sessions.revoke(token),
  setSessionCookie,
  createCsrfToken,
});

const authRouteDependencies = {
  loginRateLimiter,
  authMutationRoute,
  asyncRoute,
  requireBoss,
  reloadStateCollections: async (keys: StateCollectionKey[]) => {
    replaceCurrentState(await loadStateCollections(state, keys));
  },
  reloadState: reloadStateFromDatabase,
  replaceState: replaceCurrentState,
  getState: () => state,
  actions: (req: express.Request) => actions(req as AuthRequest),
  sessions,
  setSessionCookie,
  clearSessionCookie,
  createCsrfToken,
  getStateRevision,
  saveStateRecords,
  saveState,
  ok,
  sendApiError,
  defaultTenantId: DEFAULT_TENANT_ID,
  defaultStoreId: DEFAULT_STORE_ID,
};

registerLoginRoute(app, authRouteDependencies);

registerOpenApiRoutes(app, {
  openApiRateLimiter,
  requireOpenApiToken,
  asyncRoute,
  reloadStateCollections: async (keys) => {
    replaceCurrentState(await loadStateCollections(state, keys));
  },
  getState: () => state,
  actions: (context) => actions(undefined, context),
  notifyMarketQuotePriceChanged: notifyFeishuMarketQuotePriceChanged,
  sendApiError: (req, res, status, code, message) => sendApiError(req, res, status, code, message),
  paginated,
  defaultTenantId: DEFAULT_TENANT_ID,
  defaultStoreId: DEFAULT_STORE_ID,
});

// Background clients poll this lightweight revision endpoint first. Keeping it ahead of the
// state-reload middleware avoids deserializing every business collection when nothing changed.
registerStateRevisionRoute(app, {
  asyncRoute,
  getRevision: getStateRevision,
  getPublicState: (req, mode) => publicState(req as AuthRequest, mode),
  getCurrentUser: (req) => actions(req as AuthRequest).getCurrentUser(),
  createCsrfToken,
});

app.use((req: AuthRequest, res, next) => {
  void (async () => {
    if (requiresStateSerialization(req.method, req.originalUrl)) {
      next();
      return;
    }
    if (!shouldReloadStateFromDatabase(req.method, req.path)) {
      next();
      return;
    }
    // Authenticated reads already own a fresh, policy-sized tenant snapshot.
    // Only non-session callers need this compatibility reload path.
    const databaseRevision = req.authUser ? stateRevision : await getStateRevision();
    if (!req.authUser && (databaseRevision !== stateRevision || req.method.toUpperCase() !== "GET")) {
      await reloadRequestStateFromDatabase(req);
    }
    if (req.authUser) {
      const freshUser = await applyAuthenticatedUser(req.authUser.id, { tenantId: req.tenantId });
      if (!freshUser) {
        await sessions.revoke(req.authToken);
        sendApiError(req, res, 401, "UNAUTHORIZED", "账号已停用或不存在", true);
        return;
      }
      req.authUser = freshUser;
    }
    next();
  })().catch(next);
});

app.use((req: AuthRequest, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = ((payload: unknown) => {
    if (req.authUser && shouldAttachFreshStateToResponse(req.method, req.path, payload)) {
      const patchKeys = getStatePatchKeysForRequest(req.method, req.path);
      return sendJson({
        ...(payload as Record<string, unknown>),
        state: patchKeys?.length ? publicStatePatch(req, patchKeys) : publicState(req),
      });
    }
    return sendJson(payload);
  }) as typeof res.json;
  next();
});

registerInventoryJourneyRoutes(app, {
  requireMenu,
  getState: () => state,
  permissionsForRequest: (req) => getScopedPermissions(state, (req as AuthRequest).authUser),
});
registerSalesProductCandidateRoutes(app, {requireMenu, getInventorySummary: (req, query) => actions(req as AuthRequest).getInventorySummary(query), permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser), storeDateDiffDays});
registerSalesCustomerRoutes(app, {requireMenu});
registerSalesOutboundRoutes(app, {requireMenu});
registerCustomerDirectoryRoutes(app, {requireMenu, permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser)});
registerOrderPoolRoutes(app, {
  requireMenu,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req),
  persist: (req, result) => persistRequest(req, result),
});
registerProductLedgerRoutes(app, {
  requireMenu,
  getState: () => state,
  permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser),
  ok,
});
registerStateRoutes(app, {
  asyncRoute,
  getRevision: () => stateRevision,
  getPublicState: (req, mode) => publicState(req as AuthRequest, mode),
  getCurrentUser: (req) => actions(req as AuthRequest).getCurrentUser(),
  createCsrfToken,
});
registerMarketQuoteRoutes(app, {
  requireMenu,
  getState: () => state,
});
registerAiDailySalesRoutes(app, {
  requireAnyMenu,
  loadState: (tenantId, storeId) => loadStateCollections(state, AI_DAILY_SALES_STATE_KEYS, tenantId, storeId),
  getStoreDate: storeDate,
  getCutoff: () => process.env.FEISHU_DAILY_REPORT_CUTOFF || "20:00",
  permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser),
});

registerAiRoutes(app, {
  requireAnyMenu,
  requireBoss,
  requireMenu,
  asyncRoute,
  loadState: (tenantId, storeId) => loadStateCollections(state, AI_INSIGHT_STATE_KEYS, tenantId, storeId),
  replaceState: replaceCurrentState,
  reloadState: reloadStateFromDatabase,
  getState: () => state,
  featureEnabled: commercialFeatureEnabled,
  recordUsage: recordCommercialUsage,
  estimateUsageUnits: estimateAiUsageUnits,
  actorForRequest: (req) => crmActor(req as AuthRequest),
  sendApiError,
  logRequestError,
  defaultTenantId: DEFAULT_TENANT_ID,
});

registerLogoutRoute(app, authRouteDependencies);

registerUserManagementRoutes(app, {
  requireBoss,
  requireMenu,
  asyncRoute,
  actions: (req) => actions(req as AuthRequest),
  assertSeatAvailable,
  persistUserWithMembership,
  revokeUserSessions: async (userId, tenantId) => {
    await sessions.revokeUserSessions?.(userId, tenantId);
  },
  sendApiError: (req, res, status, code, message) => sendApiError(req, res, status, code, message),
  ok,
});

registerFinanceAccountRoutes(app, {
  requireMenu,
  requireDeletePermission,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  claimMutationIdempotency: (req) => claimMutationIdempotency(req as AuthRequest),
  releaseMutationIdempotency,
  transactionHookWithIdempotency,
});

registerFinancePaymentRoutes(app, {
  requireMenu,
  requireDeletePermission,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  claimMutationIdempotency: (req) => claimMutationIdempotency(req as AuthRequest),
  releaseMutationIdempotency,
  transactionHookWithIdempotency,
  persistEntityImages: (req, entityType, entityId, relationRole) => persistEntityImages(req as AuthRequest, entityType, entityId, relationRole),
  paymentInMerge: (record) => buildPaymentInMerge(state, record),
  paymentOutMerge: (record) => buildPaymentOutMerge(state, record),
  accountTransferMerge: (record) => buildAccountTransferMerge(state, record),
});

registerFinanceReadModelRoutes(app, {
  requireMenu,
  asyncRoute,
  loadState,
  getStoreDate: storeDate,
  startOfMonth: (date) => startOfMonth(date),
  addDateDays: (date, days) => addDateDays(date, days),
  ok,
  state,
  actions: (req) => actions(req as AuthRequest),
  paginated,
  sendValidationError: (req, res, message) => sendApiError(req as AuthRequest, res, 400, "VALIDATION_ERROR", message),
  permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser),
  claimMutationIdempotency: (req) => claimMutationIdempotency(req as AuthRequest),
  releaseMutationIdempotency,
});

registerFinanceAccountingControlRoutes(app, {
  requireMenu,
  asyncRoute,
  loadState,
  listAccountingEvents,
  getAccountingEvent,
  listAccountingReversalDocuments,
  listFinanceIntegrityAlerts,
  syncFinanceIntegrityAlertsInTransaction,
  permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser),
  claimMutationIdempotency: (req) => claimMutationIdempotency(req as AuthRequest),
  releaseMutationIdempotency,
});

registerCrmReadModelRoutes(app, {
  requireMenu,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  paginated,
  matchesKeyword,
});

registerCrmNormalizedReadRoutes(app, {requireMenu, asyncRoute});

registerCrmQuickCaptureRoutes(app, {
  requireMenu,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  actorForRequest: (req) => crmActor(req),
});

registerCrmMutationRoutes(app, {
  requireMenu,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  actorForRequest: (req) => crmActor(req as AuthRequest),
});

registerProductMutationRoutes(app, {
  requireMenu,
  requireDeletePermission,
  asyncRoute,
  actions: (req) => actions(req as AuthRequest),
  persistProductImages,
  productTemplateMerge: (req, products) => buildProductTemplateMerge(state, products, req.authUser),
  deleteMerge: () => buildDeleteStateMerge(state),
});

registerPartnerMutationRoutes(app, {
  requireMenu,
  requireDeletePermission,
  asyncRoute,
  actions: (req) => actions(req as AuthRequest),
  customerCreateMerge: (customer) => buildSimpleRecordCreateMerge(state, "customers", customer),
  vendorCreateMerge: (vendor) => buildSimpleRecordCreateMerge(state, "vendors", vendor),
  vendorRecordMerge: (vendor) => buildVendorRecordMerge(state, vendor),
  deleteMerge: () => buildDeleteStateMerge(state),
  persistCustomerAccount: (client, req, customer) => upsertCrmCustomerAccount(client, customer, "created", crmActor(req as AuthRequest)),
});

registerMediaRoutes(app, {
  requireAnyMenu,
  asyncRoute,
  actorForRequest: (req) => crmActor(req as AuthRequest),
  sendNotFound: (req, res, code, message) => sendApiError(req as AuthRequest, res, 404, code, message),
});

registerPurchaseMutationRoutes(app, {
  requireMenu,
  requireDeletePermission,
  requireHistoryEditPermission,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  permissionsForRequest: (req) => getPermissionsForUser(req.authUser),
  actorForRequest: (req) => crmActor(req),
  withoutImagePayload,
  persistEntityImages: (req, entityType, entityId, relationRole) => persistEntityImages(req, entityType, entityId, relationRole),
  claimMutationIdempotency: (req) => claimMutationIdempotency(req),
  releaseMutationIdempotency,
  transactionHookWithIdempotency,
});

registerInspectionMutationRoutes(app, {
  requireMenu,
  requireHistoryEditPermission,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  withoutImagePayload,
  persistEntityImages: (req, entityType, entityId, relationRole) => persistEntityImages(req, entityType, entityId, relationRole),
  actorForRequest: (req) => crmActor(req),
  sendNotFound: (req, res, code, message) => sendApiError(req, res, 404, code, message),
});

registerAssemblyMutationRoutes(app, {
  requireMenu,
  requireDeletePermission,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
});

registerSalesMutationRoutes(app, {
  requireMenu,
  requireHistoryEditPermission,
  requireDeletePermission,
  requireManualOutboundPermission,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  actorForRequest: (req) => crmActor(req),
  claimMutationIdempotency: (req) => claimMutationIdempotency(req),
  releaseMutationIdempotency,
  transactionHookWithIdempotency,
  releaseInventoryReservations: releaseInventoryReservationsInTransaction,
  reserveSalesOutboundInventory: reserveSalesOutboundInventoryInTransaction,
  notifySalesInvoiceCreated: notifyFeishuSalesInvoiceCreated,
  ok,
});

registerReturnMutationRoutes(app, {
  requireAnyMenu,
  requireDeletePermission,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  permissionsForRequest: (req) => getPermissionsForUser(req.authUser),
  claimMutationIdempotency: (req) => claimMutationIdempotency(req),
  releaseMutationIdempotency,
  sendApiError,
  completeIdempotency: completeIdempotencyKeyInTransaction,
  releaseInventoryReservations: releaseInventoryReservationsInTransaction,
});

registerAftersalesMutationRoutes(app, {
  requireMenu,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  claimMutationIdempotency: (req) => claimMutationIdempotency(req as AuthRequest),
  releaseMutationIdempotency,
  transactionHookWithIdempotency,
});

registerMarketQuoteMutationRoutes(app, {
  requireMenu,
  requireDeletePermission,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  deleteMerge: () => buildDeleteStateMerge(state),
  notifyPriceChanged: notifyFeishuMarketQuotePriceChanged,
  notifyPriceChanges: notifyFeishuMarketQuotePriceChanged,
  sendValidationError: (req, res, message) => sendApiError(req, res, 400, "VALIDATION_ERROR", message),
});

registerInventoryMutationRoutes(app, {
  requireMenu,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  sanitizeInventoryRows: (rows, user) => buildSanitizedInventoryRows(state, rows, user),
});

registerLogRoutes(app, {
  requireMenu,
  requireHistoryEditPermission,
  asyncRoute,
  actions: (req) => actions(req as AuthRequest),
  persistRequest,
  ok,
});

registerFinanceLedgerMutationRoutes(app, {
  requireMenu,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  claimMutationIdempotency: (req) => claimMutationIdempotency(req as AuthRequest),
  releaseMutationIdempotency,
});

registerResetRoute(app, authRouteDependencies);

registerBackupRoutes(app, {
  state,
  requireBoss,
  requireReports: requireMenu("finance_reports"),
  asyncRoute,
  getStoreDate: storeDate,
  getShowCost: (req) => Boolean(actions(req as AuthRequest).getPermissions().showCost),
  ok,
});

app.use((req: AuthRequest, res: express.Response) => {
  sendApiError(req, res, 404, "NOT_FOUND", "接口不存在");
});

app.use((err: unknown, req: AuthRequest, res: express.Response, _next: express.NextFunction) => {
  if (isMutationAbortedError(err) && (req.destroyed || res.destroyed || res.writableEnded)) return;
  const requestId = req.requestId || randomUUID();
  res.setHeader("X-Request-Id", requestId);
  const requestError = err && typeof err === "object" ? err as { type?: unknown; status?: unknown } : undefined;
  const parserFailure = requestError?.type === "entity.parse.failed";
  const payloadTooLarge = requestError?.type === "entity.too.large";
  const requestErrorDetails = parserFailure
    ? { status: 400, code: "INVALID_JSON", message: "请求体不是有效 JSON" }
    : payloadTooLarge
      ? { status: 413, code: "PAYLOAD_TOO_LARGE", message: "请求体超过 2MB 限制" }
      : undefined;
  const code = requestErrorDetails?.code || (err instanceof AppError
    ? err.code
    : err instanceof QuickCaptureValidationError
      ? err.code
      : err instanceof MediaValidationError
        ? err.code
        : "SERVER_ERROR");
  logRequestError(req, err, code);
  if (requestErrorDetails) {
    res.status(requestErrorDetails.status).json({ error: { code: requestErrorDetails.code, message: requestErrorDetails.message, requestId } });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, requestId, ...(err.details === undefined ? {} : { details: err.details }) } });
    return;
  }
  if (err instanceof QuickCaptureValidationError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, requestId } });
    return;
  }
  if (err instanceof MediaValidationError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, requestId } });
    return;
  }
  if (err instanceof CommercialValidationError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, requestId } });
    return;
  }

  res.status(500).json({ error: { code: "SERVER_ERROR", message: "服务器处理失败，请稍后重试", requestId } });
});

export function createApp() {
  return app;
}

export function startServer(port = PORT) {
  return createApp().listen(port, () => {
    console.log(`Backend API listening on http://localhost:${port}`);
  });
}

function isMainModule() {
  const entry = process.argv[1];
  return Boolean(entry && resolve(entry) === resolve(fileURLToPath(import.meta.url)));
}
if (isMainModule()) {
  startServer();
}
