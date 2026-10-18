import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

const API = "http://localhost:4300";
const WEB_ORIGIN = "http://localhost:3300";

/** An admin adds a counter in Settings and reads out the one-time code. */
async function enrollmentCode(): Promise<string> {
  const signIn = await fetch(`${API}/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: WEB_ORIGIN },
    body: JSON.stringify({ username: "admin", password: "admin" }),
  });
  const cookie = signIn.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const branches = (await (await fetch(`${API}/branches`, { headers: { cookie } })).json()) as {
    id: string;
    code: string;
  }[];
  const branchId = branches.find((branch) => branch.code === "NCC")?.id;
  const res = await fetch(`${API}/devices`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: WEB_ORIGIN, cookie },
    body: JSON.stringify({ branchId, label: "Counter 7", receiptSeries: "07", printWidth: 58 }),
  });
  if (!res.ok) throw new Error(`Adding the device failed: ${await res.text()}`);
  return ((await res.json()) as { code: string }).code;
}

/** Receipt numbers the server has for today, as the admin sees them in Sales activity. */
async function serverReceipts(): Promise<string[]> {
  const signIn = await fetch(`${API}/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: WEB_ORIGIN },
    body: JSON.stringify({ username: "admin", password: "admin" }),
  });
  const cookie = signIn.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const page = (await (
    await fetch(`${API}/sales?period=today&pageSize=100`, { headers: { cookie } })
  ).json()) as { rows: { receiptNo: string }[] };
  return page.rows.map((row) => row.receiptNo);
}

async function launch(
  userData: string,
): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
  const app = await electron.launch({
    args: [join(import.meta.dirname, "../dist/main.mjs")],
    env: { ...process.env, STEWARD_USER_DATA: userData },
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return { app, page, errors };
}

async function sellOne(page: Page, query: string) {
  const search = page.getByRole("textbox", { name: "Search products" });
  await search.fill(query);
  await expect(page.getByRole("button", { name: new RegExp(query, "i") }).first()).toBeVisible();
  await search.press("Enter");
  await page.getByRole("button", { name: "Exact" }).click();
  await page.getByRole("button", { name: /^Charge ₱/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Payment received")).toBeVisible();
  const receiptNo =
    (await dialog
      .getByText(/OR-NCC-07-\d{6}/)
      .first()
      .textContent()) ?? "";
  await dialog.getByRole("button", { name: "New sale" }).click();
  return /OR-NCC-07-\d{6}/.exec(receiptNo)?.[0] ?? "";
}

test("enroll, sign in, sell, restart, and the sales reach the server", async () => {
  const userData = await mkdtemp(join(tmpdir(), "steward-e2e-"));
  try {
    let { app, page, errors } = await launch(userData);

    // First launch: set up the counter with the admin's code.
    await expect(page.getByRole("heading", { name: "Set up this counter" })).toBeVisible();
    await page.getByLabel("Server address").fill(API);
    await page.getByLabel("Enrollment code").fill(await enrollmentCode());
    await page.getByRole("button", { name: "Set up counter" }).click();

    // Sign in against the synced password hash; the footer names the counter.
    await expect(page.getByRole("heading", { name: "Sign in to your counter" })).toBeVisible();
    await expect(page.getByText(/Counter 7 · NCCC Market · Last synced/)).toBeVisible();
    await page.getByLabel("Username").fill("cashier1");
    await page.getByLabel("Password").fill("pos");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/pos\/?$/);

    expect(await sellOne(page, "biogesic")).toBe("OR-NCC-07-000001");
    expect(await sellOne(page, "biogesic")).toBe("OR-NCC-07-000002");
    expect(errors).toEqual([]);
    await app.close();

    // Restart: same data folder, the sequence continues and the sales are queued.
    ({ app, page, errors } = await launch(userData));
    await expect(page.getByRole("heading", { name: "Sign in to your counter" })).toBeVisible();
    await page.getByLabel("Username").fill("cashier1");
    await page.getByLabel("Password").fill("pos");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/pos\/?$/);
    // Connected to the server, the counter has already synced both sales.
    await expect
      .poll(serverReceipts, { timeout: 30_000 })
      .toEqual(expect.arrayContaining(["OR-NCC-07-000001", "OR-NCC-07-000002"]));
    expect(await sellOne(page, "biogesic")).toBe("OR-NCC-07-000003");
    expect(errors).toEqual([]);
    await app.close();
  } finally {
    await rm(userData, { recursive: true, force: true });
  }
});
