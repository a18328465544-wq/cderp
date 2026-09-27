import {stringifySearchWith} from "@tanstack/react-router";

/**
 * Keep user-entered search text as text when TanStack Router builds a URL.
 *
 * The router's default serializer JSON-stringifies a string that can be
 * parsed by JSON.parse, so a keyword such as `4090` becomes `%224090%22` and
 * returns to the input as `"4090"`. Complex values still use JSON encoding;
 * only the optional string parser is intentionally omitted.
 */
export const stringifyRouterSearch = stringifySearchWith(
  (value: unknown) => JSON.stringify(value) ?? "",
);
