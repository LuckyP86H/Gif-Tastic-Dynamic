import { describe, expect, it } from "bun:test";
import type { AgentEvent } from "#lib/agent-events.ts";
import type { Gif } from "#lib/gif.ts";
import { LIMITS, runAgent, scriptedAgent, TOOLS } from "./agent.ts";
import { type AgentModel, gemini, openAICompatible, type ToolCall, type Turn } from "./model.ts";

const gif = (id: string): Gif => ({
  id,
  title: `Clip ${id}`,
  rating: "g",
  width: 200,
  height: 150,
  mp4: `/${id}.mp4`,
  still: `/${id}.jpg`,
  page: `/${id}`,
  mp4Bytes: 1,
  gifBytes: 10,
});

/** A model that plays back a fixed list of replies and records what it was shown. */
function playback(replies: ToolCall[][]) {
  const seen: Turn[][] = [];
  const model: AgentModel = {
    id: "test:playback",
    async next(_system, turns) {
      seen.push(structuredClone(turns));
      return { calls: replies.shift() ?? [] };
    },
  };
  return { model, seen };
}

function harness(model: AgentModel) {
  const events: AgentEvent[] = [];
  const searches: string[] = [];
  let frames = 0;
  return {
    events,
    searches,
    frames: () => frames,
    run: (message = "we shipped it!!") =>
      runAgent(message, {
        model,
        search: async (q) => {
          searches.push(q);
          return ["a", "b", "c", "d", "e"].map((x) => gif(`${q}-${x}`));
        },
        loadImage: async () => {
          frames++;
          return { mimeType: "image/jpeg", base64: "AAAA" };
        },
        emit: (e) => events.push(e),
      }),
  };
}

const call = (name: string, args: Record<string, unknown>): ToolCall => ({ id: name, name, args });

describe("the agent loop", () => {
  it("searches, looks, and chooses only clips it has seen", async () => {
    const { model, seen } = playback([
      [call("search_gifs", { query: "celebrate" })],
      [call("look_at", { ids: ["celebrate-a", "celebrate-b"] })],
      [
        call("choose", {
          picks: [{ id: "celebrate-b", why: "Pure joy.", alt: "People cheering." }],
        }),
      ],
    ]);
    const h = harness(model);
    const picks = await h.run();
    expect(picks.map((p) => p.gif.id)).toEqual(["celebrate-b"]);
    expect(picks[0]?.alt).toBe("People cheering.");
    expect(h.frames()).toBe(2);
    expect(h.events.map((e) => e.type)).toEqual(["start", "search", "look", "done"]);
    // The model was shown the frames as images alongside the tool result.
    const lastTurns = seen[2] ?? [];
    const lookResult = lastTurns.at(-1);
    expect(lookResult?.role === "tool" && lookResult.results[0]?.images?.length).toBe(2);
  });

  it("refuses to choose a clip it never looked at, and says why", async () => {
    const { model, seen } = playback([
      [call("search_gifs", { query: "yay" })],
      [call("choose", { picks: [{ id: "yay-a", why: "Fun.", alt: "A clip." }] })],
      [call("look_at", { ids: ["yay-a"] })],
      [call("choose", { picks: [{ id: "yay-a", why: "Fun.", alt: "A clip." }] })],
    ]);
    const h = harness(model);
    const picks = await h.run();
    expect(picks).toHaveLength(1);
    expect(
      h.events.some(
        (e) => e.type === "retry" && e.reason.includes("Look at a clip before choosing"),
      ),
    ).toBe(true);
    const feedback = seen[2]?.at(-1);
    expect(JSON.stringify(feedback)).toContain("Look at a clip before choosing");
  });

  it("rejects ids that never came from a search (prompt-injected or invented)", async () => {
    const { model } = playback([
      [call("look_at", { ids: ["https://evil.example/x.jpg"] })],
      [call("search_gifs", { query: "ok" })],
      [call("look_at", { ids: ["ok-a"] })],
      [call("choose", { picks: [{ id: "ok-a", why: "Fine.", alt: "A clip." }] })],
    ]);
    const h = harness(model);
    await h.run();
    expect(h.events.find((e) => e.type === "retry")).toMatchObject({
      reason: "None of those ids came from search_gifs.",
    });
  });

  it("enforces the search budget", async () => {
    const searches = Array.from({ length: 4 }, (_, i) => [call("search_gifs", { query: `q${i}` })]);
    const { model } = playback([
      ...searches,
      [call("look_at", { ids: ["q0-a"] })],
      [call("choose", { picks: [{ id: "q0-a", why: "ok!", alt: "a clip" }] })],
    ]);
    const h = harness(model);
    await h.run();
    expect(h.searches).toHaveLength(LIMITS.searches);
  });

  it("always ends: out of steps, it falls back to what it has seen", async () => {
    const { model } = playback(
      Array.from({ length: 10 }, () => [call("search_gifs", { query: "loop" })]),
    );
    const h = harness(model);
    const picks = await h.run();
    expect(picks).toHaveLength(LIMITS.picks);
    expect(h.events.at(-1)).toMatchObject({ type: "done", by: "fallback" });
  });

  it("validates arguments instead of trusting them", async () => {
    const { model } = playback([
      [call("search_gifs", { query: "" })],
      [call("choose", { picks: [] })],
      [call("teleport", {})],
    ]);
    const h = harness(model);
    await h.run();
    const reasons = h.events
      .filter((e) => e.type === "retry")
      .map((e) => (e as { reason: string }).reason);
    expect(reasons).toEqual([
      "search_gifs needs a short text query.",
      "choose needs 1-3 picks, each with id, why and alt.",
      "Unknown tool teleport.",
    ]);
  });

  it("the scripted demo agent follows the same protocol end to end", async () => {
    const h = harness(scriptedAgent());
    const picks = await h.run("ugh, Monday again");
    expect(h.searches).toEqual(["tired"]);
    expect(picks).toHaveLength(3);
    expect(picks[0]?.why).toContain("demo pick");
  });
});

