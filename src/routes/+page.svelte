<script lang="ts">
import { onDestroy, onMount, untrack } from "svelte";
import { type AgentEvent, describe, type Pick } from "#lib/agent-events.ts";
import GifCard from "#lib/GifCard.svelte";
import { formatBytes, type Gif, RATINGS } from "#lib/gif.ts";
import { preferences } from "#lib/preferences.svelte.ts";
import { suggestReactions } from "#lib/reactions.ts";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

let enhanced = $state(false);
let reducedMotion = $state(false);
let announcement = $state("");
let newTopic = $state("");
// Starts from the server's value and is not reassigned on mount: anything typed before the
// JavaScript finished loading must survive hydration.
let message = $state(untrack(() => data.react));
let loadingMore = $state(false);
let loadError = $state("");

// Results added by "load more" belong to one search; a new search starts from the server's page.
const searchKey = $derived(`${data.q}|${data.rating}|${data.page}`);
let more = $state<{ key: string; items: Gif[]; page: number; hasMore: boolean } | null>(null);
const current = $derived(more?.key === searchKey ? more : null);
const items = $derived(dedupe([...data.items, ...(current?.items ?? [])]));
const hasMore = $derived(current ? current.hasMore : data.hasMore);
const lastPage = $derived(current?.page ?? data.page);

// As you type, suggestions update in the browser; without JavaScript the form asks the server.
const suggestions = $derived(enhanced ? suggestReactions(message) : data.suggestions);
const weight = $derived({
  mp4: items.reduce((s, g) => s + g.mp4Bytes, 0),
  gif: items.reduce((s, g) => s + g.gifBytes, 0),
});

// The GIF agent: an EventSource streams each step, so you watch it search, look and choose.
let agentRun = $state<{ status: "idle" | "running" | "done" | "error"; steps: string[]; picks: Pick[] }>({
  status: "idle",
  steps: [],
  picks: [],
});
let events: EventSource | null = null;
const canAsk = $derived(enhanced && data.agent !== null && message.trim().length >= 2);

function askAgent() {
  events?.close();
  agentRun = { status: "running", steps: [], picks: [] };
  const params = new URLSearchParams({ message, rating: data.rating });
  events = new EventSource(`/api/agent?${params}`);
  events.onmessage = (e) => {
    const event = JSON.parse(e.data) as AgentEvent;
    agentRun.steps.push(describe(event));
    if (event.type === "done") {
      agentRun.picks = event.picks;
      agentRun.status = "done";
      announcement = `The agent picked ${event.picks.length} clips.`;
      events?.close();
    } else if (event.type === "error") {
      agentRun.status = "error";
      events?.close();
    }
  };
  // EventSource retries on its own; a closed or failed stream should just stop.
  events.onerror = () => {
    if (agentRun.status === "running") {
      agentRun.status = "error";
      agentRun.steps.push("⚠️ The agent is unavailable right now.");
    }
    events?.close();
  };
}
onDestroy(() => events?.close());

async function copyAlt(pick: Pick) {
  try {
    await navigator.clipboard.writeText(pick.alt);
    announcement = "Alt text copied.";
  } catch {
    announcement = "Couldn't copy. Select the text instead.";
  }
}

function dedupe(list: Gif[]) {
  const seen = new Set<string>();
  return list.filter((g) => !seen.has(g.id) && seen.add(g.id));
}

const href = (q: string) => {
  const params = new URLSearchParams({ q });
  if (data.rating !== "pg") params.set("rating", data.rating);
  return `/?${params}`;
};

onMount(() => {
  preferences.load();
  const query = matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion = query.matches;
  query.addEventListener("change", (e) => (reducedMotion = e.matches));
  enhanced = true;
});

