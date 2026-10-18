import type { ReportPeriod } from "@steward/domain";

/** Period tabs shared by the dashboard and sales activity. */
export const PERIOD_TABS: [ReportPeriod, string][] = [
  ["today", "Today"],
  ["week", "Week"],
  ["month", "Month"],
  ["quarter", "Quarter"],
  ["year", "Year"],
];
