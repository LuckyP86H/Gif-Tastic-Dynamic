/** Shared by server and browser: the shape of a result and the rules for a search. */
export interface Gif {
  id: string;
  title: string;
  rating: string;
  width: number;
  height: number;
  /** The animation as MP4: what the page actually plays. */
  mp4: string;
  /** A still frame, shown until the clip plays (and always, with reduced motion). */
  still: string;
  /** A JPEG/PNG/WebP frame for a vision model (some models reject GIF stills). */
  vision?: string;
  /** Where the clip lives on its source site, for "open" and "copy link". */
  page: string;
  mp4Bytes: number;
  /** What the same clip costs as a .gif file: the number the bytes meter compares against. */
  gifBytes: number;
}

export interface SearchPage {
  items: Gif[];
  total: number;
  offset: number;
  source: "giphy" | "demo";
}

export const PAGE_SIZE = 10;
/** 100 results is plenty to browse, and a deep link like ?page=10 then costs at most 10 cached calls. */
export const MAX_PAGES = 10;
export const RATINGS = ["g", "pg", "pg-13"] as const;
export type Rating = (typeof RATINGS)[number];

export interface SearchParams {
  q: string;
  rating: Rating;
  page: number;
}

/** Turns untrusted query strings into a valid search. Anything odd falls back to a default. */
export function parseSearch(params: URLSearchParams): SearchParams {
  const q = (params.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 50);
  const rawRating = (params.get("rating") ?? "pg").toLowerCase();
  const rating = (RATINGS as readonly string[]).includes(rawRating) ? (rawRating as Rating) : "pg";
  const rawPage = Number(params.get("page") ?? "1");
  const page = Number.isInteger(rawPage) ? Math.min(Math.max(rawPage, 1), MAX_PAGES) : 1;
  return { q, rating, page };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