async function loadMore(event: MouseEvent) {
  event.preventDefault();
  if (loadingMore) return;
  loadingMore = true;
  loadError = "";
  const next = lastPage + 1;
  const params = new URLSearchParams({ q: data.q, rating: data.rating, page: String(next) });
  try {
    const response = await fetch(`/api/search?${params}`);
    if (!response.ok) throw new Error(String(response.status));
    const body = (await response.json()) as { items: Gif[]; hasMore: boolean };
    more = {
      key: searchKey,
      items: [...(current?.items ?? []), ...body.items],
      page: next,
      hasMore: body.hasMore,
    };
    announcement = `${body.items.length} more loaded, ${items.length} in total.`;
    // Keep the address in step, so a reload or a shared link shows the same results.
    const url = new URL(page.url.href);
    url.searchParams.set("page", String(next));
    await goto(url, { shallow: true, replace: true, reset: false });
  } catch {
    loadError = "Couldn't load more. Try again.";
  } finally {
    loadingMore = false;
  }
}

function addTopic(event: SubmitEvent) {
  event.preventDefault();
  if (preferences.addTopic(newTopic)) announcement = `Added topic ${newTopic.trim()}.`;
  newTopic = "";
}

async function copy(gif: Gif) {
  const link = new URL(gif.page, page.url.origin).href;
  try {
    await navigator.clipboard.writeText(link);
    announcement = `Link copied: ${gif.title}`;
  } catch {
    announcement = "Couldn't copy. Use the open link instead.";
  }
}

function favourite(gif: Gif) {
  const was = preferences.isFavourite(gif.id);
  preferences.toggleFavourite(gif);
  announcement = was
    ? `Removed ${gif.title} from favourites.`
    : `Saved ${gif.title} to favourites.`;
}
</script>

<svelte:head>
  <title>{data.q ? `${data.q} · GifTastic` : "GifTastic"}</title>
</svelte:head>

