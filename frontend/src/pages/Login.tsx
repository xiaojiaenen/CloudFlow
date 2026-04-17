import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BrandMark } from "@/src/components/BrandMark";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { useAuth } from "@/src/context/AuthContext";
import { useNotice } from "@/src/context/NoticeContext";
import { BRAND, buildPageTitle } from "@/src/lib/brand";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { notify } = useNotice();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    document.title = buildPageTitle("登录");
  }, []);

  const redirectTo = useMemo(() => {
    return (location.state as { from?: string } | null)?.from ?? "/";
  }, [location.state]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage("");
    const normalizedEmail = email.trim();

    try {
      setIsSubmitting(true);
      const user = await login(normalizedEmail, password);
      notify({
        tone: "success",
        title: "登录成功",
        description: `欢迎回来，${user.name}。`,
        durationMs: 2400,
      });
      navigate(user.role === "admin" && redirectTo === "/login" ? "/admin" : redirectTo, {
        replace: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "登录失败，请稍后重试。";
      setErrorMessage(message);
      notify({
        tone: "error",
        title: "登录失败",
        description: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#081018] px-4">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(163,230,53,0.08),transparent_30%),linear-gradient(180deg,#081018_0%,#09090b_100%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] opacity-20" />

      <Card className="w-full max-w-md border-white/[0.08] bg-[#121212]/80 shadow-2xl backdrop-blur-xl">
        <CardHeader className="items-center space-y-4 text-center">
          <BrandMark className="h-14 w-14" />
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-zinc-500">{BRAND.name}</div>
            <CardTitle className="mt-2 text-2xl font-semibold tracking-tight">登录 CloudFlow</CardTitle>
            <CardDescription className="mt-2 text-zinc-400">
              使用你的正式账号进入工作区、监控中心和管理后台。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-zinc-300">
                邮箱地址
              </label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="border-white/[0.08] bg-black/50 focus-visible:ring-blue-500/50"
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-zinc-300">
                密码
              </label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="border-white/[0.08] bg-black/50 focus-visible:ring-blue-500/50"
                autoComplete="current-password"
              />
            </div>

            {errorMessage ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {errorMessage}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={isSubmitting || !email.trim() || !password.trim()}>
              {isSubmitting ? "登录中..." : "登录"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
