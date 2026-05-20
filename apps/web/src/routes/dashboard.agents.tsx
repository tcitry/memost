import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@repo/design-system/components/ui/button";
import type { Agent, ApiKeyWithSecret } from "../lib/types";

const labelCls =
  "block text-xs font-semibold uppercase tracking-wide text-[#3b7055] mb-1";
const inputCls =
  "w-full rounded-lg border border-[rgba(31,57,42,0.18)] bg-[rgba(255,254,249,0.92)] px-3 py-2 text-sm text-[#132018] outline-none transition focus:border-[#244c37] focus:ring-2 focus:ring-[rgba(36,76,55,0.15)]";
const helpCls = "mt-1 text-xs text-[#54665a]";

export const Route = createFileRoute("/dashboard/agents")({
  component: AgentsPage,
});

interface CreatedKeyState {
  agentId: string;
  apiKey: ApiKeyWithSecret;
}

function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultPid, setDefaultPid] = useState("default");
  const [revealedKey, setRevealedKey] = useState<CreatedKeyState | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/agents");
      const json = (await res.json()) as { agents?: Agent[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load agents");
      setAgents(json.agents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          defaultPid: defaultPid.trim() || "default",
        }),
      });
      const json = (await res.json()) as {
        agent?: Agent;
        apiKey?: ApiKeyWithSecret;
        error?: string;
      };
      if (!res.ok || !json.agent || !json.apiKey) {
        throw new Error(json.error ?? "Failed to create agent");
      }
      setRevealedKey({ agentId: json.agent.id, apiKey: json.apiKey });
      setName("");
      setDescription("");
      setDefaultPid("default");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="flex-1 px-[clamp(20px,4vw,40px)] py-8">
      <header className="max-w-[760px]">
        <p className="mb-2 text-sm font-extrabold uppercase tracking-[0.08em] text-[#3b7055]">
          Agents
        </p>
        <h1 className="text-3xl font-semibold leading-[0.98] text-[#132018] md:text-4xl">
          Manage your AI agents
        </h1>
        <p className="mt-4 max-w-[640px] text-base leading-[1.55] text-[#415548]">
          Each agent has its own API key. Use the key with the SDK or call
          <code className="mx-1 rounded bg-[rgba(31,57,42,0.08)] px-1 py-0.5 text-[14px]">
            POST /v1/memories
          </code>
          directly. Keys are shown once on creation.
        </p>
      </header>

      <section className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
        <div>
          <h2 className="mb-4 text-lg font-semibold text-[#132018]">
            Existing agents
          </h2>
          {error ? (
            <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {agents === null ? (
            <p className="text-sm text-[#54665a]">Loading agents…</p>
          ) : agents.length === 0 ? (
            <p className="text-sm text-[#54665a]">
              No agents yet. Create one to begin storing memories.
            </p>
          ) : (
            <ul className="grid gap-3">
              {agents.map((agent) => (
                <li
                  key={agent.id}
                  className="rounded-xl border border-[rgba(31,57,42,0.14)] bg-[rgba(255,254,249,0.78)] px-4 py-3 shadow-[0_12px_36px_rgba(18,35,25,0.05)] backdrop-blur"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span className="font-semibold text-[#132018]">
                      {agent.name}
                    </span>
                    <code className="text-xs text-[#54665a]">{agent.id}</code>
                  </div>
                  {agent.description ? (
                    <p className="mt-1 text-sm text-[#415548]">
                      {agent.description}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-[#54665a]">
                    pid: {agent.default_pid} · created{" "}
                    {new Date(agent.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="rounded-xl border border-[rgba(31,57,42,0.14)] bg-[rgba(255,254,249,0.78)] p-5 shadow-[0_18px_50px_rgba(18,35,25,0.06)] backdrop-blur">
          <h2 className="mb-3 text-lg font-semibold text-[#132018]">
            Create agent
          </h2>
          <form className="grid gap-3" onSubmit={onCreate}>
            <div>
              <label className={labelCls} htmlFor="agent-name">
                Name
              </label>
              <input
                id="agent-name"
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                placeholder="support-agent"
                required
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="agent-desc">
                Description
              </label>
              <input
                id="agent-desc"
                className={inputCls}
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
                placeholder="Helps with customer support"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="agent-pid">
                Default pid
              </label>
              <input
                id="agent-pid"
                className={inputCls}
                value={defaultPid}
                onChange={(e) => setDefaultPid(e.currentTarget.value)}
                placeholder="default"
              />
              <p className={helpCls}>
                Process / project identifier — memories live under this scope.
              </p>
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create agent"}
            </Button>
          </form>

          {revealedKey ? (
            <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">
                API key for agent {revealedKey.agentId}
              </p>
              <p className="mt-1">
                Copy this now — it will not be shown again.
              </p>
              <code className="mt-2 block break-all rounded bg-white/80 px-2 py-2 text-xs">
                {revealedKey.apiKey.raw}
              </code>
              <button
                type="button"
                className="mt-2 text-xs underline"
                onClick={() => {
                  void navigator.clipboard.writeText(revealedKey.apiKey.raw);
                }}
              >
                Copy to clipboard
              </button>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
