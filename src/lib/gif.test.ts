import { describe, expect, it } from "bun:test";
import { formatBytes, parseSearch } from "./gif.ts";
import { suggestReactions } from "./reactions.ts";
import { type PageCache, searchPage } from "./server/search.ts";
import { demoSource, fromGiphy, giphySource } from "./server/sources.ts";

describe("parseSearch", () => {
  const parse = (query: string) => parseSearch(new URLSearchParams(query));

  it("normalises the query and keeps sensible defaults", () => {
    expect(parse("q=%20%20Big%20%20Bang%20")).toEqual({ q: "Big Bang", rating: "pg", page: 1 });
    expect(parse("")).toEqual({ q: "", rating: "pg", page: 1 });
  });

  it("clamps anything out of range instead of failing", () => {
    expect(parse("page=0").page).toBe(1);
    expect(parse("page=9999").page).toBe(10);
    expect(parse("page=2.5").page).toBe(1);
    expect(parse("rating=r").rating).toBe("pg");
    expect(parse("rating=PG-13").rating).toBe("pg-13");
    expect(parse(`q=${"x".repeat(80)}`).q).toHaveLength(50);
  });
});

describe("formatBytes", () => {
  it("rounds to a readable unit", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024 + 200_000)).toBe("5.2 MB");
  });
});

describe("GIPHY", () => {
  const item = {
    id: "abc",
    title: "Cat Typing GIF",
    rating: "g",
    url: "https://giphy.com/gifs/abc",
    images: {
      fixed_width: {
        url: "https://media.giphy.com/a.gif",
        width: "200",
        height: "150",
        size: "900000",
        mp4: "https://media.giphy.com/a.mp4",
        mp4_size: "90000",
      },
      fixed_width_still: { url: "https://media.giphy.com/a_s.gif" },
    },
  };

  it("maps a result to video, still and both sizes", () => {
    expect(fromGiphy(item)).toEqual({
      id: "abc",
      title: "Cat Typing GIF",
      rating: "g",
      width: 200,
      height: 150,
      mp4: "https://media.giphy.com/a.mp4",
      still: "https://media.giphy.com/a_s.gif",
      page: "https://giphy.com/gifs/abc",
      mp4Bytes: 90000,
      gifBytes: 900000,
    });
  });

  it("drops results without a playable video", () => {
    expect(fromGiphy({ id: "x", images: {} })).toBeNull();
  });

  it("encodes the query (the 2019 version broke on '&') and asks for one page", async () => {
    let seen: URL | undefined;
    const fetchImpl = (async (url: URL) => {
      seen = url;
      return Response.json({ data: [item], pagination: { total_count: 1 } });
    }) as unknown as typeof fetch;
    const page = await giphySource("KEY", fetchImpl).search("rock & roll", 20, "pg");
    expect(seen?.pathname).toBe("/v1/gifs/search");
    expect(seen?.searchParams.get("q")).toBe("rock & roll");
    expect(seen?.searchParams.get("offset")).toBe("20");
    expect(seen?.searchParams.get("limit")).toBe("10");
    expect(page.items).toHaveLength(1);
  });

  it("uses trending when there is no query, and reports API errors", async () => {
    let path = "";
    const ok = (async (url: URL) => {
      path = url.pathname;
      return Response.json({ data: [] });
    }) as unknown as typeof fetch;
    await giphySource("KEY", ok).search("", 0, "g");
    expect(path).toBe("/v1/gifs/trending");
    const failing = (async () => new Response("", { status: 429 })) as unknown as typeof fetch;
    await expect(giphySource("KEY", failing).search("x", 0, "g")).rejects.toThrow(/429/);
  });
});

describe("demo source", () => {
  it("puts matching clips first and pages without repeating an id", async () => {
    const source = demoSource();
    const first = await source.search("mind blown", 0, "pg");
    expect(first.items[0]?.title).toMatch(/Mandelbrot|zone plate/);
    const ids = new Set<string>();
    for (let offset = 0; offset < first.total; offset += 10) {
      for (const gif of (await source.search("mind blown", offset, "pg")).items) ids.add(gif.id);
    }
    expect(ids.size).toBe(first.total);
  });

  it("reports what each clip would cost as a GIF", async () => {
    const { items } = await demoSource().search("", 0, "pg");
    const mp4 = items.reduce((s, g) => s + g.mp4Bytes, 0);
    const gif = items.reduce((s, g) => s + g.gifBytes, 0);
    expect(gif / mp4).toBeGreaterThan(3);
  });
});

describe("searchPage caching", () => {
  it("never caches the bundled demo clips", async () => {
    const { cache, store } = memoryCache();
    await searchPage(demoSource(), { q: "cats", rating: "pg" }, 1, cache);
    expect(store.size).toBe(0);
  });

  function memoryCache() {
    const store = new Map<string, string>();
    const cache: PageCache = {
      async match(key) {
        const body = store.get(key.url);
        return body === undefined ? undefined : new Response(body);
      },
      async put(key, response) {
        store.set(key.url, await response.text());
      },
    };
    return { cache, store };
  }

  it("serves repeat and differently-cased queries from the cache", async () => {
    let calls = 0;
    const source = demoSource();
    const counting = {
      ...source,
      cacheable: true,
      search: (...args: Parameters<typeof source.search>) => {
        calls++;
        return source.search(...args);
      },
    };
    const { cache } = memoryCache();
    await searchPage(counting, { q: "Cats", rating: "pg" }, 1, cache);
    await searchPage(counting, { q: "cats", rating: "pg" }, 1, cache);
    expect(calls).toBe(1);
    await searchPage(counting, { q: "cats", rating: "pg" }, 2, cache);
    await searchPage(counting, { q: "cats", rating: "g" }, 1, cache);
    expect(calls).toBe(3);
  });
});

describe("suggestReactions", () => {
  it("reads the mood of a message and says why", () => {
    const [first] = suggestReactions("ugh, Monday again and I'm so tired");
    expect(first?.id).toBe("tired");
    expect(first?.because).toEqual(expect.arrayContaining(["tired", "monday", "ugh"]));
  });

  it("understands Chinese", () => {
    expect(suggestReactions("恭喜！新版本终于上线了").map((s) => s.id)).toContain("celebrate");
    expect(suggestReactions("服务器又挂了")[0]?.id).toBe("facepalm");
  });

  it("matches whole words only", () => {
    expect(suggestReactions("whatever, I bought a new mower").map((s) => s.id)).not.toContain(
      "confused",
    );
    expect(suggestReactions("Stylish")).toEqual([]);
  });

  it("returns at most three, strongest first", () => {
    const all = suggestReactions(
      "lol thanks so much, congrats on shipping, coffee? wow, sorry, yes",
    );
    expect(all).toHaveLength(3);
    expect(suggestReactions("")).toEqual([]);
  });
});
