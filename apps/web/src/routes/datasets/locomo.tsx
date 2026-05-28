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

type View = "samples" | "questions" | "turns";

interface SummaryPayload {
  metadata?: {
    name?: string;
    version?: string;
    imported_at?: string;
  };
  counts: {
    samples: number;
    questions: number;
    turns: number;
  };
  categories: Array<{ category: number | null; count: number }>;
}

interface SampleRow {
  sample_id: string;
  speaker_a: string;
  speaker_b: string;
  question_count: number;
  turn_count: number;
}

interface QuestionRow {
  id: string;
  sample_id: string;
  question_index: number;
  question: string;
  expected_answer: string;
  category: number | null;
  evidence_json: string;
}

interface TurnRow {
  id: string;
  sample_id: string;
  session_index: number;
  turn_index: number;
  dia_id: string;
  speaker: string;
  text: string;
  image_urls_json: string;
  blip_caption: string | null;
  query: string | null;
}

type Row = SampleRow | QuestionRow | TurnRow;

export const Route = createFileRoute("/datasets/locomo")({
  component: LocomoDatasetPage,
});

const pageSize = 25;

function LocomoDatasetPage() {
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [view, setView] = useState<View>("questions");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sampleId, setSampleId] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/datasets/locomo?view=summary")
      .then((res) => res.json() as Promise<SummaryPayload>)
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({
      view,
      limit: String(pageSize),
      offset: String(offset),
    });
    if (view !== "samples" && sampleId.trim()) params.set("sampleId", sampleId.trim());
    if (view === "questions" && category.trim()) params.set("category", category.trim());
    if (view !== "samples" && query.trim()) params.set("q", query.trim());

    setLoading(true);
    setError(null);
    fetch(`/api/datasets/locomo?${params}`)
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
  }, [view, offset, sampleId, category, query]);

  const columns = useMemo(() => getColumns(view), [view]);
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  const page = Math.floor(offset / pageSize) + 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="memost-page">
      <header className="border-b border-[#eceae4] bg-[#f7f4ed] px-[clamp(18px,4vw,56px)] py-5">
        <nav className="flex items-center justify-between gap-4">
          <a className="inline-flex items-center gap-2 font-semibold" href="/">
            <span className="memost-logo-mark size-9">
              m
            </span>
            Memo.st
          </a>
          <a className="text-sm font-semibold text-[rgba(28,28,28,0.82)]" href="/dashboard">
            Dashboard
          </a>
        </nav>
      </header>

      <section className="px-[clamp(18px,4vw,56px)] py-8">
        <div className="mx-auto max-w-[1440px]">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.68fr)_minmax(320px,0.32fr)]">
            <div>
              <p className="memost-kicker mb-3 inline-flex items-center gap-2">
                <Database className="size-4" />
                Public benchmark dataset
              </p>
              <h1 className="max-w-[780px] text-[clamp(42px,7vw,76px)] font-semibold leading-none tracking-[-1.5px]">
                LoCoMo long-context memory benchmark.
              </h1>
              <p className="memost-body mt-5 max-w-[720px] text-lg leading-8">
                Browse samples, question-answer pairs, evidence references, and
                dialogue turns from the shared benchmark D1 database. This
                surface is public and does not require a workspace login.
              </p>
            </div>
            <div className="memost-card grid content-start gap-3 p-4">
              <Metric label="Samples" value={summary?.counts?.samples ?? 0} />
              <Metric label="Questions" value={summary?.counts?.questions ?? 0} />
              <Metric label="Dialogue turns" value={summary?.counts?.turns ?? 0} />
              <div className="mt-2 flex flex-wrap gap-2">
                {(summary?.categories ?? []).map((item) => (
                  <span
                    className="rounded-full border border-[#eceae4] bg-[rgba(28,28,28,0.03)] px-3 py-1.5 text-xs font-semibold text-[rgba(28,28,28,0.82)]"
                    key={String(item.category)}
                  >
                    category {item.category ?? "n/a"}: {item.count}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <section className="mt-8 overflow-hidden rounded-xl border border-[#eceae4] bg-[#f7f4ed]">
            <div className="grid gap-4 border-b border-[#eceae4] p-4 xl:grid-cols-[auto_1fr_auto]">
              <div className="flex flex-wrap gap-2">
                {(["samples", "questions", "turns"] as const).map((nextView) => (
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

              <div className="grid gap-2 md:grid-cols-[minmax(160px,0.4fr)_minmax(180px,1fr)_120px]">
                <Input
                  disabled={view === "samples"}
                  placeholder="sample id"
                  value={sampleId}
                  onChange={(event) => {
                    setSampleId(event.target.value);
                    setOffset(0);
                  }}
                />
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5f5f5d]" />
                  <Input
                    className="pl-9"
                    disabled={view === "samples"}
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
                  placeholder="category"
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value);
                    setOffset(0);
                  }}
                />
              </div>

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
            </div>

            {error ? (
              <div className="p-5 text-sm font-semibold text-red-700">{error}</div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-[#eceae4] text-xs uppercase tracking-[0.06em] text-[#5f5f5d]">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th className="border-b border-[#eceae4] px-4 py-3" key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
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
                            <td className="max-w-[520px] px-4 py-3 leading-6" key={cell.id}>
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
        </div>
      </section>
    </main>
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

function getColumns(view: View): ColumnDef<Row>[] {
  if (view === "samples") {
    return [
      col("sample_id", "Sample"),
      col("speaker_a", "Speaker A"),
      col("speaker_b", "Speaker B"),
      col("question_count", "Questions"),
      col("turn_count", "Turns"),
    ];
  }
  if (view === "turns") {
    return [
      col("sample_id", "Sample"),
      col("session_index", "Session"),
      col("dia_id", "Dialogue"),
      col("speaker", "Speaker"),
      col("text", "Text"),
      col("query", "Image query"),
    ];
  }
  return [
    col("sample_id", "Sample"),
    col("question_index", "#"),
    col("category", "Category"),
    col("question", "Question"),
    col("expected_answer", "Answer"),
    {
      accessorKey: "evidence_json",
      header: "Evidence",
      cell: ({ getValue }) => parseEvidence(String(getValue() ?? "")).join(", "),
    },
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

function parseEvidence(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
