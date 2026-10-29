import { MAX_PAGES, PAGE_SIZE, parseSearch } from "#lib/gif.ts";
import { currentSource } from "#lib/server/runtime.ts";
import { edgeCache, searchPage } from "#lib/server/search.ts";
import type { RequestHandler } from "./$types";

/** One page of results as JSON, for "load more". Same validation and cache as the page itself. */
export const GET: RequestHandler = async ({ url }) => {
  const params = parseSearch(url.searchParams);
  try {
    const result = await searchPage(currentSource(), params, params.page, edgeCache());
    const hasMore =
      result.items.length === PAGE_SIZE &&
      params.page < MAX_PAGES &&
      (params.page - 1) * PAGE_SIZE + result.items.length < result.total;
    return Response.json(
      { items: result.items, hasMore, page: params.page, source: result.source },
      { headers: { "cache-control": "public, max-age=60" } },
    );
  } catch (error) {
    console.error("search failed", error);
    return Response.json({ error: "upstream_unavailable" }, { status: 502 });
  }
};
