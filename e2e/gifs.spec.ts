import type { Page } from "@playwright/test";
import { expect, test } from "./support";

const results = (page: Page) => page.getByTestId("results").locator("li");

async function search(page: Page, q: string) {
  await page.getByRole("searchbox", { name: "Search GIFs" }).fill(q);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: `“${q}”` })).toBeVisible();
}

test("opens on trending clips, with the demo notice when no key is set", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "Trending" })).toBeVisible();
  await expect(results(page)).toHaveCount(10);
  await expect(page.getByTestId("demo-notice")).toBeVisible();
});

test("search, then load 10 more without losing the first 10", async ({ page }) => {
  await page.goto("/");
  await search(page, "mind blown");
  await expect(results(page)).toHaveCount(10);
  const first = await results(page).first().getByRole("figure").textContent();

  await page.getByRole("link", { name: "Load 10 more" }).click();
  await expect(results(page)).toHaveCount(20);
  await expect(results(page).first().getByRole("figure")).toHaveText(first ?? "");
  await expect(page).toHaveURL(/page=2/);

  // The address now describes what is on screen, so a reload shows the same 20.
  await page.reload();
  await expect(results(page)).toHaveCount(20);
});

test("shows how much lighter video is than GIF", async ({ page }) => {
  await page.goto("/?q=celebrate");
  await expect(page.getByTestId("meter")).toContainText(
    /These 10 clips weigh\s+[\d.]+ [KM]?B\s+as video, instead of\s+[\d.]+ [KM]?B\s+as GIF: \d+× lighter/,
  );
});

test("hovering previews a clip, and clicking toggles it", async ({ page, isMobile }) => {
  test.skip(isMobile, "no hover on touch screens");
  await page.goto("/?q=celebrate");
  const card = results(page).first();
  const video = card.locator("video");
  await card.getByRole("button", { name: /^Play:/ }).hover();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await page.mouse.move(0, 0);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing moves until you ask", async ({ page }) => {
    await page.goto("/?q=celebrate");
    const card = results(page).first();
    const video = card.locator("video");
    const button = card.getByRole("button", { name: /^Play:/ });
    await button.hover();
    await page.waitForTimeout(300);
    expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await button.click();
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
    await expect(card.getByRole("button", { name: /^Pause:/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

test("favourites stay after a reload", async ({ page }) => {
  await page.goto("/?q=coffee");
  const title = (await results(page).first().locator(".title").textContent()) ?? "";
  await results(page)
    .first()
    .getByRole("button", { name: /^Add to favourites/ })
    .click();
  const favourites = page.getByRole("region", { name: /Your favourites/ });
  await expect(favourites).toContainText(title);
  await page.reload();
  await expect(favourites).toContainText(title);
  await favourites.getByRole("button", { name: /^Remove from favourites/ }).click();
  await expect(favourites).toBeHidden();
});

test("add and remove your own topics", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("New topic").fill("Deploy Friday");
  await page.getByRole("button", { name: "Add topic" }).click();
  const topics = page.getByRole("navigation", { name: "Topics" });
  await expect(topics.getByRole("link", { name: "Deploy Friday" })).toBeVisible();
  await page.reload();
  await topics.getByRole("link", { name: "Deploy Friday" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "“Deploy Friday”" })).toBeVisible();
  await topics.getByRole("button", { name: "Remove topic Deploy Friday" }).click();
  await expect(topics.getByRole("link", { name: "Deploy Friday" })).toBeHidden();
});

test("paste a message, get reaction searches, and see why", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Paste the message you're replying to").fill("ugh, Monday again. so tired");
  const suggestion = page.getByRole("listitem").filter({ hasText: "Tired" });
  await expect(suggestion).toContainText("because you wrote");
  await expect(suggestion).toContainText("monday");
  await suggestion.getByRole("link", { name: "tired" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "“tired”" })).toBeVisible();
});

test("copies a link to the clip", async ({ page, context, isMobile }) => {
  test.skip(isMobile, "clipboard permissions are desktop-only in Playwright");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?q=party");
  await results(page)
    .first()
    .getByRole("button", { name: /^Copy link/ })
    .click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^http:\/\/localhost:\d+\/demo\/.+\.mp4$/);
});

test.describe("with JavaScript turned off", () => {
  test.use({ javaScriptEnabled: false });

  test("search, browse, load more and get reactions with plain forms and links", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("searchbox", { name: "Search GIFs" }).fill("cats");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(results(page)).toHaveCount(10);
    await expect(results(page).first().locator("video")).toHaveAttribute("controls", "");
    await page.getByRole("link", { name: "Load 10 more" }).click();
    await expect(results(page)).toHaveCount(20);

    await page.getByLabel("Paste the message you're replying to").fill("恭喜！终于上线了");
    await page.getByRole("button", { name: "Suggest" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Celebrate" })).toBeVisible();
  });
});

test("text typed before the JavaScript loads is kept", async ({ page }) => {
  // Hold the app's scripts back, so the visitor types into the server-rendered page first.
  await page.route("**/_app/immutable/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await page.goto("/", { waitUntil: "commit" });
  const box = page.getByLabel("Paste the message you're replying to");
  await box.fill("thanks so much!");
  // Hydration has finished once the JS-only "add topic" form appears.
  await expect(page.getByLabel("New topic")).toBeVisible();
  await expect(box).toHaveValue("thanks so much!");
  await expect(page.getByRole("listitem").filter({ hasText: "Thank you" })).toBeVisible();
});

test("the agent streams its steps and picks clips with reasons and alt text", async ({ page }) => {
  await page.goto("/");
  const ask = page.getByRole("button", { name: /Let the agent pick/ });
  await expect(ask).toBeDisabled();
  await page.getByLabel("Paste the message you're replying to").fill("ugh, Monday again. so tired");
  await expect(page.getByText("Demo mode: a scripted stand-in, not a real model.")).toBeVisible();
  await ask.click();

  const panel = page.getByTestId("agent");
  await expect(panel.getByRole("listitem").filter({ hasText: "Searched “tired”" })).toBeVisible();
  await expect(panel.getByText(/Looked at 4 frames/)).toBeVisible();
  await expect(panel.getByText("✅ Picked 3")).toBeVisible();
  await expect(panel.locator(".picks > li")).toHaveCount(3);
  await expect(panel.locator(".alt").first()).toContainText("Alt text:");
});

test("the agent API rejects empty or oversized messages", async ({ request }) => {
  expect((await request.get("/api/agent?message=")).status()).toBe(400);
  expect((await request.get(`/api/agent?message=${"x".repeat(501)}`)).status()).toBe(400);
});
