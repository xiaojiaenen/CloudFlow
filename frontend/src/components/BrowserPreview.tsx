import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Expand, Lock, Monitor, RefreshCw, X } from "lucide-react";

interface BrowserPreviewProps {
  isRunning: boolean;
  screenshot?: string | null;
  taskId?: string | null;
  pageUrl?: string;
}

export function BrowserPreview({ isRunning, screenshot, taskId, pageUrl }: BrowserPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  const screenshotSrc = useMemo(() => {
    if (!screenshot) {
      return null;
    }

    if (
      screenshot.startsWith("data:") ||
      screenshot.startsWith("blob:") ||
      screenshot.startsWith("http")
    ) {
      return screenshot;
    }

    return `data:image/jpeg;base64,${screenshot}`;
  }, [screenshot]);

  useEffect(() => {
    if (!expanded) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expanded]);

  const imageContent = screenshotSrc ? (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      className="group absolute inset-0 overflow-hidden"
      title="点击放大实时画面"
    >
      <img
        src={screenshotSrc}
        alt="执行截图"
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.01]"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent p-3 text-left">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] text-zinc-100 backdrop-blur">
          <Expand className="h-3.5 w-3.5" />
          点击放大
        </div>
      </div>
    </button>
  ) : isRunning ? (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500">
      <RefreshCw className="mb-4 h-6 w-6 animate-spin opacity-40" />
      <p className="text-sm font-medium text-zinc-300">正在执行工作流...</p>
      <p className="mt-2 text-[11px] font-mono opacity-50">Task ID: {taskId || "waiting"}</p>
    </div>
  ) : (
    <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
      <div className="text-center">
        <Monitor className="mx-auto mb-3 h-10 w-10 opacity-20" />
        <p className="text-sm text-zinc-400">实时画面未激活</p>
        <p className="mt-1 text-[11px] opacity-50">运行工作流后，这里会显示浏览器实时截图。</p>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex h-full min-h-[320px] flex-col border-b border-white/[0.08] bg-[#0A0A0A]">
        <div className="flex h-10 items-center justify-between border-b border-white/[0.08] bg-[#0A0A0A] px-4">
          <div className="flex items-center gap-2 text-zinc-400">
            <Monitor className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium uppercase tracking-wider">实时画面</span>
          </div>
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          </div>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#000] shadow-inner">
            <div className="flex h-10 items-center gap-3 border-b border-white/[0.08] bg-[#121212] px-3">
              <div className="flex gap-2 text-zinc-500">
                <ChevronLeft className="h-4 w-4" />
                <ChevronRight className="h-4 w-4" />
                <RefreshCw className="h-3.5 w-3.5" />
              </div>
              <div className="flex h-6 flex-1 items-center rounded-md border border-white/[0.04] bg-black px-3">
                <Lock className="mr-2 h-3 w-3 text-zinc-500" />
                <span className="truncate font-mono text-[11px] text-zinc-400">
                  {isRunning ? pageUrl || "执行中..." : "about:blank"}
                </span>
              </div>
            </div>

            <div className="relative flex-1 bg-[#050505]">{imageContent}</div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && screenshotSrc ? (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-6 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExpanded(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="relative max-h-full max-w-[min(92vw,1440px)] overflow-hidden rounded-[28px] border border-white/10 bg-[#050505] shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-black/40 p-2 text-zinc-200 transition-colors hover:bg-black/60"
              >
                <X className="h-4 w-4" />
              </button>
              <img src={screenshotSrc} alt="放大截图" className="max-h-[88vh] w-full object-contain" />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
