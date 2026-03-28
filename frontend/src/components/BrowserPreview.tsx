import { Monitor, RefreshCw, Lock, ChevronLeft, ChevronRight } from "lucide-react";

interface BrowserPreviewProps {
  isRunning: boolean;
  screenshot?: string | null;
  taskId?: string | null;
  pageUrl?: string;
}

export function BrowserPreview({ isRunning, screenshot, taskId, pageUrl }: BrowserPreviewProps) {
  return (
    <div className="h-1/2 border-b border-white/[0.08] bg-[#0A0A0A] flex flex-col">
      <div className="h-10 border-b border-white/[0.08] flex items-center justify-between px-4 bg-[#0A0A0A]">
        <div className="flex items-center gap-2 text-zinc-400">
          <Monitor className="w-3.5 h-3.5" />
          <span className="text-[11px] font-medium uppercase tracking-wider">实时画面</span>
        </div>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
        </div>
      </div>

      <div className="flex-1 p-4 flex flex-col">
        <div className="flex-1 rounded-lg border border-white/[0.08] bg-[#000] overflow-hidden relative shadow-inner flex flex-col">
          {/* Browser Chrome */}
          <div className="h-10 bg-[#121212] border-b border-white/[0.08] flex items-center px-3 gap-3">
            <div className="flex gap-2 text-zinc-500">
              <ChevronLeft className="w-4 h-4" />
              <ChevronRight className="w-4 h-4" />
              <RefreshCw className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 bg-black rounded-md h-6 flex items-center px-3 border border-white/[0.04]">
              <Lock className="w-3 h-3 text-zinc-500 mr-2" />
              <span className="text-[11px] text-zinc-400 font-mono truncate">
                {isRunning ? pageUrl || "执行中..." : "about:blank"}
              </span>
            </div>
          </div>

          {/* Browser Content */}
          <div className="flex-1 relative bg-[#050505]">
            {screenshot ? (
              <img
                src={`data:image/jpeg;base64,${screenshot}`}
                alt="执行截图"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : isRunning ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500">
                <RefreshCw className="w-6 h-6 animate-spin mb-4 opacity-40" />
                <p className="text-sm font-medium text-zinc-300">正在执行工作流...</p>
                <p className="text-[11px] mt-2 opacity-50 font-mono">Task ID: {taskId || "waiting"}</p>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
                <div className="text-center">
                  <Monitor className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm text-zinc-400">画面未激活</p>
                  <p className="text-[11px] opacity-50 mt-1">点击右上角执行以查看实时画面</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
