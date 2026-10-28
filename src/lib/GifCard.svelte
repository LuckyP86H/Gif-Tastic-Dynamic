<script lang="ts">
import type { Gif } from "./gif.ts";

interface Props {
  gif: Gif;
  /** False during server rendering and without JavaScript: then the browser's own controls show. */
  enhanced: boolean;
  reducedMotion: boolean;
  favourite: boolean;
  onfavourite: (gif: Gif) => void;
  oncopy: (gif: Gif) => void;
}

let { gif, enhanced, reducedMotion, favourite, onfavourite, oncopy }: Props = $props();

let video: HTMLVideoElement | undefined = $state();
let playing = $state(false);

function play() {
  video
    ?.play()
    .then(() => (playing = true))
    .catch(() => (playing = false));
}
function pause() {
  video?.pause();
  playing = false;
}
// Hover and focus preview the clip, unless the visitor asked their system for less motion.
const preview = () => !reducedMotion && play();
const unpreview = () => !reducedMotion && pause();
</script>

<figure class="card">
  {#if enhanced}
    <button
      class="media"
      aria-pressed={playing}
      aria-label="{playing ? 'Pause' : 'Play'}: {gif.title}"
      onclick={() => (playing ? pause() : play())}
      onpointerenter={preview}
      onpointerleave={unpreview}
      onfocus={preview}
      onblur={unpreview}
    >
      <video
        bind:this={video}
        src={gif.mp4}
        poster={gif.still}
        width={gif.width}
        height={gif.height}
        muted
        loop
        playsinline
        preload="none"
        tabindex="-1"
      ></video>
      {#if !playing}<span class="badge-play" aria-hidden="true">▶</span>{/if}
    </button>
  {:else}
    <video
      class="media"
      src={gif.mp4}
      poster={gif.still}
      width={gif.width}
      height={gif.height}
      muted
      loop
      playsinline
      preload="none"
      controls
    ></video>
  {/if}
  <figcaption>
    <span class="title">{gif.title}</span>
    <span class="meta">
      <span class="rating" title="Content rating">{gif.rating.toUpperCase()}</span>
      {#if enhanced}
        <button
          class="icon"
          aria-pressed={favourite}
          aria-label="{favourite ? 'Remove from' : 'Add to'} favourites: {gif.title}"
          onclick={() => onfavourite(gif)}>{favourite ? "★" : "☆"}</button
        >
        <button class="icon" aria-label="Copy link: {gif.title}" onclick={() => oncopy(gif)}>🔗</button>
      {/if}
      <a class="icon" href={gif.page} target="_blank" rel="noreferrer" aria-label="Open: {gif.title}">↗</a>
    </span>
  </figcaption>
</figure>

<style>
  .card {
    margin: 0;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 1rem;
    overflow: hidden;
  }
  /* Every tile is 4:3 and the clip fills it (object-fit: cover), so rows line up and nothing
     shifts while posters load. */
  .media {
    position: relative;
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    padding: 0;
    border: 0;
    background: var(--line);
    cursor: pointer;
  }
  .media video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .badge-play {
    position: absolute;
    right: 0.5rem;
    bottom: 0.5rem;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
    font-size: 0.85rem;
  }
  /* Title on its own line, actions below: narrow tiles keep a readable title. */
  figcaption {
    display: grid;
    gap: 0.1rem;
    padding: 0.4rem 0.4rem 0.3rem 0.75rem;
    font-size: 0.85rem;
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.1rem;
  }
  .rating {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.1rem 0.35rem;
    border-radius: 0.3rem;
    border: 1px solid var(--line);
    color: var(--muted);
    margin-right: auto;
  }
  .icon {
    display: inline-grid;
    place-items: center;
    min-width: 2.25rem;
    min-height: 2.25rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--ink);
    font-size: 1rem;
    text-decoration: none;
    cursor: pointer;
  }
  .icon:hover {
    background: var(--line);
  }
  .icon[aria-pressed="true"] {
    color: var(--accent);
  }
</style>
