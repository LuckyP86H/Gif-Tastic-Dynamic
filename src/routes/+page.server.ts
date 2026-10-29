import { MAX_PAGES, PAGE_SIZE, parseSearch } from "#lib/gif.ts";
import { suggestReactions } from "#lib/reactions.ts";
import { currentAgent, currentSource } from "#lib/server/runtime.ts";
import { edgeCache, searchPage } from "#lib/server/search.ts";
import type { PageServerLoad } from "./$types";

/**
 * Renders the first `page` pages on the server, so a shared link or a browser without JavaScript
 * shows the same results. With JavaScript, "load more" fetches one page at a time from /api/search.
 */
export const load: PageServerLoad = async ({ url }) => {
  const params = parseSearch(url.searchParams);
  const source = currentSource();
  const cache = edgeCache();
  const react = (url.searchParams.get("react") ?? "").slice(0, 500);
  const agentModel = currentAgent();
  // The page only needs to know whether an agent exists and whether it is the scripted demo.
  const agent = agentModel ? { demo: agentModel.id.startsWith("demo:") } : null;
  try {
    const pages = await Promise.all(
      Array.from({ length: params.page }, (_, i) => searchPage(source, params, i + 1, cache)),
    );
    const seen = new Set<string>();
    const items = pages.flatMap((p) => p.items).filter((g) => !seen.has(g.id) && seen.add(g.id));
    const total = pages[0]?.total ?? 0;
    const lastFull = (pages.at(-1)?.items.length ?? 0) === PAGE_SIZE;
    return {
      ...params,
      items,
      total,
      hasMore: lastFull && items.length < total && params.page < MAX_PAGES,
      source: source.name,
      react,
      suggestions: suggestReactions(react),
      agent,
      error: null as string | null,
    };
  } catch (error) {
    console.error("search failed", error);
    return {
      ...params,
      items: [],
      total: 0,
      hasMore: false,
      source: source.name,
      react,
      suggestions: suggestReactions(react),
      agent,
      error: "The GIF service didn't answer. Try again in a moment.",
    };
  }
};
