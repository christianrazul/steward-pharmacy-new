import { useState } from "react";

/**
 * A page number that goes back to the first page whenever the filters change.
 * Pass a key built from every filter; no effect needed.
 */
export function useFilterPage(filterKey: string): [number, (page: number) => void] {
  const [state, setState] = useState({ key: filterKey, page: 0 });
  const page = state.key === filterKey ? state.page : 0;
  return [
    page,
    (next: number) => {
      setState({ key: filterKey, page: next });
    },
  ];
}
