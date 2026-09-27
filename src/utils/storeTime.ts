export const STORE_TIME_ZONE = "Asia/Shanghai";

const STORE_TIME_OFFSET_MINUTES = 8 * 60;

const toStoreOffsetDate = (date = new Date()) =>
  new Date(date.getTime() + STORE_TIME_OFFSET_MINUTES * 60 * 1000);

export const storeDate = (date = new Date()) =>
  toStoreOffsetDate(date).toISOString().slice(0, 10);

export const storeDateKey = (date = new Date()) => storeDate(date).replace(/-/g, "");

export const storeDateTime = (date = new Date()) =>
  toStoreOffsetDate(date).toISOString().replace("T", " ").substring(0, 16);

/** Display an API timestamp in the store timezone without shifting local
 * business strings that already omit an explicit timezone. */
export const formatStoreDateTime = (value?: string) => {
  const normalized = value?.trim() || "";
  if (!normalized) return "—";
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    const parsed = new Date(normalized);
    if (Number.isFinite(parsed.getTime())) return storeDateTime(parsed);
  }
  return normalized.replace("T", " ").slice(0, 16);
};

export const storeHour = (date = new Date()) =>
  Number(toStoreOffsetDate(date).toISOString().slice(11, 13));

/** Compare a business timestamp using the same store timezone as displayed dates. */
export const isStoreDateTimeBeforeNow = (value?: string, now = new Date()) => {
  if (!value) return false;
  const normalized = value.trim();
  if (!normalized) return false;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    const parsed = new Date(normalized);
    return Number.isFinite(parsed.getTime()) && storeDateTime(parsed) < storeDateTime(now);
  }
  return normalized.replace("T", " ").slice(0, 16) < storeDateTime(now);
};

export const storeMonth = (date = new Date()) => storeDate(date).slice(0, 7);

export const storeDateAfterDays = (days: number, date = new Date()) => {
  const offsetDate = toStoreOffsetDate(date);
  offsetDate.setUTCDate(offsetDate.getUTCDate() + days);
  return offsetDate.toISOString().slice(0, 10);
};

export const storeDateDiffDays = (fromDate?: string, toDate = storeDate()) => {
  if (!fromDate) return 0;
  const fromTime = Date.parse(`${fromDate.slice(0, 10)}T00:00:00.000Z`);
  const toTime = Date.parse(`${toDate.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(fromTime) || Number.isNaN(toTime)) return 0;
  return Math.max(0, Math.floor((toTime - fromTime) / 86400000));
};
