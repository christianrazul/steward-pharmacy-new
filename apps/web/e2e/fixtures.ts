import { test as base, expect } from "@playwright/test";

/**
 * Every end-to-end test fails if the page logs a console error or throws.
 * The definition of done requires no console errors in the browser.
 */
export const test = base.extend<{ failOnConsoleErrors: undefined }>({
  failOnConsoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => {
        errors.push(error.message);
      });
      await use(undefined);
      expect(errors, "console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
