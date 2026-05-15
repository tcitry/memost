import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { ClerkProvider } from "@clerk/tanstack-react-start";
import type { ReactNode } from "react";
import appCss from "../globals.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        title: "memo.st | Agent memory infrastructure",
      },
      {
        name: "description",
        content:
          "memo.st is a Cloudflare-native memory layer for AI agents, copilots, and long-running SaaS workflows.",
      },
    ],
    links: [
      { rel: "icon", href: "/logo.svg", type: "image/svg+xml" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <ClerkProvider>
        <div className="app-shell">
          <Outlet />
        </div>
      </ClerkProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
