import type { ReactNode } from "react";
import { useEffect } from "react";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/src/context/AuthContext";
import { BRAND, buildPageTitle } from "@/src/lib/brand";
import { cn } from "@/src/lib/utils";
import { BrandMark } from "./BrandMark";

interface AppTopbarProps {
  title: string;
  subtitle: string;
  badge?: string;
  actions?: ReactNode;
  className?: string;
}

export function AppTopbar({ title, subtitle, badge, actions, className }: AppTopbarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    document.title = buildPageTitle(title);
  }, [title]);

  return (
    <div className={cn("border-b border-white/[0.06] bg-zinc-950/70 px-6 py-4 backdrop-blur-xl", className)}>
      <div className="mx-auto flex w-full flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <BrandMark compact />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-xl font-semibold tracking-[0.04em] text-zinc-100">{title}</h1>
              {badge ? (
                <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200">
                  {badge}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="font-medium tracking-[0.24em] text-zinc-500">{BRAND.name}</span>
              <span className="hidden h-1 w-1 rounded-full bg-zinc-700 sm:inline-flex" />
              <span className="line-clamp-2">{subtitle}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {actions}
          <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <div className="text-right">
              <div className="text-xs font-medium text-zinc-100">{user?.name ?? "未登录"}</div>
              <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-zinc-500">
                {user?.role === "admin" ? (
                  <ShieldCheck className="h-3.5 w-3.5 text-sky-400" />
                ) : (
                  <UserRound className="h-3.5 w-3.5 text-zinc-400" />
                )}
                {user?.role === "admin" ? "管理员" : "普通用户"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate("/login", { replace: true });
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-zinc-900/80 text-zinc-300 transition-colors hover:border-white/20 hover:text-white"
              title="退出登录"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
