import { ChevronRight, Play, Square } from "lucide-react";
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
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span
              className={cn(
                "relative inline-flex rounded-full h-2 w-2",
                isRunning ? "bg-emerald-500" : "bg-zinc-600",
              )}
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

        <div className="w-px h-5 bg-white/[0.08] mx-2"></div>

        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-600 border border-white/10 overflow-hidden ml-2 cursor-pointer">
          <img
            src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
            alt="User Avatar"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </div>
  );
}
