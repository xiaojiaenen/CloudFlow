import type { ReactNode } from "react";
import { useEffect } from "react";
import { Play, Square } from "lucide-react";
import { buildPageTitle } from "@/src/lib/brand";
import { cn } from "@/src/lib/utils";
import { TopbarAccount } from "./TopbarAccount";

interface HeaderProps {
  isRunning: boolean;
  isCancelling?: boolean;
  runLabel?: string;
  onToggleRun: () => void | Promise<void>;
  actions?: ReactNode;
}

export function Header({
  isRunning,
  isCancelling = false,
  runLabel = "运行",
  onToggleRun,
  actions,
}: HeaderProps) {
  useEffect(() => {
    document.title = buildPageTitle("工作区");
  }, []);

  return (
    <div className="flex min-h-[64px] flex-1 flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Workspace</div>
        <div className="mt-1 flex items-center gap-2">
          <div className="truncate text-base font-semibold text-zinc-100">浏览器自动化工作区</div>
          <span className="hidden rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-zinc-400 md:inline-flex">
            {isRunning ? (isCancelling ? "Cancelling" : "Running") : "Ready"}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void onToggleRun()}
          disabled={isCancelling}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70",
            isRunning
              ? "border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20"
              : "bg-white text-black shadow-[0_12px_30px_rgba(255,255,255,0.08)] hover:bg-zinc-200",
          )}
          title={isRunning ? "停止当前执行" : "运行当前工作流"}
        >
          {isRunning ? (
            <>
              <Square className="h-4 w-4 fill-current" />
              {isCancelling ? "停止中..." : "停止"}
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-current" />
              {runLabel}
            </>
          )}
        </button>

        {actions ? <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
        <TopbarAccount />
      </div>
    </div>
  );
}
