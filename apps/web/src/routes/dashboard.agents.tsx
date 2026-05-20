import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@repo/design-system/components/ui/button";
import type { Agent, ApiKey, ApiKeyWithSecret } from "../lib/types";

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
        `删除 Agent「${agent.name}」？其记忆、图谱与 API Key 将一并删除。`,
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
    if (!window.confirm(`吊销 Key「${key.name}」（${key.prefix}…）？`)) return;
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
        <p className="mb-2 text-sm font-extrabold uppercase tracking-[0.08em] text-[#3b7055]">
          Agents
        </p>
        <h1 className="text-3xl font-semibold leading-[0.98] text-[#132018] md:text-4xl">
          Agent 管理
        </h1>
        <p className="mt-4 max-w-[720px] text-base leading-[1.55] text-[#415548]">
          组织记忆按三层作用域划分：
          <strong className="font-semibold text-[#132018]"> Agent</strong>
          （最大单位）→
          <strong className="font-semibold text-[#132018]"> pid</strong>
          （process / project）→
          <strong className="font-semibold text-[#132018]"> tid</strong>
          （thread / 会话，可选）。每条记忆与图谱三元组都挂在该层级下。
        </p>
        <div className="mt-4 rounded-lg border border-[rgba(31,57,42,0.12)] bg-[rgba(255,254,249,0.65)] px-4 py-3 font-mono text-xs text-[#415548]">
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
            <h2 className="mb-4 text-lg font-semibold text-[#132018]">
              Agent 列表
            </h2>
            {agents === null ? (
              <p className="text-sm text-[#54665a]">加载中…</p>
            ) : agents.length === 0 ? (
              <p className="text-sm text-[#54665a]">
                尚无 Agent，请在右侧创建。
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
                          ? "w-full rounded-xl border-2 border-[#244c37] bg-[rgba(36,76,55,0.08)] px-4 py-3 text-left shadow-[0_12px_36px_rgba(18,35,25,0.06)]"
                          : "w-full rounded-xl border border-[rgba(31,57,42,0.14)] bg-[rgba(255,254,249,0.78)] px-4 py-3 text-left shadow-[0_12px_36px_rgba(18,35,25,0.05)] hover:border-[rgba(36,76,55,0.35)]"
                      }
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold text-[#132018]">
                          {agent.name}
                        </span>
                        <code className="text-[10px] text-[#54665a]">
                          {agent.id}
                        </code>
                      </div>
                      {agent.description ? (
                        <p className="mt-1 text-sm text-[#415548] line-clamp-2">
                          {agent.description}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-[#54665a]">
                        默认 pid: {agent.default_pid}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold text-[#132018]">
              {selected ? selected.name : "选择 Agent"}
            </h2>
            {!selected ? (
              <p className="text-sm text-[#54665a]">
                从左侧选择一个 Agent 以管理 API Key。
              </p>
            ) : (
              <div className="rounded-xl border border-[rgba(31,57,42,0.14)] bg-[rgba(255,254,249,0.78)] p-4 shadow-[0_18px_50px_rgba(18,35,25,0.06)] backdrop-blur">
                <p className="text-sm text-[#415548]">
                  <code className="text-xs">{selected.id}</code>
                </p>
                <p className="mt-2 text-xs text-[#54665a]">
                  记忆作用域：此 Agent 下所有 pid；tid 在 Playground 或 API
                  中按需传入。
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
                    在 Playground 试用
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void onDeleteAgent(selected)}
                  >
                    删除 Agent
                  </Button>
                </div>

                <h3 className="mt-6 mb-2 text-sm font-semibold text-[#132018]">
                  API Keys
                </h3>
                {keysBusy && keys === null ? (
                  <p className="text-xs text-[#54665a]">加载 Keys…</p>
                ) : keys && keys.length === 0 ? (
                  <p className="text-xs text-[#54665a]">尚无 Key。</p>
                ) : (
                  <ul className="grid gap-2">
                    {(keys ?? []).map((key) => (
                      <li
                        key={key.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgba(31,57,42,0.1)] bg-[#fbfaf6] px-3 py-2 text-xs"
                      >
                        <div>
                          <span className="font-semibold text-[#132018]">
                            {key.name}
                          </span>
                          <code className="ml-2 text-[#54665a]">
                            {key.prefix}…
                          </code>
                          {key.revoked_at ? (
                            <span className="ml-2 text-red-600">已吊销</span>
                          ) : null}
                        </div>
                        {!key.revoked_at ? (
                          <button
                            type="button"
                            className="text-[#3b7055] underline"
                            disabled={keysBusy}
                            onClick={() => void onRevokeKey(key)}
                          >
                            吊销
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
                    aria-label="新 Key 名称"
                  />
                  <Button
                    size="sm"
                    disabled={keysBusy}
                    onClick={() => void onCreateKey()}
                  >
                    新建 Key
                  </Button>
                </div>

                <p className="mt-4 text-xs text-[#54665a]">
                  CLI 调试：
                  <code className="mx-1 rounded bg-[rgba(31,57,42,0.08)] px-1">
                    memost login
                  </code>
                  后使用
                  <code className="mx-1 rounded bg-[rgba(31,57,42,0.08)] px-1">
                    memost agents list
                  </code>
                  。
                </p>
              </div>
            )}
          </div>
        </div>

        <aside className="rounded-xl border border-[rgba(31,57,42,0.14)] bg-[rgba(255,254,249,0.78)] p-5 shadow-[0_18px_50px_rgba(18,35,25,0.06)] backdrop-blur xl:sticky xl:top-24 xl:self-start">
          <h2 className="mb-3 text-lg font-semibold text-[#132018]">
            创建 Agent
          </h2>
          <form className="grid gap-3" onSubmit={onCreate}>
            <div>
              <label className={labelCls} htmlFor="agent-name">
                名称
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
                描述
              </label>
              <input
                id="agent-desc"
                className={inputCls}
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
                placeholder="客户支持助手"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="agent-pid">
                默认 pid
              </label>
              <input
                id="agent-pid"
                className={inputCls}
                value={defaultPid}
                onChange={(e) => setDefaultPid(e.currentTarget.value)}
                placeholder="default"
              />
              <p className={helpCls}>
                process / project 标识；未传 pid 的记忆会落在此作用域。
              </p>
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? "创建中…" : "创建 Agent"}
            </Button>
          </form>

          {revealedKey ? (
            <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">
                API Key · {revealedKey.apiKey.name}
              </p>
              <p className="mt-1 text-xs">
                Agent {revealedKey.agentId} — 仅显示一次，请复制保存。
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
                复制到剪贴板
              </button>
              <button
                type="button"
                className="mt-2 ml-3 text-xs underline"
                onClick={() => setRevealedKey(null)}
              >
                关闭
              </button>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
