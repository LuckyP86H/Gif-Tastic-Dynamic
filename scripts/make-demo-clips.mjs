// Generates the bundled demo clips (used when no GIPHY key is configured, in tests and in the
// README GIFs). Each clip is rendered three ways so the app can show what GIF really costs:
// an MP4 (what the page plays), a JPEG still (the poster), and a GIF that is measured and then
// deleted (what it would have cost).
//   pnpm demo-clips      (needs ffmpeg with libx264)
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";

const OUT = "static/demo";
const SECONDS = 2.5;
const CLIPS = [
  {
    slug: "mandelbrot",
    title: "Mandelbrot dive",
    tags: ["mind blown", "wow", "trippy", "deep"],
    src: "mandelbrot=s=240x180:rate=15",
    w: 240,
    h: 180,
  },
  {
    slug: "life",
    title: "Game of Life",
    tags: ["busy", "work", "monday", "chaos"],
    src: "life=s=240x240:mold=10:r=15:ratio=0.1:death_color=#1b120c:life_color=#f0a05a",
    w: 240,
    h: 240,
  },
  {
    slug: "testcard",
    title: "Test card",
    tags: ["deploy", "error", "broken", "facepalm"],
    src: "testsrc2=s=240x180:rate=15",
    w: 240,
    h: 180,
  },
  {
    slug: "bars",
    title: "Colour bars",
    tags: ["no signal", "tired", "monday", "offline"],
    src: "smptehdbars=s=240x180:rate=15,hue=H=2*PI*t",
    w: 240,
    h: 180,
  },
  {
    slug: "cells",
    title: "Cellular automaton",
    tags: ["growth", "progress", "thank you", "celebrate"],
    src: "cellauto=s=240x320:rule=110:rate=15",
    w: 240,
    h: 320,
  },
  {
    slug: "sierpinski",
    title: "Sierpinski shimmer",
    tags: ["fancy", "celebrate", "party", "yay"],
    src: "sierpinski=s=240x240:rate=15",
    w: 240,
    h: 240,
  },
  {
    slug: "gradient-sunrise",
    title: "Sunrise gradient",
    tags: ["good morning", "coffee", "calm", "monday"],
    src: "gradients=s=240x320:c0=#1b120c:c1=#f0a05a:c2=#fff4d6:speed=0.05:rate=15",
    w: 240,
    h: 320,
  },
  {
    slug: "gradient-sea",
    title: "Sea gradient",
    tags: ["calm", "relax", "weekend", "thank you"],
    src: "gradients=s=240x180:c0=#0a3d62:c1=#38ada9:c2=#e0f7fa:speed=0.04:rate=15",
    w: 240,
    h: 180,
  },
  {
    slug: "rgb",
    title: "RGB sweep",
    tags: ["party", "dance", "celebrate", "excited"],
    src: "rgbtestsrc=s=240x240:rate=15,hue=h=t*120",
    w: 240,
    h: 240,
  },
  {
    slug: "noise",
    title: "Static noise",
    tags: ["confused", "what", "error", "facepalm"],
    src: "color=c=gray:s=48x36:rate=15,noise=alls=90:allf=t+u,scale=240:180:flags=neighbor",
    w: 240,
    h: 180,
  },
  {
    slug: "bloom",
    title: "Pink bloom",
    tags: ["love", "thank you", "hug", "coffee"],
    src: "life=s=240x240:mold=40:r=15:ratio=0.08:death_color=#2b0f4f:life_color=#ff7ab6",
    w: 240,
    h: 240,
  },
  {
    slug: "spin",
    title: "Spinning zone plate",
    tags: ["dizzy", "mind blown", "deploy", "busy"],
    src: "testsrc=s=240x320:rate=15,rotate=a=t*2:fillcolor=#1b120c",
    w: 240,
    h: 320,
  },
];

const run = (args) => {
  const result = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
};

mkdirSync(OUT, { recursive: true });
const manifest = [];
for (const clip of CLIPS) {
  const input = ["-f", "lavfi", "-t", String(SECONDS), "-i", clip.src];
  const base = `${OUT}/${clip.slug}`;
  run([
    ...input,
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "30",
    "-movflags",
    "+faststart",
    `${base}.mp4`,
  ]);
  run([...input, "-vf", "split[a][b];[a]palettegen[p];[b][p]paletteuse", `${base}.gif`]);
  run([...input, "-frames:v", "1", "-q:v", "4", `${base}.jpg`]);
  manifest.push({
    slug: clip.slug,
    title: clip.title,
    tags: clip.tags,
    width: clip.w,
    height: clip.h,
    mp4Bytes: statSync(`${base}.mp4`).size,
    gifBytes: statSync(`${base}.gif`).size,
  });
  // The GIF only exists to be measured; shipping it would defeat the point.
  rmSync(`${base}.gif`);
}
writeFileSync("src/lib/server/demo-clips.json", `${JSON.stringify(manifest, null, 2)}\n`);
const mp4 = manifest.reduce((s, c) => s + c.mp4Bytes, 0);
const gif = manifest.reduce((s, c) => s + c.gifBytes, 0);
process.stdout.write(
  `${manifest.length} clips: MP4 ${Math.round(mp4 / 1024)} KiB vs GIF ${Math.round(gif / 1024)} KiB\n`,
);
