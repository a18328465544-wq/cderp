import {useEffect, useState} from "react";
import type {SelectOption} from "./select";

/** Remember only the current identity, never a history of remote search results. */
export function resolveSelectedOption(value: string | undefined, options: readonly SelectOption[], supplied?: SelectOption | null, remembered?: SelectOption | null): SelectOption | null {
  if (value === undefined) return null;
  return options.find((option) => option.value === value)
    || (supplied?.value === value ? supplied : null)
    || (remembered?.value === value ? remembered : null);
}

export function useSelectedOption(value: string | undefined, options: readonly SelectOption[], supplied?: SelectOption | null) {
  const current = resolveSelectedOption(value, options, supplied);
  const [remembered, setRemembered] = useState<SelectOption | null>(current);
  useEffect(() => {
    setRemembered((previous) => current || (previous?.value === value ? previous : null));
  }, [current, value]);
  return resolveSelectedOption(value, options, supplied, remembered);
}
