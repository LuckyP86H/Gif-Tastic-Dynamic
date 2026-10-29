/**
 * The agent's view of a model: given the conversation so far and the tools, what does it do next?
 * Vendors differ in how they encode tool calls and images, so each adapter translates both ways.
 */
export interface Image {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  name: string;
  /** Plain JSON the model reads back. */
  output: unknown;
  /** Pictures that come with the result, e.g. the frames the model asked to look at. */
  images?: Image[];
}

export type Turn =
  | { role: "user"; text: string }
  | {
      role: "model";
      calls: ToolCall[];
      text?: string;
      /**
       * The vendor's own message, replayed verbatim. Some models (Gemini 3) attach signatures to
       * tool calls and reject a history that drops them.
       */
      raw?: unknown;
    }
  | { role: "tool"; results: ToolResult[] };

export interface AgentModel {
  readonly id: string;
  next(
    system: string,
    turns: Turn[],
    tools: ToolSpec[],
  ): Promise<{ calls: ToolCall[]; text?: string; raw?: unknown }>;
}

type Fetch = typeof fetch;
const TIMEOUT_MS = 30_000;

async function postJson(
  fetchImpl: Fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`${new URL(url).host} answered ${response.status}: ${detail}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

/** Google Gemini, native REST API: function calling plus inline images. */
export function gemini(
  config: { apiKey: string; model: string; baseUrl?: string },
  fetchImpl: Fetch = fetch,
): AgentModel {
  const base = (config.baseUrl ?? "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  return {
    id: `gemini:${config.model}`,
    async next(system, turns, tools) {
      const contents = turns.map((turn) => {
        if (turn.role === "user") return { role: "user", parts: [{ text: turn.text }] };
        if (turn.role === "model") {
          return (
            (turn.raw as object | undefined) ?? {
              role: "model",
              parts: turn.calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
            }
          );
        }
        return {
          role: "user",
          parts: turn.results.flatMap((r) => [
            { functionResponse: { name: r.name, response: { result: r.output } } },
            ...(r.images ?? []).map((img) => ({
              inlineData: { mimeType: img.mimeType, data: img.base64 },
            })),
          ]),
        };
      });
      const data = await postJson(
        fetchImpl,
        `${base}/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
        { "x-goog-api-key": config.apiKey },
        {
          systemInstruction: { parts: [{ text: system }] },
          contents,
          tools: [{ functionDeclarations: tools }],
          // The agent always acts through a tool; finishing is the `choose` tool.
          toolConfig: { functionCallingConfig: { mode: "ANY" } },
        },
      );
      const content = (
        data.candidates as { content?: { parts?: Record<string, unknown>[] } }[] | undefined
      )?.[0]?.content;
      const parts = content?.parts ?? [];
      const calls = parts
        .map((p) => p.functionCall as { name?: string; args?: Record<string, unknown> } | undefined)
        .filter(
          (c): c is { name: string; args?: Record<string, unknown> } => typeof c?.name === "string",
        )
        .map((c, i) => ({ id: `call_${i}`, name: c.name, args: c.args ?? {} }));
      const text = parts
        .map((p) => (typeof p.text === "string" ? p.text : ""))
        .join("")
        .trim();
      return { calls, ...(text ? { text } : {}), raw: content };
    },
  };
}

/** Any OpenAI-compatible chat API with tools and image input: OpenAI, Ollama (qwen2.5vl, llava…), others. */
export function openAICompatible(
  config: { baseUrl: string; model: string; apiKey?: string },
  fetchImpl: Fetch = fetch,
): AgentModel {
  return {
    id: `openai:${config.model}`,
    async next(system, turns, tools) {
      const messages: unknown[] = [{ role: "system", content: system }];
      for (const turn of turns) {
        if (turn.role === "user") messages.push({ role: "user", content: turn.text });
        else if (turn.role === "model") {
          messages.push(
            (turn.raw as object | undefined) ?? {
              role: "assistant",
              content: turn.text ?? null,
              tool_calls: turn.calls.map((c) => ({
                id: c.id,
                type: "function",
                function: { name: c.name, arguments: JSON.stringify(c.args) },
              })),
            },
          );
        } else {
          for (const r of turn.results)
            messages.push({
              role: "tool",
              tool_call_id: r.callId,
              content: JSON.stringify(r.output),
            });
          // Tool messages carry text only in this API, so the frames follow as a user message.
          const images = turn.results.flatMap((r) => r.images ?? []);
          if (images.length) {
            messages.push({
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Here are the frames you asked to look at, in the same order.",
                },
                ...images.map((img) => ({
                  type: "image_url",
                  image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
                })),
              ],
            });
          }
        }
      }
      const data = await postJson(
        fetchImpl,
        `${config.baseUrl.replace(/\/$/, "")}/chat/completions`,
        config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {},
        {
          model: config.model,
          messages,
          tools: tools.map((t) => ({ type: "function", function: t })),
          tool_choice: "required",
        },
      );
      const message =
        (data.choices as { message?: Record<string, unknown> }[] | undefined)?.[0]?.message ?? {};
      const calls = (
        (message.tool_calls as
          | { id?: string; function?: { name?: string; arguments?: string } }[]
          | undefined) ?? []
      )
        .filter((c) => typeof c.function?.name === "string")
        .map((c, i) => {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(c.function?.arguments ?? "{}") as Record<string, unknown>;
          } catch {
            // Malformed arguments become an empty object; validation rejects it with a message.
          }
          return { id: c.id ?? `call_${i}`, name: c.function?.name ?? "", args };
        });
      const text = typeof message.content === "string" ? message.content.trim() : "";
      return { calls, ...(text ? { text } : {}), raw: message };
    },
  };
}
