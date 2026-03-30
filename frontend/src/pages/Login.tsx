import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Globe, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { useAuth } from "@/src/context/AuthContext";

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

  const redirectTo = useMemo(() => {
    return (location.state as { from?: string } | null)?.from ?? "/";
  }, [location.state]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="min-h-screen w-full bg-[#0B0C10] flex items-center justify-center relative overflow-hidden px-4">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-[#0B0C10] to-[#0B0C10] -z-10 bg-breathe" />

      <Card className="w-full max-w-md border-white/[0.08] bg-[#121212]/80 backdrop-blur-xl shadow-2xl">
        <CardHeader className="space-y-3 items-center text-center">
          <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center mb-2 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
            <Globe className="w-6 h-6 text-black" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">欢迎使用 CloudFlow</CardTitle>
          <CardDescription className="text-zinc-400">
            登录后即可按角色进入工作区或管理后台
          </CardDescription>
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
                    className="rounded-xl border border-white/[0.08] bg-black/30 px-3 py-3 text-left hover:border-sky-500/30 hover:bg-sky-500/5 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-zinc-100 text-sm font-medium">
                      <Icon className="w-4 h-4 text-sky-400" />
                      {account.label}
                    </div>
                    <div className="text-xs text-zinc-500 mt-2">{account.email}</div>
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
                className="bg-black/50 border-white/[0.08] focus-visible:ring-blue-500/50"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-zinc-300">
                  密码
                </label>
                <span className="text-xs text-zinc-500">当前为本地演示账号体系</span>
              </div>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="bg-black/50 border-white/[0.08] focus-visible:ring-blue-500/50"
              />
            </div>

            {errorMessage && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {errorMessage}
              </div>
            )}

            <Button type="submit" className="w-full mt-6" disabled={isSubmitting}>
              {isSubmitting ? "登录中..." : "登录"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
