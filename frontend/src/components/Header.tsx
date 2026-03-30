import { ChevronRight, LogOut, Play, ShieldCheck, Square, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/src/context/AuthContext";
import { cn } from "@/src/lib/utils";

interface HeaderProps {
  isRunning: boolean;
  isCancelling?: boolean;
  runLabel?: string;
  onToggleRun: () => void | Promise<void>;
}

export function Header({
  isRunning,
  isCancelling = false,
  runLabel = "执行工作流",
  onToggleRun,
}: HeaderProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <div className="h-14 flex items-center justify-between flex-1 z-10 relative">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <span className="hover:text-zinc-200 cursor-pointer transition-colors">工作流</span>
        <ChevronRight className="w-4 h-4 opacity-50" />
        <span className="text-zinc-100 font-medium">CloudFlow Workspace</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 mr-4">
          <span className="relative flex h-2 w-2">
            {isRunning && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={cn("relative inline-flex rounded-full h-2 w-2", isRunning ? "bg-emerald-500" : "bg-zinc-600")}
            />
          </span>
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            {isRunning ? (isCancelling ? "Stopping" : "Running") : "Ready"}
          </span>
        </div>

        <button
          onClick={() => void onToggleRun()}
          disabled={isCancelling}
          className={cn(
            "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70",
            isRunning
              ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20"
              : "bg-white text-black hover:bg-zinc-200 shadow-[0_0_15px_rgba(255,255,255,0.1)]",
          )}
        >
          {isRunning ? (
            <>
              <Square className="w-4 h-4 fill-current" />
              {isCancelling ? "停止中..." : "停止执行"}
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              {runLabel}
            </>
          )}
        </button>

        <div className="w-px h-5 bg-white/[0.08] mx-2" />

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-zinc-100 font-medium">{user?.name ?? "未登录"}</div>
            <div className="text-[11px] text-zinc-500 flex items-center justify-end gap-1">
              {user?.role === "admin" ? <ShieldCheck className="w-3 h-3 text-sky-400" /> : <UserRound className="w-3 h-3 text-zinc-400" />}
              {user?.role === "admin" ? "管理员" : "普通用户"}
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
            className="w-8 h-8 rounded-full border border-white/10 bg-zinc-900/80 text-zinc-300 hover:text-white hover:border-white/20 flex items-center justify-center"
            title="退出登录"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
