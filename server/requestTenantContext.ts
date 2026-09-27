import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped tenancy without forcing a flag through every legacy store
 * action. The legacy state object is exposed through a small proxy; existing
 * actions keep their API while authenticated requests read/write the state
 * loaded for their tenant. The fallback state is used by health/bootstrap and
 * by the single-tenant compatibility mode.
 */
export type TenantStateContext<TState> = {
  tenantId: string;
  storeId: string;
  state: TState;
};

const storage = new AsyncLocalStorage<TenantStateContext<Record<string | symbol, unknown>>>();
let fallbackState: Record<string | symbol, unknown> | undefined;
const stateProxies = new WeakSet<object>();

function currentState() {
  return storage.getStore()?.state || fallbackState;
}

export function setFallbackState<TState extends object>(state: TState) {
  fallbackState = state as Record<string | symbol, unknown>;
}

export function getCurrentTenantContext() {
  return storage.getStore();
}

/**
 * Return the concrete state for the active request (or the process fallback).
 *
 * The exported state object is intentionally a proxy so legacy actions can keep
 * their existing API. Code that snapshots or clones state must use the concrete
 * object behind that proxy; Node's structuredClone rejects Proxy instances with
 * a DataCloneError.
 */
export function getCurrentState<TState extends object>() {
  return currentState() as TState | undefined;
}

export function getFallbackState<TState extends object>() {
  return fallbackState as TState | undefined;
}

export function replaceCurrentState<TState extends object>(state: TState) {
  // A no-op collection reload may hand the shared state proxy back to this
  // function. Storing that proxy as the request's concrete state makes every
  // subsequent property read call currentState() through the same proxy again,
  // eventually overflowing the stack. Resolve it to the state currently
  // behind the proxy so request contexts always keep a concrete snapshot.
  const resolvedState = stateProxies.has(state)
    ? currentState()
    : state as Record<string | symbol, unknown>;
  if (!resolvedState || stateProxies.has(resolvedState)) {
    throw new Error("Cannot replace request state with an unresolved state proxy");
  }
  const context = storage.getStore();
  if (context) context.state = resolvedState;
  else fallbackState = resolvedState;
}

export function runTenantContext<TState extends object, TResult>(
  context: TenantStateContext<TState>,
  callback: () => TResult,
) {
  return storage.run(context as TenantStateContext<Record<string | symbol, unknown>>, callback);
}

export function createStateProxy<TState extends object>() {
  const target = {} as TState;
  const proxy = new Proxy(target, {
    get(_target, property) {
      return currentState()?.[property];
    },
    set(_target, property, value) {
      const state = currentState();
      if (!state) throw new Error("State context is not initialized");
      state[property] = value;
      return true;
    },
    has(_target, property) {
      return property in (currentState() || {});
    },
    ownKeys() {
      return Reflect.ownKeys(currentState() || {});
    },
    getOwnPropertyDescriptor(_target, property) {
      const state = currentState();
      if (!state || !(property in state)) return undefined;
      return { configurable: true, enumerable: true, writable: true, value: state[property] };
    },
  });
  stateProxies.add(proxy);
  return proxy;
}
