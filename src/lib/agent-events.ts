import type { Gif } from "./gif.ts";

/** One pick: the clip, why it fits, and alt text so the reply is accessible too. */
export interface Pick {
  gif: Gif;
  why: string;
  alt: string;
}

/** What the browser sees while the agent works: a live, step-by-step log. Shared by server and page. */
export type AgentEvent =
  | { type: "start"; model: string }
  | { type: "thought"; text: string }
  | { type: "search"; query: string; found: number }
  | { type: "look"; titles: string[] }
  | { type: "retry"; reason: string }
  | { type: "done"; picks: Pick[]; by: "model" | "fallback" }
  | { type: "error"; message: string };

/** How each step reads in the log. */
export function describe(event: AgentEvent): string {
  switch (event.type) {
    case "start":
      return event.model.startsWith("demo:")
        ? "Demo agent (scripted, not AI)"
        : `Thinking with ${event.model}`;
    case "thought":
      return `💭 ${event.text}`;
    case "search":
      return `🔎 Searched “${event.query}”: ${event.found} clips`;
    case "look":
      return `👀 Looked at ${event.titles.length} frame${event.titles.length === 1 ? "" : "s"}`;
    case "retry":
      return `↩️ ${event.reason}`;
    case "done":
      return event.by === "model"
        ? `✅ Picked ${event.picks.length}`
        : "⏱️ Ran out of steps: here are the closest matches";
    case "error":
      return `⚠️ ${event.message}`;
  }
}
