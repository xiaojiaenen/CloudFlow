import { Terminal, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/src/lib/utils";
import { motion, AnimatePresence } from "motion/react";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
}

interface LogPanelProps {
  logs: LogEntry[];
  onClear: () => void;
}

export function LogPanel({ logs, onClear }: LogPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="h-1/2 flex flex-col bg-[#0A0A0A]">
      <div className="h-10 border-b border-white/[0.08] flex items-center justify-between px-4 bg-[#0A0A0A]">
        <div className="flex items-center gap-2 text-zinc-400">
          <Terminal className="w-3.5 h-3.5" />
          <span className="text-[11px] font-medium uppercase tracking-wider">执行日志</span>
        </div>
        <button
          onClick={onClear}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
          title="清空日志"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-2 bg-[#0A0A0A] shadow-inner"
      >
        {logs.length === 0 ? (
          <div className="text-zinc-600 text-center mt-10">暂无日志，请点击上方执行按钮。</div>
        ) : (
          <AnimatePresence initial={false}>
            {logs.map((log) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 group"
              >
                <span className="text-zinc-600 shrink-0 select-none">{log.timestamp}</span>
                <span
                  className={cn(
                    "shrink-0 font-medium uppercase w-12",
                    log.level === "info" && "text-blue-400/80",
                    log.level === "warn" && "text-amber-400/80",
                    log.level === "error" && "text-red-400/80",
                    log.level === "success" && "text-emerald-400/80"
                  )}
                >
                  [{log.level}]
                </span>
                <span
                  className={cn(
                    "break-words",
                    log.level === "error" ? "text-red-300" : "text-zinc-300"
                  )}
                >
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
