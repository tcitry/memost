import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@repo/design-system/components/ui/button";
import type {
  AddResult,
  Agent,
  KgTriple,
  Memory,
  SearchResult,
} from "../../lib/types";

export const Route = createFileRoute("/dashboard/playground")({
  validateSearch: (search: Record<string, unknown>) => ({
    agent: typeof search.agent === "string" ? search.agent : undefined,
  }),
  component: PlaygroundPage,
});

type Op = "add" | "search";

interface ChatMessage {
  id: string;
  role: "user" | "system";
  op: Op;
  text: string;
  // Rich payload rendered alongside the message.
  result?: AddResult | SearchResult | { error: string };
}

const inputCls =
  "w-full rounded-md border border-[rgba(28,28,28,0.4)] bg-background px-3 py-2 text-sm text-[#1c1c1c] outline-none transition focus:border-[rgba(28,28,28,0.4)] focus:shadow-[var(--memost-focus-shadow)]";
const labelCls =
  "block text-xs font-semibold uppercase tracking-wide text-[#5f5f5d] mb-1";

function PlaygroundPage() {
  const { agent: agentFromUrl } = Route.useSearch();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState<string>("");
  const [pid, setPid] = useState<string>("");
  const [tid, setTid] = useState<string>("");
  const [op, setOp] = useState<Op>("add");
  const [input, setInput] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/agents");
        const json = (await res.json()) as { agents?: Agent[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load agents");
        const list = json.agents ?? [];
        setAgents(list);
        if (list.length > 0) {
          const pick =
            (agentFromUrl && list.find((a) => a.id === agentFromUrl)) ||
            list[0];
          if (pick) {
            setAgentId(pick.id);
            setPid(pick.default_pid);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [agentFromUrl]);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === agentId) ?? null,
    [agents, agentId],
  );

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agentId) {
      setError("Select an agent first");
      return;
    }
    const text = input.trim();
    if (!text) return;
    setError(null);
    setBusy(true);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      op,
      text,
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");

    try {
      const res = await fetch("/api/playground", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op,
          agentId,
          pid: pid.trim() || undefined,
          tid: tid.trim() || undefined,
          ...(op === "add" ? { content: text } : { query: text, limit: 8 }),
        }),
      });
      const json = (await res.json()) as
        | AddResult
        | SearchResult
        | { error: string };
      const sysMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "system",
        op,
        text: !res.ok
          ? `Error: ${"error" in json ? json.error : "request failed"}`
          : op === "add"
            ? "Memory stored."
            : "Retrieved.",
        result: json,
      };
      setMessages((m) => [...m, sysMsg]);
    } catch (err) {
      const sysMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "system",
        op,
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      };
      setMessages((m) => [...m, sysMsg]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex-1 px-[clamp(20px,4vw,40px)] py-8">
      <header className="max-w-[760px]">
        <p className="memost-kicker mb-2">
          Playground
        </p>
        <h1 className="memost-heading text-3xl md:text-4xl">
          Try add &amp; search
        </h1>
        <p className="memost-body mt-4 max-w-[640px] text-base">
          Send memories with <code>add</code> and retrieve them with
          <code className="mx-1">search</code>. The same Cloudflare-native
          pipeline is used by the SDK — vector first, text fallback, KG fan-out.
        </p>
      </header>

      <section className="mt-8 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="memost-card p-4 lg:sticky lg:top-24 lg:self-start">
          <div className="mb-3">
            <label className={labelCls} htmlFor="pg-agent">
              Agent
            </label>
            <select
              id="pg-agent"
              className={inputCls}
              value={agentId}
              onChange={(e) => {
                setAgentId(e.currentTarget.value);
                const next = agents.find(
                  (a) => a.id === e.currentTarget.value,
                );
                if (next) setPid(next.default_pid);
              }}
            >
              <option value="" disabled>
                {agents.length === 0 ? "No agents — create one first" : "Select"}
              </option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3">
            <label className={labelCls} htmlFor="pg-pid">
              pid (process / project)
            </label>
            <input
              id="pg-pid"
              className={inputCls}
              value={pid}
              onChange={(e) => setPid(e.currentTarget.value)}
              placeholder={selectedAgent?.default_pid ?? "default"}
            />
          </div>
          <div className="mb-3">
            <label className={labelCls} htmlFor="pg-tid">
              tid (thread, optional)
            </label>
            <input
              id="pg-tid"
              className={inputCls}
              value={tid}
              onChange={(e) => setTid(e.currentTarget.value)}
              placeholder="conversation-1"
            />
          </div>

          <div className="mb-2">
            <span className={labelCls}>Operation</span>
            <div
              className="flex items-center gap-2 rounded-md border border-[rgba(28,28,28,0.4)] bg-[rgba(255,254,249,0.72)] p-1"
              role="tablist"
            >
              {(["add", "search"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={op === value}
                  className={
                    op === value
                      ? "flex-1 rounded-md bg-[#1c1c1c] px-2 py-1 text-xs font-normal text-[#fcfbf8]"
                      : "flex-1 rounded-md px-2 py-1 text-xs font-normal text-[rgba(28,28,28,0.82)] hover:bg-[rgba(28,28,28,0.04)]"
                  }
                  onClick={() => setOp(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          ) : null}
        </aside>

        <div className="flex min-h-[480px] flex-col memost-card">
          <div
            ref={scrollerRef}
            className="flex-1 overflow-y-auto p-4"
            aria-live="polite"
          >
            {messages.length === 0 ? (
              <p className="text-sm text-[#5f5f5d]">
                Pick <strong>add</strong> to store a memory or{" "}
                <strong>search</strong> to retrieve. Messages appear here.
              </p>
            ) : (
              <ol className="grid gap-3">
                {messages.map((m) => (
                  <li key={m.id}>
                    <MessageView message={m} />
                  </li>
                ))}
              </ol>
            )}
          </div>
          <form
            className="flex gap-2 border-t border-[#eceae4] p-3"
            onSubmit={onSubmit}
          >
            <input
              className={inputCls}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              placeholder={
                op === "add"
                  ? "Tell the agent something to remember…"
                  : "Ask the agent what it remembers…"
              }
              disabled={!agentId || busy}
            />
            <Button type="submit" disabled={!agentId || busy}>
              {busy ? "…" : op === "add" ? "Add" : "Search"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  const align = message.role === "user" ? "items-end" : "items-start";
  const bubbleClass =
    message.role === "user"
      ? "bg-[#1c1c1c] text-[#fcfbf8]"
      : "bg-[rgba(28,28,28,0.04)] text-[#1c1c1c]";
  return (
    <div className={`flex flex-col gap-2 ${align}`}>
      <span className="text-xs font-bold uppercase tracking-wide text-[#5f5f5d]">
        {message.role} · {message.op}
      </span>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${bubbleClass}`}>
        {message.text}
      </div>
      {message.result && "memories" in message.result ? (
        <SearchResultView result={message.result} />
      ) : null}
      {message.result && "memory" in message.result ? (
        <AddResultView result={message.result} />
      ) : null}
    </div>
  );
}

function AddResultView({ result }: { result: AddResult }) {
  return (
    <div className="w-full max-w-[85%] rounded-xl border border-[#eceae4] bg-background p-3 text-xs text-[rgba(28,28,28,0.82)]">
      <p>
        <span className="font-semibold text-[#1c1c1c]">id:</span>{" "}
        <code>{result.memory.id}</code>
      </p>
      {result.triples.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold text-[#1c1c1c]">
            Extracted {result.triples.length} triple
            {result.triples.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1 grid gap-1">
            {result.triples.map((t) => (
              <TripleRow key={t.id} triple={t} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function SearchResultView({ result }: { result: SearchResult }) {
  return (
    <div className="w-full max-w-[85%] grid gap-2 rounded-xl border border-[#eceae4] bg-background p-3 text-xs text-[rgba(28,28,28,0.82)]">
      {result.strategy ? (
        <p className="text-[10px] uppercase tracking-wide text-[#5f5f5d]">
          strategy {result.strategy}
        </p>
      ) : null}
      <div>
        <p className="font-semibold text-[#1c1c1c]">
          {result.memories.length} memor
          {result.memories.length === 1 ? "y" : "ies"}
        </p>
        <ul className="mt-1 grid gap-2">
          {result.memories.map((m) => (
            <MemoryRow key={m.id} memory={m} />
          ))}
        </ul>
      </div>
      {result.triples.length > 0 ? (
        <div>
          <p className="font-semibold text-[#1c1c1c]">
            {result.triples.length} graph hit
            {result.triples.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-1 grid gap-1">
            {result.triples.map((t) => (
              <TripleRow key={t.id} triple={t} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MemoryRow({ memory }: { memory: Memory }) {
  return (
    <li className="rounded-md border border-[#eceae4] bg-[#f7f4ed] p-2">
      <p className="text-[#1c1c1c]">{memory.content}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-[#5f5f5d]">
        pid {memory.pid}
        {memory.tid ? ` · tid ${memory.tid}` : ""}
        {typeof memory.score === "number"
          ? ` · score ${memory.score.toFixed(3)}`
          : ""}
        {typeof memory.semanticScore === "number"
          ? ` · sem ${memory.semanticScore.toFixed(3)}`
          : ""}
        {typeof memory.keywordScore === "number"
          ? ` · kw ${memory.keywordScore.toFixed(3)}`
          : ""}
        {typeof memory.graphScore === "number"
          ? ` · kg ${memory.graphScore.toFixed(3)}`
          : ""}
      </p>
    </li>
  );
}

function TripleRow({ triple }: { triple: KgTriple }) {
  return (
    <li className="rounded-md bg-[rgba(28,28,28,0.04)] px-2 py-1">
      <code className="text-[#1c1c1c]">
        {triple.subject} —{triple.predicate}→ {triple.object}
      </code>
    </li>
  );
}
