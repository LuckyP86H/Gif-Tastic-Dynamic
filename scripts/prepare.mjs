// Runs after every install. It always syncs SvelteKit's generated types. On Cloudflare Workers
// Builds (which sets WORKERS_CI=1) it also builds the app, so the deploy command finds
// .svelte-kit/cloudflare/_worker.js even when the dashboard's build command is empty.
import { spawnSync } from "node:child_process";

const run = (command, args) =>
  spawnSync(command, args, { stdio: "inherit", shell: true }).status ?? 1;

run("bunx", ["svelte-kit", "sync"]);
if (process.env.WORKERS_CI === "1") process.exit(run("bunx", ["vite", "build"]));