/** Records the request a provider makes and answers with `reply`. */
function recorder(reply: unknown) {
  const requests: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    requests.push({ url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    return Response.json(reply);
  }) as unknown as typeof fetch;
  return { requests, fetchImpl };
}

const history: Turn[] = [
  { role: "user", text: "we shipped!" },
  { role: "model", calls: [call("look_at", { ids: ["x"] })] },
  {
    role: "tool",
    results: [
      {
        callId: "look_at",
        name: "look_at",
        output: { ok: true },
        images: [{ mimeType: "image/jpeg", base64: "QUJD" }],
      },
    ],
  },
];

describe("Gemini adapter", () => {
  it("sends tools, forces a tool call, and puts frames next to the function response", async () => {
    const r = recorder({
      candidates: [
        {
          content: {
            role: "model",
            parts: [{ functionCall: { name: "choose", args: { picks: [] } } }],
          },
        },
      ],
    });
    const reply = await gemini({ apiKey: "K", model: "gemini-test" }, r.fetchImpl).next(
      "sys",
      history,
      TOOLS,
    );
    const { url, headers, body } = r.requests[0] ?? { url: "", headers: new Headers(), body: {} };
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
    );
    expect(headers.get("x-goog-api-key")).toBe("K");
    expect(url).not.toContain("K"); // the key never goes in the URL, where logs would keep it
    expect(body.toolConfig).toEqual({ functionCallingConfig: { mode: "ANY" } });
    const contents = body.contents as { role: string; parts: Record<string, unknown>[] }[];
    expect(contents[2]?.parts.map((p) => Object.keys(p)[0])).toEqual([
      "functionResponse",
      "inlineData",
    ]);
    expect(reply.calls[0]?.name).toBe("choose");
  });

  it("replays the model's own message verbatim (keeps Gemini 3 thought signatures)", async () => {
    const raw = {
      role: "model",
      parts: [
        { functionCall: { name: "search_gifs", args: { query: "x" } }, thoughtSignature: "sig123" },
      ],
    };
    const r = recorder({ candidates: [{ content: raw }] });
    const model = gemini({ apiKey: "K", model: "m" }, r.fetchImpl);
    const first = await model.next("sys", [{ role: "user", text: "hi" }], TOOLS);
    await model.next(
      "sys",
      [
        { role: "user", text: "hi" },
        { role: "model", calls: first.calls, raw: first.raw },
      ],
      TOOLS,
    );
    expect(JSON.stringify(r.requests[1]?.body.contents)).toContain("sig123");
  });
});

describe("OpenAI-compatible adapter (OpenAI, Ollama vision models…)", () => {
  it("sends tool results as tool messages and the frames as a following user message", async () => {
    const r = recorder({
      choices: [
        {
          message: {
            role: "assistant",
            tool_calls: [
              { id: "c1", function: { name: "search_gifs", arguments: '{"query":"yay"}' } },
            ],
          },
        },
      ],
    });
    const reply = await openAICompatible(
      { baseUrl: "http://localhost:11434/v1", model: "qwen2.5vl" },
      r.fetchImpl,
    ).next("sys", history, TOOLS);
    const body = r.requests[0]?.body ?? {};
    expect(r.requests[0]?.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(body.tool_choice).toBe("required");
    const roles = (body.messages as { role: string }[]).map((m) => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "tool", "user"]);
    expect(JSON.stringify(body.messages)).toContain("data:image/jpeg;base64,QUJD");
    expect(reply.calls[0]).toEqual({ id: "c1", name: "search_gifs", args: { query: "yay" } });
  });

  it("survives malformed tool arguments (they fail validation later, with a message)", async () => {
    const r = recorder({
      choices: [
        {
          message: {
            tool_calls: [{ id: "c1", function: { name: "choose", arguments: "{not json" } }],
          },
        },
      ],
    });
    const reply = await openAICompatible({ baseUrl: "http://x/v1", model: "m" }, r.fetchImpl).next(
      "sys",
      history,
      TOOLS,
    );
    expect(reply.calls[0]?.args).toEqual({});
  });
});
