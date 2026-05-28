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

type View = "questions" | "sessions" | "turns";
type Row = Record<string, unknown>;

interface SummaryPayload {
  metadata?: { version?: string; imported_at?: string; raw_json_max_bytes?: number };
  counts: { questions: number; sessions: number; turns: number };
  variants: Array<{ variant: string; count: number }>;
  questionTypes: Array<{ question_type: string | null; count: number }>;
}

export const Route = createFileRoute("/datasets/lme")({
  component: LmeDatasetPage,
});

const pageSize = 25;

function LmeDatasetPage() {
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [view, setView] = useState<View>("questions");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [variant, setVariant] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [questionType, setQuestionType] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/datasets/lme?view=summary")
      .then((res) => res.json() as Promise<SummaryPayload>)
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ view, limit: String(pageSize), offset: String(offset) });
    if (variant.trim()) params.set("variant", variant.trim());
    if (questionId.trim()) params.set("questionId", questionId.trim());
    if (view === "questions" && questionType.trim()) params.set("questionType", questionType.trim());
    if (query.trim()) params.set("q", query.trim());

    setLoading(true);
    setError(null);
    fetch(`/api/datasets/lme?${params}`)
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
  }, [view, offset, variant, questionId, questionType, query]);

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
                LongMemEval cleaned memory benchmark.
              </h1>
              <p className="memost-body mt-5 max-w-[760px] text-lg leading-8">
                Browse LongMemEval question variants, oracle or long-history
                sessions, and turn-level evidence labels from the shared
                benchmark D1 database.
              </p>
            </div>
            <div className="memost-card grid content-start gap-3 p-4">
              <Metric label="Questions" value={summary?.counts.questions ?? 0} />
              <Metric label="Sessions" value={summary?.counts.sessions ?? 0} />
              <Metric label="Turns" value={summary?.counts.turns ?? 0} />
              <BadgeList rows={summary?.variants ?? []} labelKey="variant" />
            </div>
          </div>

          <DatasetTable
            columns={columns}
            error={error}
            loading={loading}
            page={page}
            pageCount={pageCount}
            table={table}
            total={total}
            offset={offset}
            setOffset={setOffset}
          >
            <ViewTabs view={view} setView={setView} setOffset={setOffset} />
            <div className="grid gap-2 md:grid-cols-[130px_minmax(150px,0.45fr)_minmax(180px,1fr)_170px]">
              <Input
                placeholder="variant"
                value={variant}
                onChange={(event) => {
                  setVariant(event.target.value);
                  setOffset(0);
                }}
              />
              <Input
                placeholder="question id"
                value={questionId}
                onChange={(event) => {
                  setQuestionId(event.target.value);
                  setOffset(0);
                }}
              />
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5f5f5d]" />
                <Input
                  className="pl-9"
                  placeholder="search text"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setOffset(0);
                  }}
                />
              </label>
              <Input
                disabled={view !== "questions"}
                placeholder="question type"
                value={questionType}
                onChange={(event) => {
                  setQuestionType(event.target.value);
                  setOffset(0);
                }}
              />
            </div>
          </DatasetTable>
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
          <a href="/datasets/lme-v2">LME-V2</a>
          <a href="/dashboard">Dashboard</a>
        </div>
      </nav>
    </header>
  );
}

function DatasetTable({
  children,
  columns,
  error,
  loading,
  page,
  pageCount,
  table,
  total,
  offset,
  setOffset,
}: {
  children: React.ReactNode;
  columns: ColumnDef<Row>[];
  error: string | null;
  loading: boolean;
  page: number;
  pageCount: number;
  table: ReturnType<typeof useReactTable<Row>>;
  total: number;
  offset: number;
  setOffset: (offset: number) => void;
}) {
  return (
    <section className="mt-8 overflow-hidden rounded-xl border border-[#eceae4] bg-[#f7f4ed]">
      <div className="grid gap-4 border-b border-[#eceae4] p-4 xl:grid-cols-[auto_1fr_auto]">
        {children}
        <Pagination page={page} pageCount={pageCount} total={total} offset={offset} setOffset={setOffset} />
      </div>
      {error ? <div className="p-5 text-sm font-semibold text-red-700">{error}</div> : null}
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
    </section>
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
      {(["questions", "sessions", "turns"] as const).map((nextView) => (
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
  if (view === "sessions") {
    return [
      col("variant", "Variant"),
      col("question_id", "Question"),
      col("session_index", "Session"),
      col("session_date", "Date"),
      boolCol("is_answer_session", "Evidence"),
      col("turn_count", "Turns"),
      boolCol("raw_json_truncated", "Raw truncated"),
    ];
  }
  if (view === "turns") {
    return [
      col("variant", "Variant"),
      col("question_id", "Question"),
      col("session_index", "Session"),
      col("turn_index", "#"),
      col("role", "Role"),
      col("content", "Content"),
      boolCol("has_answer", "Answer turn"),
    ];
  }
  return [
    col("variant", "Variant"),
    col("question_id", "Question ID"),
    col("question_type", "Type"),
    boolCol("is_abstention", "Abstain"),
    col("question", "Question"),
    col("expected_answer", "Answer"),
    col("session_count", "Sessions"),
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
