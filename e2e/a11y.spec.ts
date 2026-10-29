import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./support";

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("results, reactions and favourites have no WCAG A/AA violations", async ({ page }) => {
      const scan = async () =>
        new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
      await page.goto("/?q=coffee");
      await page.getByLabel("Paste the message you're replying to").fill("thanks so much, lol");
      await page
        .getByTestId("results")
        .locator("li")
        .first()
        .getByRole("button", { name: /^Add to favourites/ })
        .click();
      await expect(page.getByRole("region", { name: /Your favourites/ })).toBeVisible();
      await page.getByRole("button", { name: /Let the agent pick/ }).click();
      await expect(page.getByTestId("agent").getByText("✅ Picked 3")).toBeVisible();
      expect((await scan()).violations).toEqual([]);
    });
  });
}

test("fits a 320px screen without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/?q=cats");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
