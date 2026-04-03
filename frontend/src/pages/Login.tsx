import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, UserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { BrandMark } from "@/src/components/BrandMark";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { useAuth } from "@/src/context/AuthContext";
import { BRAND, buildPageTitle } from "@/src/lib/brand";

const quickAccounts = [
  {
    label: "管理员",
    email: "admin@cloudflow.local",
    password: "Admin123456",
    icon: ShieldCheck,
  },
  {
    label: "普通用户",
    email: "user@cloudflow.local",
    password: "User123456",
    icon: UserRound,
  },
];

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("admin@cloudflow.local");
  const [password, setPassword] = useState("Admin123456");
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

    try {
      setIsSubmitting(true);
      const user = await login(email, password);
      navigate(user.role === "admin" && redirectTo === "/login" ? "/admin" : redirectTo, {
        replace: true,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "登录失败，请稍后重试。");
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
            <CardTitle className="mt-2 text-2xl font-semibold tracking-tight">欢迎进入自动化控制台</CardTitle>
            <CardDescription className="mt-2 text-zinc-400">
              登录后即可按角色进入工作区、监控中心或管理后台。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {quickAccounts.map((account) => {
                const Icon = account.icon;
                return (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(account.password);
                    }}
                    className="rounded-xl border border-white/[0.08] bg-black/30 px-3 py-3 text-left transition-colors hover:border-sky-500/30 hover:bg-sky-500/5"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                      <Icon className="h-4 w-4 text-sky-400" />
                      {account.label}
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">{account.email}</div>
                  </button>
                );
              })}
            </div>

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
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-zinc-300">
                  密码
                </label>
                <span className="text-xs text-zinc-500">当前为本地演示账户体系</span>
              </div>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="border-white/[0.08] bg-black/50 focus-visible:ring-blue-500/50"
              />
            </div>

            {errorMessage ? <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{errorMessage}</div> : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "登录中..." : "进入 CloudFlow"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
