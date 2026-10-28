import type { SearchPage, SearchParams } from "#lib/gif.ts";
import { PAGE_SIZE } from "#lib/gif.ts";
import type { GifSource } from "./sources.ts";

/** The slice of the Workers Cache API this module uses, so tests can pass a Map-backed fake. */
export interface PageCache {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
}

/** Searches are cached at the edge for 10 minutes: a popular query costs one API call, not one per visitor. */
const TTL_SECONDS = 600;

/**
 * One page of results, from the edge cache when possible. The cache key is the normalised query
 * (lowercase, single spaces), so "Cats", "cats " and "CATS" share one entry and one API call.
 */
export async function searchPage(
  source: GifSource,
  params: Pick<SearchParams, "q" | "rating">,
  page: number,
  cache: PageCache | null,
): Promise<SearchPage> {
  const offset = (page - 1) * PAGE_SIZE;
  if (!source.cacheable) return source.search(params.q, offset, params.rating);
  const key = new Request(
    `https://cache.giftastic.internal/${source.name}?q=${encodeURIComponent(params.q.toLowerCase())}&rating=${params.rating}&offset=${offset}`,
  );
  const hit = await cache?.match(key);
  if (hit) return (await hit.json()) as SearchPage;
  const result = await source.search(params.q, offset, params.rating);
  await cache?.put(
    key,
    new Response(JSON.stringify(result), {
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${TTL_SECONDS}`,
      },
    }),
  );
  return result;
}

/** The Workers edge cache when running on Cloudflare; none in plain Node (tests, some dev setups). */
export function edgeCache(): PageCache | null {
  const storage = (globalThis as { caches?: { default?: PageCache } }).caches;
  return storage?.default ?? null;
}
