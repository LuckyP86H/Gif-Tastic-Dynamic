// Regenerates worker-configuration.d.ts so it is the same whether or not the app was built first.
// `wrangler types` adds a `mainModule` (and an empty GlobalProps interface) only when the Worker
// entry file exists, and its hash changes with it. CI runs this before the build, so both are
// removed here; SvelteKit apps don't use them.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "worker-configuration.d.ts";
const wrangler = spawnSync("bunx", ["wrangler", "types"], { stdio: "inherit", shell: true });
if (wrangler.status !== 0) process.exit(wrangler.status ?? 1);

const normalised = readFileSync(FILE, "utf8")
  .replace(/^\s*mainModule: typeof import\(.*\);\n/m, "")
  // Only the empty block inside `namespace Cloudflare` (present after a build); the runtime section
  // keeps its own `GlobalProps`, which the GlobalProp type needs.
  .replace(/^\tinterface GlobalProps \{\n\t\}\n/m, "")
  .replace(/ \(hash: [0-9a-f]+\)/, "");
writeFileSync(FILE, normalised);
