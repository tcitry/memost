import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@repo/design-system/components/ui/button";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardOverview,
});

function DashboardOverview() {
  return (
    <main className="flex-1 px-[clamp(20px,4vw,40px)] py-8">
      <div className="grid gap-6">
        <header className="max-w-[760px]">
          <p className="memost-kicker mb-2">
            Workspace
          </p>
          <h1 className="memost-heading text-3xl md:text-4xl">
            Dashboard
          </h1>
          <p className="memost-body mt-4 max-w-[650px] text-base">
            Manage agents, inspect retrieved memories, and tune retrieval
            pipelines from one place.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="memost-card p-5">
            <h2 className="text-base font-semibold text-[#1c1c1c]">Agents</h2>
            <p className="mt-2 text-sm leading-6 text-[rgba(28,28,28,0.82)]">
              Create isolated agents and manage their API keys.
            </p>
            <div className="mt-4">
              <Button render={<Link to="/dashboard/agents" />}>
                Manage agents
              </Button>
            </div>
          </section>
          <section className="memost-card p-5">
            <h2 className="text-base font-semibold text-[#1c1c1c]">Evals</h2>
            <p className="mt-2 text-sm leading-6 text-[rgba(28,28,28,0.82)]">
              Run LoCoMo full, batch, or single-item evaluations against an
              agent endpoint.
            </p>
            <div className="mt-4">
              <Button variant="outline" render={<Link to="/dashboard/evals" />}>
                Open evals
              </Button>
            </div>
          </section>
          <section className="memost-card p-5">
            <h2 className="text-base font-semibold text-[#1c1c1c]">
              Playground
            </h2>
            <p className="mt-2 text-sm leading-6 text-[rgba(28,28,28,0.82)]">
              Send memory add and search requests against a live agent.
            </p>
            <div className="mt-4">
              <Button
                variant="outline"
                render={
                  <Link to="/dashboard/playground" search={{ agent: undefined }} />
                }
              >
                Open playground
              </Button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
