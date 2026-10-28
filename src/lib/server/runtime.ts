import { env } from "cloudflare:workers";
import type { Gif } from "#lib/gif.ts";
import type { AgentModel, Image } from "./agent/model.ts";
import { gemini, openAICompatible } from "./agent/model.ts";
import { scriptedAgent } from "./agent/agent.ts";
import { demoSource, type GifSource, giphySource } from "./sources.ts";

/** GIPHY when a key is configured, the bundled demo clips otherwise. The key never leaves the server. */
export function currentSource(): GifSource {
  const key = env.GIPHY_API_KEY?.trim();
  return key ? giphySource(key) : demoSource();
}

/**
 * The agent's model, from configuration (all server-side; keys are secrets):
 *   AGENT_PROVIDER=gemini  AGENT_MODEL=<a Gemini model with tools and vision>  AGENT_API_KEY=...
 *   AGENT_PROVIDER=openai  AGENT_BASE_URL=<…/v1>  AGENT_MODEL=...  AGENT_API_KEY=... (optional for Ollama)
 *   AGENT_PROVIDER=demo    a scripted stand-in, clearly labelled, for demos and tests
 * Anything else, or missing values: no agent, and the page simply doesn't offer it.
 */
export function currentAgent(): AgentModel | null {
  const provider = env.AGENT_PROVIDER?.trim().toLowerCase();
  const model = env.AGENT_MODEL?.trim();
  const apiKey = env.AGENT_API_KEY?.trim();
  if (provider === "gemini" && model && apiKey) return gemini({ apiKey, model });
  if (provider === "openai" && model && env.AGENT_BASE_URL) {
    return openAICompatible({ baseUrl: env.AGENT_BASE_URL, model, ...(apiKey ? { apiKey } : {}) });
  }
  if (provider === "demo") return scriptedAgent();
  return null;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_IMAGE_BYTES = 1_500_000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Fetches the frame a vision model will look at. Bundled demo frames come straight from the
 * static assets; remote ones must be a reasonable size and a format every vision model accepts.
 */
export async function loadFrame(gif: Gif, origin: string): Promise<Image | null> {
  const url = new URL(gif.vision ?? gif.still, origin);
  try {
    const response =
      url.origin === origin
        ? await env.ASSETS.fetch(new Request(url))
        : await fetch(url, { signal: AbortSignal.timeout(8000) });
    const type = response.headers.get("content-type")?.split(";")[0]?.trim();
    if (!response.ok || !IMAGE_TYPES.includes(type as (typeof IMAGE_TYPES)[number])) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return { mimeType: type as Image["mimeType"], base64: toBase64(bytes) };
  } catch {
    return null;
  }
}
