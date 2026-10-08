/** One presentation stack, shared by buttons and browser Back. No business
 * data or synthetic history entries are stored here. */
export function createPhoneBackStack() {
  const layers = new Map<symbol, {priority: number; order: number; back: () => void}>();
  let order = 0;
  const top = () => [...layers.values()].sort((a, b) => b.priority - a.priority || b.order - a.order)[0];
  return {
    register(priority: number, back: () => void) {
      const key = Symbol();
      layers.set(key, {priority, back, order: ++order});
      return () => {layers.delete(key);};
    },
    hasLayer: () => Boolean(top()),
    take: () => top()?.back,
    consume() {
      const layer = top();
      if (!layer) return false;
      layer.back();
      return true;
    },
  };
}

/** Only revisit a route observed in this mounted app session. A deep link or
 * refresh must never send the in-app back button to another website. */
export function createPhoneRouteHistory() {
  const entries = new Map<number, string>();
  return {
    record(index: number, href: string, pushed = false) {
      if (!Number.isInteger(index) || index < 0 || !href.startsWith("/") || href.startsWith("//")) return;
      if (pushed) for (const key of entries.keys()) if (key > index) entries.delete(key);
      entries.set(index, href);
    },
    previous(index: number, allowed: (pathname: string) => boolean) {
      const href = entries.get(index - 1);
      if (!href || !allowed(href.split(/[?#]/)[0] || "/")) return null;
      return href;
    },
  };
}
