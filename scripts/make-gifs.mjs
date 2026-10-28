// Records the README GIFs from the real app: starts a local dev server, drives it with
// Playwright, takes a screenshot per step, then stitches the frames with ffmpeg.
//   pnpm gifs        (needs ffmpeg on the PATH)
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const PORT = 8792; // not 4190: that is on the fetch spec's list of blocked ports
// 127.0.0.1, not localhost: Node may resolve localhost to IPv6 while Wrangler listens on IPv4.
const BASE = `http://127.0.0.1:${PORT}`;
const SIZE = { width: 900, height: 760 };
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;

mkdirSync("docs", { recursive: true });

// Records against the production build in the Workers runtime, with the bundled demo clips.
spawnSync("bun", ["run", "build"], { stdio: "ignore" });
const server = spawn(
  "bunx",
  ["wrangler", "dev", "--port", String(PORT), "--var", "AGENT_PROVIDER:demo"],
  {
    stdio: "ignore",
    detached: true,
  },
);
const stop = () => {
  try {
    process.kill(-server.pid);
  } catch {}
};
process.on("exit", stop);

for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${BASE}/`)).ok) break;
  } catch {}
  if (i > 120) throw new Error("dev server did not start");
  await new Promise((resolve) => setTimeout(resolve, 500));
}

const browser = await chromium.launch({ executablePath });

/** A recorder: `shot(caption, seconds)` saves a frame; `save(name)` writes docs/<name>.gif. */
function recorder(page) {
  const dir = mkdtempSync(join(tmpdir(), "frames-"));
  const frames = [];
  return {
    async shot(caption, seconds = 1.4) {
      // Let htmx's view transition finish, or the frame catches two pages cross-fading.
      await page.waitForTimeout(600);
      await page.evaluate((text) => {
        document.getElementById("gif-caption")?.remove();
        const el = document.createElement("div");
        el.id = "gif-caption";
        el.textContent = text;
        el.setAttribute(
          "style",
          "position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99;" +
            "padding:8px 16px;border-radius:999px;background:#1d1530;color:#f1ecff;" +
            "font:600 15px system-ui,sans-serif;box-shadow:0 4px 14px #0006;white-space:nowrap",
        );
        document.body.append(el);
      }, caption);
      const file = join(dir, `${String(frames.length).padStart(3, "0")}.png`);
      await page.screenshot({ path: file });
      frames.push({ file, seconds });
    },
    save(name) {
      const list = frames
        .map((f) => `file '${f.file}'\nduration ${f.seconds}`)
        .concat(`file '${frames.at(-1).file}'`)
        .join("\n");
      const listFile = join(dir, "frames.txt");
      writeFileSync(listFile, list);
      const filter =
        "fps=8,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4";
      const result = spawnSync(
        "ffmpeg",
        [
          "-y",
          "-loglevel",
          "error",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listFile,
          "-vf",
          filter,
          `docs/${name}.gif`,
        ],
        { stdio: "inherit" },
      );
      if (result.status !== 0) throw new Error("ffmpeg failed");
      process.stdout.write(`wrote docs/${name}.gif\n`);
    },
  };
}

async function newPage({ javaScriptEnabled = true } = {}) {
  const context = await browser.newContext({
    viewport: SIZE,
    javaScriptEnabled,
    bypassCSP: true, // only so the recorder can overlay a caption; the app itself is unchanged
    colorScheme: "light",
  });
  return context.newPage();
}

// 1. Search, watch a clip play, load more, and see the weight saved.
{
  const page = await newPage();
  const rec = recorder(page);
  await page.goto(BASE);
  await rec.shot("Trending, as light video clips", 1.6);
  await page.getByRole("searchbox", { name: "Search GIFs" }).fill("mind blown");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("heading", { level: 2, name: "“mind blown”" }).waitFor();
  await rec.shot("Search", 1.4);
  const first = page
    .getByTestId("results")
    .locator("li")
    .first()
    .getByRole("button", { name: /^Play:/ });
  await first.hover();
  for (let i = 0; i < 4; i++) await rec.shot("Hover to preview", 0.35);
  await page.mouse.move(0, 0);
  await page.getByRole("link", { name: "Load 10 more" }).click();
  await page.getByTestId("results").locator("li").nth(19).waitFor();
  await page.getByTestId("meter").scrollIntoViewIfNeeded();
  await rec.shot("10 more, added below, not replaced", 1.6);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId("meter").scrollIntoViewIfNeeded();
  await rec.shot("Video instead of GIF: about 10x lighter", 2.4);
  rec.save("search-and-more");
  await page.context().close();
}

// 2. Paste a message, get reactions, and see why.
{
  const page = await newPage();
  const rec = recorder(page);
  await page.goto(BASE);
  const box = page.getByLabel("Paste the message you're replying to");
  await box.scrollIntoViewIfNeeded();
  await rec.shot("Replying to a message?", 1.4);
  await box.fill("ugh, Monday again. so tired");
  await rec.shot("It reads the mood, and says why", 2.4);
  await box.fill("恭喜！新版本终于上线了 🎉");
  await rec.shot("Chinese works too", 2.4);
  await page.locator(".suggestions").getByRole("link", { name: "celebrate", exact: true }).click();
  await page.getByRole("heading", { level: 2, name: "“celebrate”" }).waitFor();
  await rec.shot("One tap to the right reactions", 2);
  rec.save("reactions");
  await page.context().close();
}

// 3. The agent: watch it search, look and pick (the scripted demo agent, labelled as such).
{
  const page = await newPage();
  const rec = recorder(page);
  await page.goto(BASE);
  const box = page.getByLabel("Paste the message you're replying to");
  await box.scrollIntoViewIfNeeded();
  await box.fill("We finally shipped the release!! 🎉");
  await rec.shot("Paste a message, ask the agent", 1.6);
  await page.getByRole("button", { name: /Let the agent pick/ }).click();
  const panel = page.getByTestId("agent");
  await panel.getByText(/Searched/).waitFor();
  await rec.shot("It searches…", 1.0);
  await panel.getByText(/Looked at/).waitFor();
  await rec.shot("…looks at the frames…", 1.0);
  await panel.getByText(/Picked/).waitFor();
  await panel.scrollIntoViewIfNeeded();
  await rec.shot("…and picks, with reasons and alt text", 3);
  rec.save("agent");
  await page.context().close();
}

await browser.close();
stop();
