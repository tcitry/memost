import {
  SignInButton,
  SignOutButton,
  UserButton,
  useUser,
} from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";

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
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">m</span>
          <span>memo.st</span>
        </a>
        <nav className="nav-actions" aria-label="Primary navigation">
          <a className="nav-link" href="#platform">
            Platform
          </a>
          {isLoaded && !isSignedIn ? (
            <SignInButton mode="modal">
              <button className="button primary" type="button">
                Sign in
              </button>
            </SignInButton>
          ) : null}
          {isLoaded && isSignedIn ? (
            <>
              <SignOutButton>
                <button className="button" type="button">
                  Sign out
                </button>
              </SignOutButton>
              <UserButton />
            </>
          ) : null}
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Agent memory SaaS on Cloudflare Workers</p>
            <h1>memo.st remembers what your agents should not relearn.</h1>
            <p className="lede">
              A durable memory layer for AI products: capture facts, resolve
              identity, retrieve context by organization, and keep agent
              behavior consistent across sessions.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="/api/memories">
                Inspect API
              </a>
              {isLoaded && !isSignedIn ? (
                <SignInButton mode="modal">
                  <button className="button" type="button">
                    Create workspace
                  </button>
                </SignInButton>
              ) : null}
            </div>
            <div className="trust-row" aria-label="Platform capabilities">
              <span className="pill">Clerk organizations</span>
              <span className="pill">TanStack Start SSR</span>
              <span className="pill">Cloudflare edge runtime</span>
            </div>
          </div>

          <aside className="memory-console" aria-label="Memory retrieval preview">
            <div className="console-header">
              <div>
                <p className="console-title">Memory graph</p>
                <p className="console-subtitle">tenant: memo-demo / query: renewal risk</p>
              </div>
              <span className="status">Live</span>
            </div>
            <div className="memory-list">
              {memories.map((memory) => (
                <article className="memory-item" key={memory.agent}>
                  <span className="memory-meta">{memory.agent}</span>
                  <p className="memory-text">{memory.text}</p>
                  <span className="memory-score">{memory.score}</span>
                </article>
              ))}
            </div>
          </aside>
        </section>

        <section className="section" id="platform">
          <div className="section-grid">
            <article className="feature">
              <h2>Tenant-scoped memory</h2>
              <p>
                Model users, organizations, projects, and agents as first-class
                boundaries so every retrieval call has explicit ownership.
              </p>
            </article>
            <article className="feature">
              <h2>Edge retrieval API</h2>
              <p>
                Run low-latency memory reads on Workers, then attach Vectorize,
                D1, Durable Objects, or external embedding providers as needed.
              </p>
            </article>
            <article className="feature">
              <h2>Product-ready auth</h2>
              <p>
                Clerk handles user sessions and team workspaces while TanStack
                Router keeps application routes typed and composable.
              </p>
            </article>
          </div>
        </section>
      </main>
    </>
  );
}
