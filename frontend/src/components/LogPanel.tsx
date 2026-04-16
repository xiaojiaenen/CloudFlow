import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Terminal, Trash2 } from "lucide-react";
import { cn } from "@/src/lib/utils";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
}

interface LogPanelProps {
  logs: LogEntry[];
  onClear: () => void;
  className?: string;
}

const levelLabelMap: Record<LogEntry["level"], string> = {
  info: "信息",
  warn: "警告",
  error: "错误",
  success: "成功",
};

export function LogPanel({ logs, onClear, className }: LogPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col bg-[#0A0A0A]", className)}>
      <div className="flex h-10 items-center justify-between border-b border-white/[0.08] bg-[#0A0A0A] px-4">
        <div className="flex items-center gap-2 text-zinc-400">
          <Terminal className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium uppercase tracking-wider">执行日志</span>
        </div>
        <button
          onClick={onClear}
          className="text-zinc-500 transition-colors hover:text-zinc-300"
          title="清空日志"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto bg-[#0A0A0A] p-4 font-mono text-[11px] shadow-inner"
      >
        {logs.length === 0 ? (
          <div className="mt-10 text-center text-zinc-600">暂时还没有日志，运行工作流后会在这里持续输出。</div>
        ) : (
          <AnimatePresence initial={false}>
            {logs.map((log) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3"
              >
                <span className="select-none text-zinc-600">{log.timestamp}</span>
                <span
                  className={cn(
                    "w-12 shrink-0 font-medium",
                    log.level === "info" && "text-blue-400/80",
                    log.level === "warn" && "text-amber-400/80",
                    log.level === "error" && "text-red-400/80",
                    log.level === "success" && "text-emerald-400/80",
                  )}
                >
                  [{levelLabelMap[log.level]}]
                </span>
                <span className={cn("break-words leading-6", log.level === "error" ? "text-red-300" : "text-zinc-300")}>
                  {log.message}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
