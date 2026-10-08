import type {SelectOption} from "./select";

/** One matcher for desktop and phone presentations. Domain model search can override it. */
export function selectOptionLabelText(option: SelectOption): string {
  if (option.labelText) return option.labelText;
  return typeof option.label === "string" ? option.label : option.value;
}

export function normalizeSelectSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\u00b7•・/_|,-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function selectOptionMatches(option: SelectOption, query: string): boolean {
  const normalizedQuery = normalizeSelectSearchText(query);
  if (!normalizedQuery) return true;
  const corpus = normalizeSelectSearchText(`${selectOptionLabelText(option)} ${option.searchText || ""}`);
  return normalizedQuery.split(" ").every((token) => corpus.includes(token))
    || corpus.replace(/\s+/g, "").includes(normalizedQuery.replace(/\s+/g, ""));
}
