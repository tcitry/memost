import { SignInButton, useAuth } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@repo/design-system/components/ui/button";

/** CLI login callback page: posts the Clerk token back to the local memost CLI. */
export const Route = createFileRoute("/cli/login")({
  component: CliLoginPage,
});

function CliLoginPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [status, setStatus] = useState("Initializing...");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setStatus("Sign in first. After sign-in, the token will be sent to the CLI automatically.");
      return;
    }

    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    const port = params.get("port");
    const state = params.get("state");
    if (!port || !/^\d+$/.test(port)) {
      setStatus("Missing a valid port parameter. Run memost login again from the terminal.");
      return;
    }
    if (!state) {
      setStatus("Missing a state parameter. Run memost login again from the terminal.");
      return;
    }

    void (async () => {
      try {
        const token = await getToken();
        if (!token) {
          setStatus("Unable to fetch a session token. Refresh the page and try again.");
          return;
        }
        const res = await fetch(`http://127.0.0.1:${port}/callback`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, state }),
        });
        if (res.ok) {
          setStatus("Login complete. You can close this tab and return to the terminal.");
        } else {
          setStatus("CLI callback failed. Make sure memost login is still running.");
        }
      } catch {
        setStatus(
          "Unable to connect to the local CLI (127.0.0.1:" +
            port +
            "). Make sure memost login has not timed out.",
        );
      }
    })();
  }, [isLoaded, isSignedIn, getToken]);

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <header>
        <p className="text-sm font-extrabold uppercase tracking-[0.08em] text-[#3b7055]">
          CLI Login
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[#132018]">
          Connect Memost CLI
        </h1>
      </header>
      <p className="text-sm leading-relaxed text-[#415548]">{status}</p>
      {isLoaded && !isSignedIn ? (
        <SignInButton mode="modal">
          <Button size="lg">Sign in</Button>
        </SignInButton>
      ) : null}
    </main>
  );
}
