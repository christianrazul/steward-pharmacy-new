import { expect, test } from "../e2e/fixtures";
import { signIn } from "./helpers";

test("a stock request goes from the branch to central and back as stock", async ({ browser }) => {
  // The cashier sends a request for their branch.
  const staff = await browser.newPage();
  await signIn(staff, "cashier1");
  await staff.goto("/requests");
  await staff.getByRole("combobox", { name: "Search products" }).fill("cecon");
  await staff.getByRole("option", { name: /Cecon 500mg Tab/ }).click();
  await staff.getByRole("button", { name: "Send request" }).click();
  const sent = staff.getByText(/REQ-\d+ sent to central/);
  await expect(sent).toBeVisible();
  const requestNo = /REQ-\d+/.exec((await sent.textContent()) ?? "")?.[0] ?? "";
  expect(requestNo).not.toBe("");

  // The admin approves and fulfills it.
  const admin = await browser.newPage();
  await signIn(admin, "admin");
  await admin.goto("/requests");
  await admin.getByRole("row", { name: new RegExp(requestNo) }).click();
  await admin
    .getByRole("dialog", { name: new RegExp(requestNo) })
    .getByRole("button", { name: "Approve allocation" })
    .click();
  await expect(admin.getByText(`${requestNo} approved`)).toBeVisible();
  await admin.getByRole("button", { name: /^Approved/ }).click();
  await admin.getByRole("row", { name: new RegExp(requestNo) }).click();
  await admin
    .getByRole("dialog", { name: new RegExp(requestNo) })
    .getByRole("button", { name: "Mark fulfilled" })
    .click();
  await expect(admin.getByText(`${requestNo} fulfilled`)).toBeVisible();

  // The cashier sees it fulfilled.
  await staff.reload();
  await expect(staff.getByText(requestNo).first()).toBeVisible();
  await staff.getByText(requestNo).first().click();
  await expect(staff.getByRole("dialog", { name: new RegExp(requestNo) })).toContainText(
    "Fulfilled",
  );
});
