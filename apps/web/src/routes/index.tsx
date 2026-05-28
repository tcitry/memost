import { SignInButton, UserButton, useUser } from "@clerk/tanstack-react-start";
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
      <header className="memost-nav flex items-center justify-between gap-6 px-[clamp(20px,4vw,56px)] py-5">
        <div className="flex items-center gap-4">
          <a
            className="inline-flex items-center gap-2 font-semibold"
            href="/"
          >
            <span className="memost-logo-mark size-[34px]">
              m
            </span>
            <span>Memo.st</span>
          </a>
          <a
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-transparent px-4 text-sm text-[rgba(28,28,28,0.82)] hover:bg-[rgba(28,28,28,0.04)]"
            href="https://docs.memo.st"
          >
            Docs
          </a>
          <a
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-transparent px-4 text-sm text-[rgba(28,28,28,0.82)] hover:bg-[rgba(28,28,28,0.04)]"
            href="/datasets/locomo"
          >
            LoCoMo
          </a>
          <a
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-transparent px-4 text-sm text-[rgba(28,28,28,0.82)] hover:bg-[rgba(28,28,28,0.04)]"
            href="/datasets/lme"
          >
            LME
          </a>
          <a
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-transparent px-4 text-sm text-[rgba(28,28,28,0.82)] hover:bg-[rgba(28,28,28,0.04)]"
            href="/datasets/lme-v2"
          >
            LME-V2
          </a>
        </div>
        <nav
          className="flex items-center gap-4"
          aria-label="Primary navigation"
        >
          <a
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-[rgba(28,28,28,0.4)] bg-background text-[rgba(28,28,28,0.82)] shadow-[var(--memost-button-shadow)]"
            href="https://github.com/iuvapp/memost"
            aria-label="GitHub repository"
            rel="noreferrer"
            target="_blank"
            title="GitHub repository"
          >
            <Github className="size-[18px]" aria-hidden="true" />
          </a>
          {isLoaded && isSignedIn ? (
            <a
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-transparent px-4 text-sm text-[rgba(28,28,28,0.82)] hover:bg-[rgba(28,28,28,0.04)]"
              href="/dashboard"
            >
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
        <section className="mx-auto grid max-w-[1320px] items-center gap-[clamp(24px,4vw,48px)] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <div className="max-w-[760px]">
            <p className="memost-kicker mb-[18px]">
              Agent memory SaaS on Cloudflare Workers
            </p>
            <h1 className="max-w-[760px] text-[clamp(42px,7vw,76px)] font-semibold leading-[1] text-[#1c1c1c] tracking-[-1.5px]">
              memo.st remembers what your agents should not relearn.
            </h1>
            <p className="mt-[26px] max-w-[650px] text-[clamp(18px,2vw,22px)] leading-[1.55] text-[rgba(28,28,28,0.82)]">
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
            <div
              className="mt-7 flex flex-wrap gap-2 text-sm text-[#5f5f5d]"
              aria-label="Platform capabilities"
            >
              <span className="rounded-full border border-[#eceae4] bg-[rgba(28,28,28,0.03)] px-3 py-[7px]">
                Clerk organizations
              </span>
              <span className="rounded-full border border-[#eceae4] bg-[rgba(28,28,28,0.03)] px-3 py-[7px]">
                TanStack Start SSR
              </span>
              <span className="rounded-full border border-[#eceae4] bg-[rgba(28,28,28,0.03)] px-3 py-[7px]">
                Cloudflare edge runtime
              </span>
            </div>
          </div>

          <aside
            className="overflow-hidden rounded-xl border border-[#eceae4] bg-[#1c1c1c]"
            aria-label="Memory retrieval preview"
          >
            <div className="flex justify-between gap-3 border-b border-white/10 p-[18px] text-[#fcfbf8]/80">
              <div>
                <p className="m-0 font-semibold text-[#fcfbf8]">Memory graph</p>
                <p className="mt-1.5 text-[13px] text-[#fcfbf8]/60">
                  tenant: memo-demo / query: renewal risk
                </p>
              </div>
              <span className="self-start rounded-full bg-white/10 px-[10px] py-[6px] text-xs font-semibold text-[#fcfbf8]">
                Live
              </span>
            </div>
            <div className="grid gap-3 p-[18px]">
              {memories.map((memory) => (
                <article
                  className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.045] p-[14px]"
                  key={memory.agent}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#fcfbf8]/60">
                    {memory.agent}
                  </span>
                  <p className="m-0 leading-[1.5] text-[#fcfbf8]">
                    {memory.text}
                  </p>
                  <span className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-[9px] py-[5px] text-xs text-[#fcfbf8]/70">
                    {memory.score}
                  </span>
                </article>
              ))}
            </div>
          </aside>
        </section>
      </main>
    </>
  );
}
