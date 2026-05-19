import {
  SignInButton,
  UserButton,
  useUser,
} from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { Github } from "lucide-react";
import { Button } from "@repo/design-system/components/ui/button";

const memories = [
  {
    agent: "support-agent",
    text: "Acme prefers SOC2-ready vendors, EU data residency, and Slack escalation for P0 incidents.",
    score: "0.94 relevance",
  },
  {
    agent: "sales-copilot",
    text: "Renewal discussion should avoid discounting before procurement confirms active seat count.",
    score: "0.89 relevance",
  },
  {
    agent: "research-agent",
    text: "User asked to compare mem0-style APIs with edge-native storage and organization-scoped memory.",
    score: "0.86 relevance",
  },
];

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { isLoaded, isSignedIn } = useUser();

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-6 border-b border-[rgba(31,57,42,0.12)] bg-[rgba(247,245,239,0.84)] px-[clamp(20px,4vw,56px)] py-5 backdrop-blur-[18px]">
        <div className="flex items-center gap-4">
          <a className="inline-flex items-center gap-2 font-bold tracking-normal" href="/">
              <span className="grid size-[34px] place-items-center rounded-lg bg-[#244c37] text-[#f7f5ef] shadow-[inset_0_-8px_18px_rgba(255,255,255,0.12)]">
                m
              </span>
              <span>memo.st</span>
          </a>
          <a className="inline-flex min-h-10 items-center justify-center rounded-lg border border-transparent px-4 text-sm font-semibold text-[#3f5045]" href="https://docs.memo.st">
            Docs
          </a>
        </div>
        <nav className="flex items-center gap-4" aria-label="Primary navigation">
          <a
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-[rgba(31,57,42,0.18)] bg-[rgba(255,254,249,0.9)] text-[#3f5045]"
            href="https://github.com/iuvapp/memost"
            aria-label="GitHub repository"
            rel="noreferrer"
            target="_blank"
            title="GitHub repository"
          >
            <Github className="size-[18px]" aria-hidden="true" />
          </a>
          {isLoaded && isSignedIn ? (
            <a className="inline-flex min-h-10 items-center justify-center rounded-lg border border-transparent px-4 text-sm font-semibold text-[#3f5045]" href="/dashboard">
              Dashboard
            </a>
          ) : null}
          {isLoaded && !isSignedIn ? (
            <SignInButton mode="modal">
              <Button size="lg">Sign in</Button>
            </SignInButton>
          ) : null}
          {isLoaded && isSignedIn ? <UserButton /> : null}
        </nav>
      </header>

      <main className="px-[clamp(20px,4vw,56px)] pb-10 pt-[clamp(42px,7vw,96px)]">
        <section className="grid items-center gap-[clamp(28px,5vw,72px)] lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.86fr)]">
          <div className="max-w-[760px]">
            <p className="mb-[18px] text-sm font-extrabold uppercase tracking-[0.08em] text-[#3b7055]">Agent memory SaaS on Cloudflare Workers</p>
            <h1 className="max-w-[760px] text-[clamp(48px,8vw,92px)] font-semibold leading-[0.94] tracking-normal text-[#132018]">
              memo.st remembers what your agents should not relearn.
            </h1>
            <p className="mt-[26px] max-w-[650px] text-[clamp(18px,2vw,22px)] leading-[1.55] text-[#415548]">
              A durable memory layer for AI products: capture facts, resolve
              identity, retrieve context by organization, and keep agent
              behavior consistent across sessions.
            </p>
            <div className="mt-[34px] flex flex-wrap gap-3">
              <Button size="lg" render={<a href="/api/memories" />}>
                Inspect API
              </Button>
              {isLoaded && !isSignedIn ? (
                <SignInButton mode="modal">
                  <Button size="lg" variant="outline">
                    Create workspace
                  </Button>
                </SignInButton>
              ) : null}
            </div>
            <div className="mt-7 flex flex-wrap gap-2 text-sm text-[#54665a]" aria-label="Platform capabilities">
              <span className="rounded-full border border-[rgba(31,57,42,0.14)] bg-white/55 px-3 py-[7px]">Clerk organizations</span>
              <span className="rounded-full border border-[rgba(31,57,42,0.14)] bg-white/55 px-3 py-[7px]">TanStack Start SSR</span>
              <span className="rounded-full border border-[rgba(31,57,42,0.14)] bg-white/55 px-3 py-[7px]">Cloudflare edge runtime</span>
            </div>
          </div>

          <aside className="overflow-hidden rounded-lg border border-[rgba(31,57,42,0.16)] bg-[#102017] shadow-[0_24px_80px_rgba(18,35,25,0.24)]" aria-label="Memory retrieval preview">
            <div className="flex justify-between gap-3 border-b border-white/10 p-[18px] text-[#cad9cf]">
              <div>
                <p className="m-0 font-bold text-[#f5fff8]">Memory graph</p>
                <p className="mt-1.5 text-[13px] text-[#96a99d]">tenant: memo-demo / query: renewal risk</p>
              </div>
              <span className="self-start rounded-full bg-[rgba(66,185,112,0.18)] px-[10px] py-[6px] text-xs font-bold text-[#d7ffe2]">Live</span>
            </div>
            <div className="grid gap-3 p-[18px]">
              {memories.map((memory) => (
                <article className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.045] p-[14px]" key={memory.agent}>
                  <span className="text-xs font-bold uppercase tracking-wide text-[#8fb29d]">{memory.agent}</span>
                  <p className="m-0 leading-[1.5] text-[#eef7f0]">{memory.text}</p>
                  <span className="w-fit rounded-full bg-[rgba(246,221,155,0.1)] px-[9px] py-[5px] text-xs text-[#f6dd9b]">{memory.score}</span>
                </article>
              ))}
            </div>
          </aside>
        </section>
      </main>
    </>
  );
}
