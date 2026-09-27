const SEARCH_SEPARATOR_PATTERN = /[\s\u3000,，.。\/\\|、·・:：;；_\-—+()（）\[\]【】{}<>《》"'“”‘’]+/g;
const SEARCH_SEGMENT_PATTERN = /[\u4e00-\u9fff]+|[a-z]+|\d+/g;

function expandSearchAliases(value: string) {
  const compact = value.replace(/\s+/g, "");
  const aliases = new Set<string>();

  if (compact.includes("adoc") || compact.includes("advancedoc")) {
    aliases.add("adoc");
    aliases.add("ad oc");
    aliases.add("advanced oc");
    aliases.add("advancedoc");
    aliases.add("igame advanced oc");
  }

  return [value, ...aliases].join(" ");
}

export function normalizeSearchText(value: unknown) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(SEARCH_SEPARATOR_PATTERN, " ")
    .trim()
    .replace(/\s+/g, " ");

  return expandSearchAliases(normalized).trim().replace(/\s+/g, " ");
}

export function compactSearchText(value: unknown) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

export function tokenizeSearchText(value: unknown) {
  const tokens = normalizeSearchText(value).split(" ").filter(Boolean);
  return Array.from(
    new Set(
      tokens.flatMap(token => {
        const segments = token.match(SEARCH_SEGMENT_PATTERN) ?? [];
        return segments.length > 1 ? segments : [token];
      })
    )
  );
}

export function buildSearchText(values: unknown[]) {
  return normalizeSearchText(values.filter(value => value !== null && value !== undefined).join(" "));
}

export function matchesKeyword(values: unknown[] | unknown, query: unknown) {
  const rawQuery = String(query ?? "").trim();
  if (!rawQuery) return true;

  const haystack = Array.isArray(values) ? buildSearchText(values) : normalizeSearchText(values);
  const compactHaystack = compactSearchText(haystack);
  const compactQuery = compactSearchText(rawQuery);

  if (compactQuery && compactHaystack.includes(compactQuery)) return true;

  const tokens = tokenizeSearchText(rawQuery);
  if (!tokens.length) return true;

  return tokens.every(token => haystack.includes(token) || compactHaystack.includes(token));
}
