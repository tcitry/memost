import type { Bindings } from "./types";

// Wraps Workers AI to produce 1024-dim BGE embeddings. Single text per
// call keeps the response shape simple; callers batch as needed.
export async function embed(env: Bindings, text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Cannot embed empty text");

  const response = (await env.AI.run(env.EMBEDDING_MODEL as never, {
    text: [trimmed],
  } as never)) as unknown as { data: number[][] };

  const data = response.data;
  if (!Array.isArray(data) || data.length === 0 || !data[0]) {
    throw new Error("Embedding response missing data");
  }
  return data[0];
}

export async function embedMany(env: Bindings, texts: string[]): Promise<number[][]> {
  const filtered = texts.map((t) => t.trim()).filter((t) => t.length > 0);
  if (filtered.length === 0) return [];

  const response = (await env.AI.run(env.EMBEDDING_MODEL as never, {
    text: filtered,
  } as never)) as unknown as { data: number[][] };
  return response.data;
}
