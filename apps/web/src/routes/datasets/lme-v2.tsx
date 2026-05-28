import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ArrowLeft, ArrowRight, Database, Search } from "lucide-react";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";

type View = "questions" | "haystacks" | "trajectories" | "states";
type Row = Record<string, unknown>;

interface SummaryPayload {
  metadata?: { version?: string; imported_at?: string; trajectories_source_path?: string | null };
  counts: { questions: number; haystacks: number; trajectories: number; states: number };
  domains: Array<{ domain: string; count: number }>;
  questionTypes: Array<{ question_type: string | null; count: number }>;
  tiers: Array<{ tier: string; count: number }>;
}

export const Route = createFileRoute("/datasets/lme-v2")({
  component: LmeV2DatasetPage,
});

const pageSize = 25;

function LmeV2DatasetPage() {
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [view, setView] = useState<View>("questions");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [domain, setDomain] = useState("");
  const [environment, setEnvironment] = useState("");
  const [questionType, setQuestionType] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [trajectoryId, setTrajectoryId] = useState("");
  const [tier, setTier] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/datasets/lme-v2?view=summary")
      .then((res) => res.json() as Promise<SummaryPayload>)
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ view, limit: String(pageSize), offset: String(offset) });
    if ((view === "questions" || view === "trajectories") && domain.trim()) params.set("domain", domain.trim());
    if ((view === "questions" || view === "trajectories") && environment.trim()) {
      params.set("environment", environment.trim());
    }
    if (view === "questions" && questionType.trim()) params.set("questionType", questionType.trim());
    if ((view === "questions" || view === "haystacks") && questionId.trim()) {
      params.set("questionId", questionId.trim());
    }
    if ((view === "trajectories" || view === "states") && trajectoryId.trim()) {
      params.set("trajectoryId", trajectoryId.trim());
    }
    if (view === "haystacks" && tier.trim()) params.set("tier", tier.trim());
    if (query.trim()) params.set("q", query.trim());

    setLoading(true);
    setError(null);
    fetch(`/api/datasets/lme-v2?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<{ rows: Row[]; total: number }>;
      })
      .then((payload) => {
        setRows(payload.rows);
        setTotal(payload.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [view, offset, domain, environment, questionType, questionId, trajectoryId, tier, query]);

  const columns = useMemo(() => getColumns(view), [view]);
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });
  const page = Math.floor(offset / pageSize) + 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="memost-page">
      <DatasetHeader />
      <section className="px-[clamp(18px,4vw,56px)] py-8">
        <div className="mx-auto max-w-[1440px]">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.68fr)_minmax(320px,0.32fr)]">
            <div>
              <p className="memost-kicker mb-3 inline-flex items-center gap-2">
                <Database className="size-4" />
                Public benchmark dataset
              </p>
              <h1 className="max-w-[820px] text-[clamp(42px,7vw,76px)] font-semibold leading-none tracking-[-1.5px]">
                LongMemEval-V2 agent memory benchmark.
              </h1>
              <p className="memost-body mt-5 max-w-[760px] text-lg leading-8">
                Browse V2 questions, small and medium haystack mappings, and
                optional trajectory previews for web and enterprise agent
                environments.
              </p>
            </div>
            <div className="memost-card grid content-start gap-3 p-4">
              <Metric label="Questions" value={summary?.counts.questions ?? 0} />
              <Metric label="Haystacks" value={summary?.counts.haystacks ?? 0} />
              <Metric label="Trajectories" value={summary?.counts.trajectories ?? 0} />
              <Metric label="State previews" value={summary?.counts.states ?? 0} />
              <BadgeList rows={summary?.domains ?? []} labelKey="domain" />
            </div>
          </div>

          <section className="mt-8 overflow-hidden rounded-xl border border-[#eceae4] bg-[#f7f4ed]">
            <div className="grid gap-4 border-b border-[#eceae4] p-4 xl:grid-cols-[auto_1fr_auto]">
              <ViewTabs view={view} setView={setView} setOffset={setOffset} />
              <div className="grid gap-2 md:grid-cols-[110px_150px_150px_minmax(180px,1fr)_130px]">
                <Input
                  disabled={view === "haystacks" || view === "states"}
                  placeholder="domain"
                  value={domain}
                  onChange={(event) => {
                    setDomain(event.target.value);
                    setOffset(0);
                  }}
                />
                <Input
                  disabled={view === "haystacks" || view === "states"}
                  placeholder="environment"
                  value={environment}
                  onChange={(event) => {
                    setEnvironment(event.target.value);
                    setOffset(0);
                  }}
                />
                <Input
                  disabled={view !== "questions"}
                  placeholder="question type"
                  value={questionType}
                  onChange={(event) => {
                    setQuestionType(event.target.value);
                    setOffset(0);
                  }}
                />
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5f5f5d]" />
                  <Input
                    className="pl-9"
                    disabled={view === "haystacks"}
                    placeholder="search text"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setOffset(0);
                    }}
                  />
                </label>
                <Input
                  disabled={view !== "haystacks"}
                  placeholder="tier"
                  value={tier}
                  onChange={(event) => {
                    setTier(event.target.value);
                    setOffset(0);
                  }}
                />
              </div>
              <Pagination page={page} pageCount={pageCount} total={total} offset={offset} setOffset={setOffset} />
              <div className="xl:col-start-2">
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    disabled={view !== "questions" && view !== "haystacks"}
                    placeholder="question id"
                    value={questionId}
                    onChange={(event) => {
                      setQuestionId(event.target.value);
                      setOffset(0);
                    }}
                  />
                  <Input
                    disabled={view !== "trajectories" && view !== "states"}
                    placeholder="trajectory id"
                    value={trajectoryId}
                    onChange={(event) => {
                      setTrajectoryId(event.target.value);
                      setOffset(0);
                    }}
                  />
                </div>
              </div>
            </div>

            {error ? <div className="p-5 text-sm font-semibold text-red-700">{error}</div> : null}
            <DataTable columns={columns} loading={loading} table={table} />
          </section>
        </div>
      </section>
    </main>
  );
}

function DatasetHeader() {
  return (
    <header className="border-b border-[#eceae4] bg-[#f7f4ed] px-[clamp(18px,4vw,56px)] py-5">
      <nav className="flex items-center justify-between gap-4">
        <a className="inline-flex items-center gap-2 font-semibold" href="/">
          <span className="memost-logo-mark size-9">m</span>
          Memo.st
        </a>
        <div className="flex items-center gap-4 text-sm font-semibold text-[rgba(28,28,28,0.82)]">
          <a href="/datasets/locomo">LoCoMo</a>
          <a href="/datasets/lme">LME</a>
          <a href="/dashboard">Dashboard</a>
        </div>
      </nav>
    </header>
  );
}

function DataTable({
  columns,
  loading,
  table,
}: {
  columns: ColumnDef<Row>[];
  loading: boolean;
  table: ReturnType<typeof useReactTable<Row>>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-[#eceae4] text-xs uppercase tracking-[0.06em] text-[#5f5f5d]">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th className="border-b border-[#eceae4] px-4 py-3" key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td className="px-4 py-8 text-center text-[#5f5f5d]" colSpan={columns.length}>
                Loading dataset rows...
              </td>
            </tr>
          ) : null}
          {!loading && table.getRowModel().rows.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-center text-[#5f5f5d]" colSpan={columns.length}>
                No rows match this view.
              </td>
            </tr>
          ) : null}
          {!loading
            ? table.getRowModel().rows.map((row) => (
                <tr className="border-b border-[#eceae4] align-top hover:bg-[rgba(28,28,28,0.03)]" key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td className="max-w-[560px] px-4 py-3 leading-6" key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            : null}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  total,
  offset,
  setOffset,
}: {
  page: number;
  pageCount: number;
  total: number;
  offset: number;
  setOffset: (offset: number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 text-sm text-[#5f5f5d]">
      <Button
        size="icon"
        variant="outline"
        disabled={offset === 0}
        onClick={() => setOffset(Math.max(0, offset - pageSize))}
        title="Previous page"
      >
        <ArrowLeft className="size-4" />
      </Button>
      <span className="min-w-[92px] text-center font-semibold">
        {page} / {pageCount}
      </span>
      <Button
        size="icon"
        variant="outline"
        disabled={offset + pageSize >= total}
        onClick={() => setOffset(offset + pageSize)}
        title="Next page"
      >
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

function ViewTabs({
  view,
  setView,
  setOffset,
}: {
  view: View;
  setView: (view: View) => void;
  setOffset: (offset: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(["questions", "haystacks", "trajectories", "states"] as const).map((nextView) => (
        <button
          className={`min-h-10 rounded-md px-4 text-sm font-normal transition ${
            view === nextView
              ? "bg-[#1c1c1c] text-[#f7f4ed]"
              : "border border-[#eceae4] bg-background text-[rgba(28,28,28,0.82)]"
          }`}
          key={nextView}
          type="button"
          onClick={() => {
            setView(nextView);
            setOffset(0);
          }}
        >
          {nextView}
        </button>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-end justify-between gap-4 rounded-md border border-[#eceae4] bg-[rgba(28,28,28,0.03)] px-4 py-3">
      <span className="text-sm font-semibold text-[#5f5f5d]">{label}</span>
      <span className="text-2xl font-bold text-[#1c1c1c]">{value.toLocaleString()}</span>
    </div>
  );
}

function BadgeList({ rows, labelKey }: { rows: Array<Record<string, unknown>>; labelKey: string }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {rows.map((item) => (
        <span
          className="rounded-full border border-[#eceae4] bg-[rgba(28,28,28,0.03)] px-3 py-1.5 text-xs font-semibold text-[rgba(28,28,28,0.82)]"
          key={String(item[labelKey])}
        >
          {String(item[labelKey] ?? "n/a")}: {Number(item.count ?? 0).toLocaleString()}
        </span>
      ))}
    </div>
  );
}

function getColumns(view: View): ColumnDef<Row>[] {
  if (view === "haystacks") {
    return [
      col("tier", "Tier"),
      col("question_id", "Question"),
      col("domain", "Domain"),
      col("environment", "Environment"),
      col("trajectory_count", "Trajectories"),
      jsonPreviewCol("trajectory_ids_json", "Trajectory IDs"),
    ];
  }
  if (view === "trajectories") {
    return [
      col("id", "Trajectory"),
      col("domain", "Domain"),
      col("environment", "Environment"),
      col("outcome", "Outcome"),
      col("goal", "Goal"),
      col("state_count", "States"),
      boolCol("raw_json_truncated", "Raw truncated"),
    ];
  }
  if (view === "states") {
    return [
      col("trajectory_id", "Trajectory"),
      col("state_index", "State"),
      col("url", "URL"),
      col("action", "Action"),
      col("thought", "Thought"),
      col("accessibility_tree_preview", "Accessibility preview"),
    ];
  }
  return [
    col("id", "Question"),
    col("domain", "Domain"),
    col("environment", "Environment"),
    col("question_type", "Type"),
    col("question", "Question"),
    col("expected_answer", "Answer"),
    col("eval_function", "Evaluator"),
  ];
}

function col(key: string, header: string): ColumnDef<Row> {
  return {
    accessorKey: key,
    header,
    cell: ({ getValue }) => {
      const value = getValue();
      if (value === null || value === undefined || value === "") return <span className="text-[#8a968f]">-</span>;
      return String(value);
    },
  };
}

function boolCol(key: string, header: string): ColumnDef<Row> {
  return {
    accessorKey: key,
    header,
    cell: ({ getValue }) => (Number(getValue() ?? 0) ? "yes" : "no"),
  };
}

function jsonPreviewCol(key: string, header: string): ColumnDef<Row> {
  return {
    accessorKey: key,
    header,
    cell: ({ getValue }) => parseJsonPreview(String(getValue() ?? "")),
  };
}

function parseJsonPreview(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.slice(0, 8).join(", ");
    return String(parsed);
  } catch {
    return value;
  }
}
