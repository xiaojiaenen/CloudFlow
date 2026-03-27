import React from "react";
import { useNavigate } from "react-router-dom";
import { Globe } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";

export default function Login() {
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/");
  };

  return (
    <div className="min-h-screen w-full bg-[#0B0C10] flex items-center justify-center relative overflow-hidden">
      {/* Background Breathing Effect */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-[#0B0C10] to-[#0B0C10] -z-10 bg-breathe"></div>

      <Card className="w-full max-w-md border-white/[0.08] bg-[#121212]/80 backdrop-blur-xl shadow-2xl">
        <CardHeader className="space-y-3 items-center text-center">
          <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center mb-2 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
            <Globe className="w-6 h-6 text-black" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">欢迎使用 CloudFlow</CardTitle>
          <CardDescription className="text-zinc-400">
            登录以管理您的云端自动化工作流
          </CardDescription>
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
                className="bg-black/50 border-white/[0.08] focus-visible:ring-blue-500/50"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-zinc-300">
                  密码
                </label>
                <a href="#" className="text-xs text-blue-400 hover:text-blue-300">
                  忘记密码？
                </a>
              </div>
              <Input
                id="password"
                type="password"
                required
                className="bg-black/50 border-white/[0.08] focus-visible:ring-blue-500/50"
              />
            </div>
            <Button type="submit" className="w-full mt-6">
              登录
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
