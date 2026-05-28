import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@repo/design-system/components/ui/button";
import type { Agent, ApiKey, ApiKeyWithSecret } from "../../lib/types";

const labelCls =
  "block text-xs font-semibold uppercase tracking-wide text-[#5f5f5d] mb-1";
const inputCls =
  "w-full rounded-md border border-[rgba(28,28,28,0.4)] bg-background px-3 py-2 text-sm text-[#1c1c1c] outline-none transition focus:border-[rgba(28,28,28,0.4)] focus:shadow-[var(--memost-focus-shadow)]";
const helpCls = "mt-1 text-xs text-[#5f5f5d]";

export const Route = createFileRoute("/dashboard/agents")({
  component: AgentsPage,
});

interface CreatedKeyState {
  agentId: string;
  apiKey: ApiKeyWithSecret;
}

function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [keysBusy, setKeysBusy] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultPid, setDefaultPid] = useState("default");
  const [revealedKey, setRevealedKey] = useState<CreatedKeyState | null>(null);
  const [newKeyName, setNewKeyName] = useState("default");

  const selected = agents?.find((a) => a.id === selectedId) ?? null;

  const refreshAgents = useCallback(async () => {
    const res = await fetch("/api/agents");
    const json = (await res.json()) as { agents?: Agent[]; error?: string };
    if (!res.ok) throw new Error(json.error ?? "Failed to load agents");
    const list = json.agents ?? [];
    setAgents(list);
    if (list.length > 0) {
      if (!selectedId || !list.some((a) => a.id === selectedId)) {
        setSelectedId(list[0]?.id ?? null);
      }
    } else {
      setSelectedId(null);
    }
    return list;
  }, [selectedId]);

  const refreshKeys = useCallback(async (agentId: string) => {
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/keys`);
    const json = (await res.json()) as { keys?: ApiKey[]; error?: string };
    if (!res.ok) throw new Error(json.error ?? "Failed to load keys");
    setKeys(json.keys ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setError(null);
        await refreshAgents();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [refreshAgents]);

  useEffect(() => {
    if (!selectedId) {
      setKeys(null);
      return;
    }
    void (async () => {
      try {
        setKeysBusy(true);
        await refreshKeys(selectedId);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setKeysBusy(false);
      }
    })();
  }, [selectedId, refreshKeys]);

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
      await refreshAgents();
      setSelectedId(json.agent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function onDeleteAgent(agent: Agent) {
    if (
      !window.confirm(
        `Delete Agent "${agent.name}"? Its memories, graph data, and API keys will also be deleted.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      if (selectedId === agent.id) setSelectedId(null);
      await refreshAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onCreateKey() {
    if (!selectedId) return;
    setKeysBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(selectedId)}/keys`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: newKeyName.trim() || "default" }),
        },
      );
      const json = (await res.json()) as ApiKeyWithSecret & { error?: string };
      if (!res.ok || !json.raw) {
        throw new Error(json.error ?? "Failed to create key");
      }
      setRevealedKey({
        agentId: selectedId,
        apiKey: {
          id: json.id,
          prefix: json.prefix,
          raw: json.raw,
          name: json.name,
        },
      });
      await refreshKeys(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setKeysBusy(false);
    }
  }

  async function onRevokeKey(key: ApiKey) {
    if (!selectedId) return;
    if (!window.confirm(`Revoke key "${key.name}" (${key.prefix}...)?`)) return;
    setKeysBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(selectedId)}/keys/${encodeURIComponent(key.id)}`,
        { method: "DELETE" },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Revoke failed");
      await refreshKeys(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setKeysBusy(false);
    }
  }

  return (
    <main className="flex-1 px-[clamp(20px,4vw,40px)] py-8">
      <header className="max-w-[900px]">
        <p className="memost-kicker mb-2">
          Agents
        </p>
        <h1 className="memost-heading text-3xl md:text-4xl">
          Agent management
        </h1>
        <p className="memost-body mt-4 max-w-[720px] text-base">
          Memory is organized into three scope levels:
          <strong className="font-semibold text-[#1c1c1c]"> Agent</strong>
          (top-level unit) →
          <strong className="font-semibold text-[#1c1c1c]"> pid</strong>
          (process / project) →
          <strong className="font-semibold text-[#1c1c1c]"> tid</strong>
          (thread / session, optional). Every memory and graph triple belongs to that hierarchy.
        </p>
        <div className="mt-4 rounded-md border border-[#eceae4] bg-[rgba(28,28,28,0.03)] px-4 py-3 font-mono text-xs text-[rgba(28,28,28,0.82)]">
          organization → agent_id → pid → tid?
        </div>
      </header>

      {error ? (
        <p className="mt-6 max-w-[760px] rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.55fr)]">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <h2 className="mb-4 text-lg font-semibold text-[#1c1c1c]">
              Agent list
            </h2>
            {agents === null ? (
              <p className="text-sm text-[#5f5f5d]">Loading...</p>
            ) : agents.length === 0 ? (
              <p className="text-sm text-[#5f5f5d]">
                No agents yet. Create one on the right.
              </p>
            ) : (
              <ul className="grid gap-2">
                {agents.map((agent) => (
                  <li key={agent.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(agent.id)}
                      className={
                        selectedId === agent.id
                          ? "w-full rounded-xl border-2 border-[#1c1c1c] bg-[rgba(28,28,28,0.04)] px-4 py-3 text-left"
                          : "w-full rounded-xl border border-[#eceae4] bg-background px-4 py-3 text-left hover:border-[rgba(28,28,28,0.4)]"
                      }
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold text-[#1c1c1c]">
                          {agent.name}
                        </span>
                        <code className="text-[10px] text-[#5f5f5d]">
                          {agent.id}
                        </code>
                      </div>
                      {agent.description ? (
                        <p className="mt-1 text-sm text-[rgba(28,28,28,0.82)] line-clamp-2">
                          {agent.description}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-[#5f5f5d]">
                        Default pid: {agent.default_pid}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold text-[#1c1c1c]">
              {selected ? selected.name : "Select an agent"}
            </h2>
            {!selected ? (
              <p className="text-sm text-[#5f5f5d]">
                Select an agent on the left to manage API keys.
              </p>
            ) : (
              <div className="memost-card p-4">
                <p className="text-sm text-[rgba(28,28,28,0.82)]">
                  <code className="text-xs">{selected.id}</code>
                </p>
                <p className="mt-2 text-xs text-[#5f5f5d]">
                  Memory scope: all pids under this agent; pass tid in Playground or via the API when needed.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <Link
                        to="/dashboard/playground"
                        search={{ agent: selected.id }}
                      />
                    }
                  >
                    Try in Playground
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void onDeleteAgent(selected)}
                  >
                    Delete agent
                  </Button>
                </div>

                <h3 className="mt-6 mb-2 text-sm font-semibold text-[#1c1c1c]">
                  API Keys
                </h3>
                {keysBusy && keys === null ? (
                  <p className="text-xs text-[#5f5f5d]">Loading keys...</p>
                ) : keys && keys.length === 0 ? (
                  <p className="text-xs text-[#5f5f5d]">No keys yet.</p>
                ) : (
                  <ul className="grid gap-2">
                    {(keys ?? []).map((key) => (
                      <li
                        key={key.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#eceae4] bg-[#f7f4ed] px-3 py-2 text-xs"
                      >
                        <div>
                          <span className="font-semibold text-[#1c1c1c]">
                            {key.name}
                          </span>
                          <code className="ml-2 text-[#5f5f5d]">
                            {key.prefix}…
                          </code>
                          {key.revoked_at ? (
                            <span className="ml-2 text-red-600">Revoked</span>
                          ) : null}
                        </div>
                        {!key.revoked_at ? (
                          <button
                            type="button"
                            className="text-[#5f5f5d] underline"
                            disabled={keysBusy}
                            onClick={() => void onRevokeKey(key)}
                          >
                            Revoke
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    className={`${inputCls} max-w-[140px]`}
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.currentTarget.value)}
                    placeholder="key name"
                    aria-label="New key name"
                  />
                  <Button
                    size="sm"
                    disabled={keysBusy}
                    onClick={() => void onCreateKey()}
                  >
                    Create key
                  </Button>
                </div>

                <p className="mt-4 text-xs text-[#5f5f5d]">
                  CLI testing:
                  <code className="mx-1 rounded bg-[rgba(28,28,28,0.04)] px-1">
                    memost login
                  </code>
                  then run
                  <code className="mx-1 rounded bg-[rgba(28,28,28,0.04)] px-1">
                    memost agents list
                  </code>
                  .
                </p>
              </div>
            )}
          </div>
        </div>

        <aside className="memost-card p-5 xl:sticky xl:top-24 xl:self-start">
          <h2 className="mb-3 text-lg font-semibold text-[#1c1c1c]">
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
                placeholder="customer-support-agent"
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
                Process / project identifier; memories without a pid will fall into this scope.
              </p>
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create agent"}
            </Button>
          </form>

          {revealedKey ? (
            <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">
                API key · {revealedKey.apiKey.name}
              </p>
              <p className="mt-1 text-xs">
                Agent {revealedKey.agentId} - shown once, copy it now.
              </p>
              <code className="mt-2 block break-all rounded bg-background px-2 py-2 text-xs">
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
              <button
                type="button"
                className="mt-2 ml-3 text-xs underline"
                onClick={() => setRevealedKey(null)}
              >
                Close
              </button>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
