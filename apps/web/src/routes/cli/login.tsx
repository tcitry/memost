import { SignInButton, useAuth } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@repo/design-system/components/ui/button";

/** CLI 登录回调页：将 Clerk JWT POST 到 memost login 启动的本地服务 */
export const Route = createFileRoute("/cli/login")({
  component: CliLoginPage,
});

function CliLoginPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [status, setStatus] = useState("正在初始化…");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setStatus("请先登录，登录成功后会自动把令牌传给 CLI。");
      return;
    }

    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    const port = params.get("port");
    if (!port || !/^\d+$/.test(port)) {
      setStatus("缺少有效 port 参数。请从终端重新运行 memost login。");
      return;
    }

    void (async () => {
      try {
        const token = await getToken();
        if (!token) {
          setStatus("无法获取会话令牌，请刷新页面重试。");
          return;
        }
        const res = await fetch(`http://127.0.0.1:${port}/callback`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (res.ok) {
          setStatus("登录成功！可以关闭此标签页并返回终端。");
        } else {
          setStatus("CLI 回调失败，请确认 memost login 仍在运行。");
        }
      } catch {
        setStatus(
          "无法连接本地 CLI（127.0.0.1:" +
            port +
            "）。请确认终端里 memost login 未超时。",
        );
      }
    })();
  }, [isLoaded, isSignedIn, getToken]);

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <header>
        <p className="text-sm font-extrabold uppercase tracking-[0.08em] text-[#3b7055]">
          CLI 登录
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[#132018]">
          连接 Memost CLI
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
