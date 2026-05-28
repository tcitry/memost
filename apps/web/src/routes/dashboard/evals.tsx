import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@repo/design-system/components/ui/button";
import type { EvalDataset, EvalRun } from "../../lib/types";

export const Route = createFileRoute("/dashboard/evals")({
  component: EvalsPage,
});

function EvalsPage() {
  const [datasets, setDatasets] = useState<EvalDataset[]>([]);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [datasetsRes, runsRes] = await Promise.all([
          fetch("/api/evals/datasets"),
          fetch("/api/evals/runs?limit=10"),
        ]);
        const datasetsJson = (await datasetsRes.json()) as {
          datasets?: EvalDataset[];
          error?: string;
        };
        const runsJson = (await runsRes.json()) as {
          runs?: EvalRun[];
          error?: string;
        };
        if (!datasetsRes.ok) {
          throw new Error(datasetsJson.error ?? "Failed to load datasets");
        }
        if (!runsRes.ok) {
          throw new Error(runsJson.error ?? "Failed to load runs");
        }
        setDatasets(datasetsJson.datasets ?? []);
        setRuns(runsJson.runs ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="flex-1 px-[clamp(20px,4vw,40px)] py-8">
      <header className="max-w-[820px]">
        <p className="memost-kicker mb-2">Evals</p>
        <h1 className="memost-heading text-3xl md:text-4xl">
          Evaluation runs
        </h1>
        <p className="memost-body mt-4 max-w-[680px] text-base">
          Track LoCoMo evaluation datasets and recent runs for agent memory
          endpoints.
        </p>
      </header>

      {error ? (
        <p className="mt-6 max-w-[760px] rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(320px,0.4fr)]">
        <div className="memost-card overflow-hidden">
          <div className="border-b border-[#eceae4] px-5 py-4">
            <h2 className="text-base font-semibold text-[#1c1c1c]">
              Recent runs
            </h2>
          </div>
          <div className="grid gap-3 p-5">
            {loading ? (
              <p className="text-sm text-[#5f5f5d]">Loading runs...</p>
            ) : runs.length === 0 ? (
              <p className="text-sm text-[#5f5f5d]">No evaluation runs yet.</p>
            ) : (
              runs.map((run) => (
                <article
                  className="rounded-md border border-[#eceae4] bg-[rgba(28,28,28,0.03)] p-4"
                  key={run.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#1c1c1c]">
                        {run.mode} · {run.status}
                      </p>
                      <p className="mt-1 text-xs text-[#5f5f5d]">{run.id}</p>
                    </div>
                    <span className="rounded-full border border-[#eceae4] px-3 py-1 text-xs text-[rgba(28,28,28,0.82)]">
                      {run.completed_items}/{run.total_items}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-[rgba(28,28,28,0.82)]">
                    {run.endpoint_model || "endpoint"} judged by{" "}
                    {run.judge_model || "judge"}.
                  </p>
                </article>
              ))
            )}
          </div>
        </div>

        <aside className="memost-card p-5 xl:sticky xl:top-24 xl:self-start">
          <h2 className="text-base font-semibold text-[#1c1c1c]">Datasets</h2>
          <div className="mt-4 grid gap-3">
            {loading ? (
              <p className="text-sm text-[#5f5f5d]">Loading datasets...</p>
            ) : datasets.length === 0 ? (
              <p className="text-sm text-[#5f5f5d]">No datasets imported.</p>
            ) : (
              datasets.map((dataset) => (
                <div
                  className="rounded-md border border-[#eceae4] bg-[rgba(28,28,28,0.03)] px-4 py-3"
                  key={dataset.id}
                >
                  <p className="font-semibold text-[#1c1c1c]">
                    {dataset.name}
                  </p>
                  <p className="mt-1 text-xs text-[#5f5f5d]">
                    {dataset.question_count.toLocaleString()} questions ·{" "}
                    {dataset.sample_count.toLocaleString()} samples
                  </p>
                </div>
              ))
            )}
          </div>
          <Button
            className="mt-5"
            variant="outline"
            render={<a href="/datasets/locomo" />}
          >
            Browse LoCoMo
          </Button>
        </aside>
      </section>
    </main>
  );
}