<div class="page">
  <header>
    <h1><span aria-hidden="true">🎞️</span> GifTastic</h1>
    <p class="muted">The right reaction, fast. Plays as video, so it's a fraction of the weight.</p>
  </header>

  <form class="search" method="get" action="/" role="search">
    <label class="sr-only" for="q">Search GIFs</label>
    <input id="q" name="q" type="search" value={data.q} placeholder="Search GIFs" maxlength="50" autocomplete="off" />
    <label class="sr-only" for="rating">Content rating</label>
    <select id="rating" name="rating" value={data.rating}>
      {#each RATINGS as rating (rating)}
        <option value={rating}>{rating.toUpperCase()}</option>
      {/each}
    </select>
    <button type="submit">Search</button>
  </form>

  <nav aria-label="Topics" class="topics">
    {#each preferences.topics as topic (topic)}
      <span class="chip" class:active={topic.toLowerCase() === data.q.toLowerCase()}>
        <a href={href(topic)}>{topic}</a>
        {#if enhanced}
          <button class="remove" aria-label="Remove topic {topic}" onclick={() => preferences.removeTopic(topic)}>×</button>
        {/if}
      </span>
    {/each}
    {#if enhanced}
      <form class="add-topic" onsubmit={addTopic}>
        <label class="sr-only" for="new-topic">New topic</label>
        <input id="new-topic" bind:value={newTopic} placeholder="Add a topic" maxlength="40" />
        <button type="submit" aria-label="Add topic">+</button>
      </form>
    {/if}
  </nav>

  <section class="react" aria-labelledby="react-title">
    <h2 id="react-title">Reply with a reaction</h2>
    <form method="get" action="/">
      <label for="react">Paste the message you're replying to</label>
      <div class="react-row">
        <textarea id="react" name="react" rows="2" maxlength="500" placeholder="ugh, Monday again… / 恭喜！上线了" bind:value={message}></textarea>
        {#if !enhanced}<button type="submit">Suggest</button>{/if}
      </div>
    </form>
    {#if enhanced && data.agent}
    <div class="agent-row">
      <button type="button" class="agent-button" onclick={askAgent} disabled={!canAsk || agentRun.status === "running"}>
        ✨ {agentRun.status === "running" ? "The agent is picking…" : "Let the agent pick"}
      </button>
      <span class="muted small">
        {data.agent.demo ? "Demo mode: a scripted stand-in, not a real model." : "A vision model searches, looks at the clips, and picks."}
      </span>
    </div>
  {/if}
  {#if suggestions.length}
      <ul class="suggestions" aria-live="polite">
        {#each suggestions as s (s.id)}
          <li>
            <span class="feeling"><span aria-hidden="true">{s.emoji}</span> {s.label}</span>
            {#each s.queries as q (q)}
              <a class="chip-link" href={href(q)}>{q}</a>
            {/each}
            <span class="because">because you wrote “{s.because.join("”, “")}”</span>
          </li>
        {/each}
      </ul>
    {:else if message.trim() || data.react}
      <p class="muted">No strong mood found. Try a search instead.</p>
    {/if}
  </section>

  {#if agentRun.status !== "idle"}
  <section class="agent-panel" aria-labelledby="agent-title" data-testid="agent">
    <h2 id="agent-title">✨ The agent's picks</h2>
    <ol class="agent-log" aria-live="polite">
      {#each agentRun.steps as step, i (i)}
        <li>{step}</li>
      {/each}
    </ol>
    {#if agentRun.picks.length}
      <ul class="grid picks">
        {#each agentRun.picks as pick (pick.gif.id)}
          <li>
            <GifCard
              gif={pick.gif}
              {enhanced}
              {reducedMotion}
              favourite={preferences.isFavourite(pick.gif.id)}
              onfavourite={favourite}
              oncopy={copy}
            />
            <p class="why">{pick.why}</p>
            <p class="alt"><span class="muted">Alt text:</span> {pick.alt}</p>
            <button type="button" class="link-button" onclick={() => copyAlt(pick)}>Copy alt text</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<main>
    <div class="results-head">
      <h2>{data.q ? `“${data.q}”` : "Trending"}</h2>
      {#if items.length && weight.gif > 0}
        <p class="meter" data-testid="meter">
          These {items.length} clips weigh <strong>{formatBytes(weight.mp4)}</strong> as video, instead of
          {formatBytes(weight.gif)} as GIF: <strong>{Math.max(1, Math.round(weight.gif / Math.max(weight.mp4, 1)))}× lighter</strong>.
        </p>
      {/if}
    </div>

    {#if data.error}
      <p class="error" role="alert">{data.error}</p>
    {:else if !items.length}
      <p class="muted">Nothing found for “{data.q}”. Try another word.</p>
    {/if}

    <ul class="grid" data-testid="results">
      {#each items as gif (gif.id)}
        <li>
          <GifCard
            {gif}
            {enhanced}
            {reducedMotion}
            favourite={preferences.isFavourite(gif.id)}
            onfavourite={favourite}
            oncopy={copy}
          />
        </li>
      {/each}
    </ul>

    {#if hasMore}
      <div class="more">
        <a class="button" href="/?{new URLSearchParams({ q: data.q, rating: data.rating, page: String(lastPage + 1) })}" onclick={loadMore} aria-disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load 10 more"}
        </a>
        {#if loadError}<p class="error" role="alert">{loadError}</p>{/if}
      </div>
    {/if}
  </main>

  {#if enhanced && preferences.favourites.length}
    <section class="favourites" aria-labelledby="fav-title">
      <h2 id="fav-title">★ Your favourites <span class="muted">({preferences.favourites.length})</span></h2>
      <ul class="grid">
        {#each preferences.favourites as gif (gif.id)}
          <li>
            <GifCard {gif} {enhanced} {reducedMotion} favourite={true} onfavourite={favourite} oncopy={copy} />
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <footer class="muted">
    {#if data.source === "giphy"}
      <p>Powered by <a href="https://giphy.com" rel="noreferrer">GIPHY</a>.</p>
    {:else}
      <p data-testid="demo-notice">Showing built-in demo clips. Add a GIPHY key to search the real catalogue.</p>
    {/if}
    <p>Rebuilt in 2026 from a 2019 bootcamp project · <a href="https://github.com/LuckyP86H/Gif-Tastic-Dynamic">Source</a></p>
  </footer>

  <p class="sr-only" aria-live="polite">{announcement}</p>
</div>

<style>
  .page { max-width: 72rem; margin: 0 auto; padding: 1rem 1rem 3rem; }
  h1 { margin: 0.5rem 0 0; font-size: 2rem; letter-spacing: -0.02em; }
  h2 { font-size: 1.15rem; margin: 0 0 0.5rem; }
  .muted { color: var(--muted); }
  input, select, textarea, button { font: inherit; color: inherit; }
  input, select, textarea {
    min-height: 2.75rem; padding: 0.5rem 0.75rem; border: 1px solid var(--line); border-radius: 0.75rem; background: var(--surface);
  }
  button, .button {
    min-height: 2.75rem; padding: 0.5rem 1rem; border: 0; border-radius: 0.75rem; font-weight: 600;
    background: var(--accent); color: var(--accent-ink); cursor: pointer; text-decoration: none; display: inline-flex; align-items: center;
  }
  .search { display: grid; grid-template-columns: 1fr auto auto; gap: 0.5rem; margin: 1rem 0; }
  /* A search input has an intrinsic width; without min-width: 0 it pushes the grid off a small screen. */
  .search input { min-width: 0; width: 100%; }
  .topics { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-bottom: 1rem; }
  .chip { display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); }
  .chip a { padding: 0.45rem 0.8rem; text-decoration: none; color: var(--ink); min-height: 2.25rem; display: inline-flex; align-items: center; }
  .chip.active { border-color: var(--accent); }
  .chip.active a { color: var(--accent); font-weight: 600; }
  .chip .remove { min-height: 2.25rem; min-width: 2rem; padding: 0 0.5rem 0 0.25rem; background: transparent; color: var(--muted); justify-content: center; }
  .add-topic { display: inline-flex; gap: 0.25rem; }
  .add-topic input { width: 9rem; min-height: 2.25rem; padding: 0.25rem 0.6rem; border-radius: 999px; }
  .add-topic button { min-height: 2.25rem; padding: 0 0.8rem; border-radius: 999px; }
  .react { background: var(--surface); border: 1px solid var(--line); border-radius: 1rem; padding: 1rem; margin-bottom: 1.5rem; }
  .react label { display: block; font-weight: 600; margin-bottom: 0.4rem; }
  .react-row { display: flex; gap: 0.5rem; }
  .react textarea { flex: 1; resize: vertical; }
  .suggestions { list-style: none; padding: 0; margin: 0.75rem 0 0; display: grid; gap: 0.5rem; }
  .suggestions li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
  .feeling { font-weight: 600; min-width: 8.5rem; }
  .chip-link { padding: 0.3rem 0.7rem; border-radius: 999px; background: var(--accent); color: var(--accent-ink); text-decoration: none; font-weight: 600; font-size: 0.9rem; }
  .because { font-size: 0.85rem; color: var(--muted); }
  .agent-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-top: 0.75rem; }
  .agent-button:disabled { opacity: 0.55; cursor: not-allowed; }
  .small { font-size: 0.85rem; }
  .agent-panel {
    margin-bottom: 1.5rem; padding: 1rem; border-radius: 1rem; border: 2px solid var(--accent);
    background: color-mix(in oklab, var(--accent) 6%, var(--surface));
  }
  .agent-log { margin: 0 0 0.75rem; padding-left: 1.2rem; display: grid; gap: 0.15rem; font-size: 0.9rem; }
  .picks .why { margin: 0.4rem 0 0.1rem; font-weight: 600; }
  .picks .alt { margin: 0; font-size: 0.85rem; }
  .link-button { background: transparent; color: var(--accent); padding: 0.25rem 0; min-height: 2.25rem; text-decoration: underline; }
  .results-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
  .meter { margin: 0 0 0.75rem; font-size: 0.9rem; color: var(--muted); }
  /* A grid in reading order (not CSS columns, which fill top to bottom and put the second-best
     result under the first): what you see left to right is what a screen reader hears. */
  .grid { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(min(13rem, 100%), 1fr)); }
  .more { display: grid; justify-items: center; gap: 0.5rem; margin-top: 1rem; }
  .error { color: var(--danger); font-weight: 600; }
  .favourites { margin-top: 2.5rem; }
  footer { margin-top: 2.5rem; font-size: 0.9rem; }
  @media (max-width: 30rem) {
    .search { grid-template-columns: 1fr auto; }
    .search button { grid-column: 1 / -1; }
    .react-row { flex-direction: column; }
  }
</style>
