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
          <p className="mb-2 text-sm font-extrabold uppercase tracking-[0.08em] text-[#3b7055]">
            Workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-normal text-[#132018] md:text-4xl">
            Dashboard
          </h1>
          <p className="mt-4 max-w-[650px] text-base leading-[1.55] text-[#415548]">
            Manage agents, inspect retrieved memories, and tune retrieval
            pipelines from one place.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-[rgba(31,57,42,0.14)] bg-[rgba(255,254,249,0.78)] p-5 shadow-[0_18px_50px_rgba(18,35,25,0.06)] backdrop-blur">
            <h2 className="text-base font-semibold text-[#132018]">Agents</h2>
            <p className="mt-2 text-sm leading-6 text-[#415548]">
              Create isolated agents and manage their API keys.
            </p>
            <div className="mt-4">
              <Button render={<Link to="/dashboard/agents" />}>
                Manage agents
              </Button>
            </div>
          </section>
          <section className="rounded-xl border border-[rgba(31,57,42,0.14)] bg-[rgba(255,254,249,0.78)] p-5 shadow-[0_18px_50px_rgba(18,35,25,0.06)] backdrop-blur">
            <h2 className="text-base font-semibold text-[#132018]">
              Playground
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#415548]">
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
