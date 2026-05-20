import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
} from "@tanstack/react-router";
import { UserButton } from "@clerk/tanstack-react-start";
import { auth } from "@clerk/tanstack-react-start/server";
import { LayoutDashboard, Bot, FlaskConical } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@repo/design-system/components/ui/sidebar";

// Dashboard layout. SSR-side guard ensures unauthenticated users are
// bounced back to "/" before any dashboard data loads.
export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    if (typeof window !== "undefined") return;
    const session = await auth();
    if (!session?.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: DashboardLayout,
});

interface NavLink {
  to: "/dashboard" | "/dashboard/agents" | "/dashboard/playground";
  label: string;
  exact?: boolean;
}

const NAV_LINKS: readonly NavLink[] = [
  { to: "/dashboard", label: "Overview", exact: true },
  { to: "/dashboard/agents", label: "Agents" },
  { to: "/dashboard/playground", label: "Playground" },
];

function DashboardLayout() {
  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-svh w-full min-w-0 flex-1 bg-[radial-gradient(circle_at_top_left,rgba(44,125,92,0.18),transparent_34rem),linear-gradient(180deg,#fbfaf6_0%,#eef2ec_100%)]">
        <div className="flex min-h-svh">
          <Sidebar className="border-[rgba(31,57,42,0.1)] bg-[rgba(255,254,249,0.82)]">
            <SidebarHeader className="gap-3 p-4">
              <Link
                to="/"
                className="inline-flex items-center gap-2 font-bold tracking-normal"
              >
                <span className="grid size-[34px] place-items-center rounded-lg bg-[#244c37] text-[#f7f5ef] shadow-[inset_0_-8px_18px_rgba(255,255,255,0.12)]">
                  m
                </span>
                <span className="text-[#132018]">Memo.st</span>
              </Link>
              <p className="text-sm text-sidebar-foreground/70">
                Agent memory workspace
              </p>
            </SidebarHeader>
            <SidebarContent className="px-2 py-3">
              <SidebarGroup>
                <SidebarGroupLabel>Workspace</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {NAV_LINKS.map((link) => (
                      <SidebarMenuItem key={link.to}>
                        <SidebarMenuButton
                          className="rounded-lg data-active:bg-[#244c37] data-active:text-[#f7f5ef] hover:bg-[rgba(31,57,42,0.045)]"
                          render={
                            <Link
                              to={link.to}
                              activeOptions={{ exact: link.exact ?? false }}
                            />
                          }
                        >
                          {link.to === "/dashboard" ? (
                            <LayoutDashboard />
                          ) : link.to === "/dashboard/agents" ? (
                            <Bot />
                          ) : (
                            <FlaskConical />
                          )}
                          <span>{link.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarSeparator />
            <SidebarFooter>
              <div className="flex items-center justify-between gap-3">
                <UserButton />
              </div>
            </SidebarFooter>
          </Sidebar>

          <SidebarInset className="flex min-w-0 flex-1 flex-col bg-transparent">
            <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[rgba(31,57,42,0.1)] bg-[rgba(251,250,246,0.72)] px-[clamp(20px,4vw,40px)] py-4 backdrop-blur-[18px]">
              <SidebarTrigger />
              <Link
                to="/"
                className="inline-flex items-center gap-2 font-bold tracking-normal md:hidden"
              >
                <span className="grid size-[30px] place-items-center rounded-lg bg-[#244c37] text-[#f7f5ef]">
                  m
                </span>
                <span>Memo.st</span>
              </Link>
            </header>
            <Outlet />
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}
