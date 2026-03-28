import { BrowserPreview } from "./BrowserPreview";
import { LogPanel, LogEntry } from "./LogPanel";

interface ExecutionPanelProps {
  isRunning: boolean;
  logs: LogEntry[];
  screenshot?: string | null;
  taskId?: string | null;
  pageUrl?: string;
  onClearLogs: () => void;
}

export function ExecutionPanel({ isRunning, logs, screenshot, taskId, pageUrl, onClearLogs }: ExecutionPanelProps) {
  return (
    <div className="w-[400px] border-l border-white/[0.08] bg-[#0A0A0A] flex flex-col h-full shadow-2xl z-10">
      <BrowserPreview isRunning={isRunning} screenshot={screenshot} taskId={taskId} pageUrl={pageUrl} />
      <LogPanel logs={logs} onClear={onClearLogs} />
    </div>
  );
}
