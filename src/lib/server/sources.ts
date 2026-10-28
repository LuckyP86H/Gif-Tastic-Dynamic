import type { Gif, Rating, SearchPage } from "#lib/gif.ts";
import { PAGE_SIZE } from "#lib/gif.ts";
import demoClips from "./demo-clips.json";

/** Anything that can answer "find clips for this query". GIPHY in production, demo clips otherwise. */
export interface GifSource {
  readonly name: SearchPage["source"];
  /** Worth caching at the edge: true for a rate-limited API, false for local files. */
  readonly cacheable: boolean;
  search(q: string, offset: number, rating: Rating): Promise<SearchPage>;
}

interface GiphyRendition {
  url?: string;
  width?: string;
  height?: string;
  size?: string;
  mp4?: string;
  mp4_size?: string;
}
interface GiphyItem {
  id: string;
  title?: string;
  rating?: string;
  url?: string;
  images?: {
    fixed_width?: GiphyRendition;
    fixed_width_still?: GiphyRendition;
    "480w_still"?: GiphyRendition;
  };
}

/** Maps one GIPHY result to our shape, or null if it lacks a playable rendition. */
export function fromGiphy(item: GiphyItem): Gif | null {
  const video = item.images?.fixed_width;
  const still = item.images?.fixed_width_still;
  if (!video?.mp4 || !still?.url) return null;
  return {
    id: item.id,
    title: item.title?.trim() || "Untitled GIF",
    rating: item.rating ?? "g",
    width: Number(video.width) || 200,
    height: Number(video.height) || 200,
    mp4: video.mp4,
    still: still.url,
    ...(item.images?.["480w_still"]?.url ? { vision: item.images["480w_still"].url } : {}),
    page: item.url ?? `https://giphy.com/gifs/${item.id}`,
    mp4Bytes: Number(video.mp4_size) || 0,
    gifBytes: Number(video.size) || 0,
  };
}

export function giphySource(apiKey: string, fetchImpl: typeof fetch = fetch): GifSource {
  return {
    name: "giphy",
    cacheable: true,
    async search(q, offset, rating) {
      const endpoint = q ? "search" : "trending";
      const url = new URL(`https://api.giphy.com/v1/gifs/${endpoint}`);
      url.searchParams.set("api_key", apiKey);
      if (q) url.searchParams.set("q", q); // URLSearchParams encodes "&" and friends: a 2019 bug
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("rating", rating);
      url.searchParams.set("bundle", "messaging_non_clips");
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`GIPHY answered ${response.status}`);
      const body = (await response.json()) as {
        data?: GiphyItem[];
        pagination?: { total_count?: number };
      };
      const items = (body.data ?? []).map(fromGiphy).filter((g): g is Gif => g !== null);
      return {
        items,
        total: body.pagination?.total_count ?? items.length,
        offset,
        source: "giphy",
      };
    },
  };
}

/** How many demo results to pretend exist, so "load more" has something to show. */
const DEMO_TOTAL = 40;

/**
 * Bundled clips for local development, tests and demos. Matching clips come first; the list then
 * cycles, with a numbered id per position so paging behaves like a real API (no duplicate ids).
 */
export function demoSource(): GifSource {
  return {
    name: "demo",
    // Bundled files cost nothing to serve, and caching them would keep stale paths after a redeploy.
    cacheable: false,
    async search(q, offset) {
      const words = q.toLowerCase().split(" ").filter(Boolean);
      const score = (tags: string[], title: string) =>
        words.filter((w) => tags.some((t) => t.includes(w)) || title.toLowerCase().includes(w))
          .length;
      const ranked = [...demoClips].sort((a, b) => score(b.tags, b.title) - score(a.tags, a.title));
      const items: Gif[] = [];
      for (let i = offset; i < Math.min(offset + PAGE_SIZE, DEMO_TOTAL); i++) {
        const clip = ranked[i % ranked.length];
        if (!clip) break;
        const round = Math.floor(i / ranked.length) + 1;
        items.push({
          id: `demo-${clip.slug}-${round}`,
          title: round > 1 ? `${clip.title} (${round})` : clip.title,
          rating: "g",
          width: clip.width,
          height: clip.height,
          mp4: `/demo/${clip.slug}.mp4`,
          still: `/demo/${clip.slug}.jpg`,
          vision: `/demo/${clip.slug}.jpg`,
          page: `/demo/${clip.slug}.mp4`,
          mp4Bytes: clip.mp4Bytes,
          gifBytes: clip.gifBytes,
        });
      }
      return { items, total: DEMO_TOTAL, offset, source: "demo" };
    },
  };
}
