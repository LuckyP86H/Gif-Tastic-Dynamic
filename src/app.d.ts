// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {}

  namespace Cloudflare {
    interface Env {
      /** Secret, optional: without it the app serves the bundled demo clips. */
      GIPHY_API_KEY?: string;
      /** The GIF agent's model (see src/lib/server/runtime.ts). All optional. */
      AGENT_PROVIDER?: string;
      AGENT_MODEL?: string;
      AGENT_BASE_URL?: string;
      AGENT_API_KEY?: string;
    }
  }
}

export {};
