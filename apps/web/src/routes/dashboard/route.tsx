import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
} from "@tanstack/react-router";
import { SignOutButton, UserButton } from "@clerk/tanstack-react-start";
import { auth } from "@clerk/tanstack-react-start/server";
import {
  LayoutDashboard,
  LogOut,
  Bot,
  FlaskConical,
  Gauge,
} from "lucide-react";
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
  to: "/dashboard" | "/dashboard/agents" | "/dashboard/playground" | "/dashboard/evals";
  label: string;
  exact?: boolean;
}

const NAV_LINKS: readonly NavLink[] = [
  { to: "/dashboard", label: "Overview", exact: true },
  { to: "/dashboard/agents", label: "Agents" },
  { to: "/dashboard/playground", label: "Playground" },
  { to: "/dashboard/evals", label: "Evals" },
];

function DashboardLayout() {
  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-svh w-full min-w-0 flex-1 bg-background">
        <div className="flex min-h-svh">
          <Sidebar className="border-[#eceae4] bg-background">
            <SidebarHeader className="gap-3 p-4">
              <Link
                to="/"
                className="inline-flex items-center gap-2 font-semibold"
              >
                <span className="memost-logo-mark size-[34px]">
                  m
                </span>
                <span className="text-[#1c1c1c]">Memo.st</span>
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
                          className="rounded-md data-active:bg-[#1c1c1c] data-active:text-[#fcfbf8] hover:bg-[rgba(28,28,28,0.04)]"
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
                          ) : link.to === "/dashboard/playground" ? (
                            <FlaskConical />
                          ) : (
                            <Gauge />
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
              <div className="flex flex-col gap-1">
                <SignOutButton redirectUrl="/">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton className="rounded-lg text-sm">
                        <LogOut />
                        <span>Sign out</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SignOutButton>
              </div>
            </SidebarFooter>
          </Sidebar>

          <SidebarInset className="flex min-w-0 flex-1 flex-col bg-transparent">
            <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#eceae4] bg-[rgba(247,244,237,0.84)] px-[clamp(20px,4vw,40px)] py-4 backdrop-blur-[18px]">
              <SidebarTrigger />
              <Link
                to="/"
                className="inline-flex items-center gap-2 font-semibold md:hidden"
              >
                <span className="memost-logo-mark size-[30px]">
                  m
                </span>
                <span>Memo.st</span>
              </Link>
              <div className="ml-auto hidden items-center gap-3 md:flex">
                <UserButton />
              </div>
            </header>
            <Outlet />
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}
