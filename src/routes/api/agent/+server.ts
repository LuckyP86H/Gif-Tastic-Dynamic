import { parseSearch } from "#lib/gif.ts";
import type { AgentEvent } from "#lib/agent-events.ts";
import { runAgent } from "#lib/server/agent/agent.ts";
import { currentAgent, currentSource, loadFrame } from "#lib/server/runtime.ts";
import { edgeCache, searchPage } from "#lib/server/search.ts";
import type { RequestHandler } from "./$types";

/** A finished run is replayed from the edge cache for a day: the same message never costs twice. */
const RESULT_TTL_SECONDS = 86_400;

/**
 * Runs the GIF agent and streams each step as Server-Sent Events, so the page can show the agent
 * working ("searching…", "looking at 4 clips…") instead of a spinner.
 */
export const GET: RequestHandler = async ({ url }) => {
  const model = currentAgent();
  if (!model) return Response.json({ error: "agent_unavailable" }, { status: 404 });
  const message = (url.searchParams.get("message") ?? "").replace(/\s+/g, " ").trim();
  if (message.length < 2 || message.length > 500) {
    return Response.json({ error: "message_length" }, { status: 400 });
  }
  const { rating } = parseSearch(url.searchParams);
  const source = currentSource();
  const cache = edgeCache();
  const cacheKey = new Request(
    `https://cache.giftastic.internal/agent?model=${encodeURIComponent(model.id)}&source=${source.name}&rating=${rating}&m=${encodeURIComponent(message.toLowerCase())}`,
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        const hit = await cache?.match(cacheKey);
        if (hit) {
          for (const event of (await hit.json()) as AgentEvent[]) send(event);
          return;
        }
        const log: AgentEvent[] = [];
        await runAgent(message, {
          model,
          search: async (query) => (await searchPage(source, { q: query, rating }, 1, cache)).items,
          loadImage: (gif) => loadFrame(gif, url.origin),
          emit: (event) => {
            log.push(event);
            send(event);
          },
        });
        // Cache only runs the model finished itself; a fallback or failure deserves a fresh try.
        const done = log.at(-1);
        if (done?.type === "done" && done.by === "model")
          await cache?.put(
            cacheKey,
            new Response(JSON.stringify(log), {
              headers: { "cache-control": `public, max-age=${RESULT_TTL_SECONDS}` },
            }),
          );
      } catch (error) {
        console.error("agent failed", error);
        send({
          type: "error",
          message: "The agent couldn't finish. The suggestions above still work.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
};
