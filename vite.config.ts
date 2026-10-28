import adapter from "@sveltejs/adapter-cloudflare";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit({
      // Runes everywhere in this project ($state, $derived, $props); libraries keep their own mode.
      compilerOptions: {
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
      },
      adapter: adapter(),
      // SvelteKit adds a hash for its own inline bootstrap script, so script-src can stay 'self'.
      csp: {
        mode: "auto",
        directives: {
          "default-src": ["self"],
          "script-src": ["self"],
          "style-src": ["self", "unsafe-inline"],
          "img-src": ["self", "data:", "https://*.giphy.com"],
          "media-src": ["self", "https://*.giphy.com"],
          "connect-src": ["self"],
          "frame-ancestors": ["none"],
          "base-uri": ["self"],
          "form-action": ["self"],
          "object-src": ["none"],
        },
      },
    }),
  ],
});
