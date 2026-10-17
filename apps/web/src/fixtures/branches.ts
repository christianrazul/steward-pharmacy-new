/**
 * Temporary typed fixtures that mirror the mockup. Milestone 2 moves them behind
 * the DataClient interface; Milestone 4 replaces them with the database seed.
 */
export interface BranchSummary {
  id: string;
  code: string;
  name: string;
  isCentral: boolean;
  /** Pending stock requests from this branch. Static until Milestone 9. */
  pendingRequests: number;
}

export const BRANCHES: readonly BranchSummary[] = [
  { id: "central", code: "ESP", name: "Esperanza Buhangin", isCentral: true, pendingRequests: 1 },
  { id: "b1", code: "NCC", name: "NCCC Market", isCentral: false, pendingRequests: 2 },
  { id: "b2", code: "COM", name: "Communal Buhangin", isCentral: false, pendingRequests: 1 },
  { id: "b3", code: "TIB", name: "Tibungco", isCentral: false, pendingRequests: 1 },
];

export function branchById(id: string): BranchSummary | undefined {
  return BRANCHES.find((branch) => branch.id === id);
}
