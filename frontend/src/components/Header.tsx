import { useEffect } from "react";
import { ChevronRight, LogOut, Play, ShieldCheck, Square, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/src/context/AuthContext";
import { BRAND, buildPageTitle } from "@/src/lib/brand";
import { cn } from "@/src/lib/utils";
import { BrandMark } from "./BrandMark";

interface HeaderProps {
  isRunning: boolean;
  isCancelling?: boolean;
  runLabel?: string;
  onToggleRun: () => void | Promise<void>;
}

export function Header({
  isRunning,
  isCancelling = false,
  runLabel = "运行工作流",
  onToggleRun,
}: HeaderProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    document.title = buildPageTitle("工作区");
  }, []);

  return (
    <div className="flex h-[72px] flex-1 items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 items-center gap-4">
        <BrandMark compact />
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-zinc-500">
            <span>{BRAND.name}</span>
            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
            <span className="text-zinc-300">Workspace</span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <div className="truncate text-base font-semibold text-zinc-100">浏览器自动化工作区</div>
            <span className="hidden rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-zinc-400 md:inline-flex">
              Live Canvas
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 md:flex">
          <span className="relative flex h-2.5 w-2.5">
            {isRunning ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            ) : null}
            <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", isRunning ? "bg-emerald-400" : "bg-zinc-600")} />
          </span>
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            {isRunning ? (isCancelling ? "Stopping" : "Running") : "Ready"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => void onToggleRun()}
          disabled={isCancelling}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70",
            isRunning
              ? "border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20"
              : "bg-white text-black shadow-[0_12px_30px_rgba(255,255,255,0.08)] hover:bg-zinc-200",
          )}
        >
          {isRunning ? (
            <>
              <Square className="h-4 w-4 fill-current" />
              {isCancelling ? "停止中..." : "停止执行"}
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-current" />
              {runLabel}
            </>
          )}
        </button>

        <div className="hidden h-6 w-px bg-white/[0.08] lg:block" />

        <div className="hidden items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 lg:flex">
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
  );
}
