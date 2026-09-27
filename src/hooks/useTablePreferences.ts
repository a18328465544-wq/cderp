import {useCallback, useEffect, useMemo, useState} from "react";

export type TableDensity = "comfortable" | "compact";

type PreferenceEnvelope<T> = {
  version: number;
  value: T;
};

type TablePreferencesOptions<TVisibility extends Record<string, boolean>> = {
  feature: string;
  userId?: string;
  version?: number;
  defaultVisibility: TVisibility;
  defaultDensity?: TableDensity;
  parseVisibility?: (value: unknown) => TVisibility;
};

function safeRead<T>(key: string, fallback: T, version: number, parse?: (value: unknown) => T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as PreferenceEnvelope<unknown> | unknown;
    if (!parsed || typeof parsed !== "object" || !("version" in parsed) || (parsed as PreferenceEnvelope<unknown>).version !== version) return fallback;
    return parse ? parse((parsed as PreferenceEnvelope<unknown>).value) : (parsed as PreferenceEnvelope<unknown>).value as T;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T, version: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify({version, value} satisfies PreferenceEnvelope<T>));
  } catch {
    // Preferences are optional and must never block a business page.
  }
}

function normalizeVisibility<T extends Record<string, boolean>>(fallback: T, value: unknown): T {
  if (!value || typeof value !== "object") return fallback;
  const result = {...fallback};
  for (const key of Object.keys(fallback)) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === "boolean") (result as Record<string, boolean>)[key] = candidate;
  }
  return result;
}

function sameVisibility<T extends Record<string, boolean>>(left: T, right: T) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

export function useTablePreferences<TVisibility extends Record<string, boolean>>({feature, userId = "anonymous", version = 1, defaultVisibility, defaultDensity = "comfortable", parseVisibility}: TablePreferencesOptions<TVisibility>) {
  const scope = useMemo(() => `${feature}:${userId}`, [feature, userId]);
  const visibilityKey = `gpu-erp-v2:table:${scope}:visibility`;
  const densityKey = `gpu-erp-v2:table:${scope}:density`;
  const parse = useMemo(
    () => parseVisibility ?? ((value: unknown) => normalizeVisibility(defaultVisibility, value)),
    [defaultVisibility, parseVisibility],
  );
  const [columnVisibility, setColumnVisibility] = useState<TVisibility>(() => safeRead(visibilityKey, defaultVisibility, version, parse));
  const [density, setDensity] = useState<TableDensity>(() => safeRead<TableDensity>(densityKey, defaultDensity, version, (value) => value === "compact" || value === "comfortable" ? value : defaultDensity));

  useEffect(() => {
    const next = safeRead(visibilityKey, defaultVisibility, version, parse);
    setColumnVisibility((current) => sameVisibility(current, next) ? current : next);
  }, [defaultVisibility, parse, version, visibilityKey]);
  useEffect(() => setDensity(safeRead<TableDensity>(densityKey, defaultDensity, version, (value) => value === "compact" || value === "comfortable" ? value : defaultDensity)), [defaultDensity, densityKey, version]);
  useEffect(() => safeWrite(visibilityKey, columnVisibility, version), [columnVisibility, version, visibilityKey]);
  useEffect(() => safeWrite(densityKey, density, version), [density, densityKey, version]);

  const reset = useCallback(() => {
    setColumnVisibility(defaultVisibility);
    setDensity(defaultDensity);
  }, [defaultDensity, defaultVisibility]);

  return {columnVisibility, setColumnVisibility, density, setDensity, reset};
}
