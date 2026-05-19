import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <main className="px-[clamp(20px,4vw,56px)] pb-10 pt-[clamp(42px,7vw,96px)]">
      <header className="max-w-[720px]">
        <p className="mb-[18px] text-sm font-extrabold uppercase tracking-[0.08em] text-[#3b7055]">Workspace</p>
        <h1 className="m-0 max-w-[720px] text-[clamp(48px,8vw,92px)] font-semibold leading-[0.94] tracking-normal text-[#132018]">
          Dashboard
        </h1>
        <p className="mt-[26px] max-w-[650px] text-[clamp(18px,2vw,22px)] leading-[1.55] text-[#415548]">
          Signed-in users land here to review memories, usage, and workspace
          activity.
        </p>
      </header>
    </main>
  );
}
