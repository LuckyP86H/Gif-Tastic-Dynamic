<script lang="ts">
import favicon from "#lib/assets/favicon.svg";
import "../app.css";
import type { LayoutProps } from "./$types";

let { children }: LayoutProps = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <meta name="description" content="Find the right GIF fast: search, reactions for any message, and favourites, without the GIF weight." />
</svelte:head>

{@render children()}
