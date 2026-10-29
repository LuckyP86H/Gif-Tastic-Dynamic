import { test as base, expect } from "@playwright/test";

/** Every test fails if the page logs a console error or warning, or throws. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
    });
    await use(page);
    expect(problems, "the browser console should stay clean").toEqual([]);
  },
});

export { expect };
