/**
 * Demo accounts from the mockup's seed. Shown on the sign-in page and in the
 * "Preview as" switch only when NEXT_PUBLIC_DEV_ROLE_SWITCHER is on.
 */
export const DEMO_ACCOUNTS = [
  {
    username: "admin",
    password: "admin",
    fullName: "Richard Boquia",
    detail: "Super admin · all branches",
    label: "Super admin",
  },
  {
    username: "cashier1",
    password: "pos",
    fullName: "Jo Santos",
    detail: "Cashier · NCCC Market",
    label: "Cashier",
  },
] as const;
