import { KeyRound } from "lucide-react";
import { BrowserPreview } from "./BrowserPreview";
import { LogEntry, LogPanel } from "./LogPanel";
import { WorkflowInputField, WorkflowRuntimeContext } from "@/src/lib/cloudflow";

interface ExecutionPanelProps {
  isRunning: boolean;
  logs: LogEntry[];
  screenshot?: string | null;
  taskId?: string | null;
  pageUrl?: string;
  runtimeContext?: WorkflowRuntimeContext | null;
  inputSchema?: WorkflowInputField[];
  onClearLogs: () => void;
}

export function ExecutionPanel({
  isRunning,
  logs,
  screenshot,
  taskId,
  pageUrl,
  runtimeContext,
  inputSchema = [],
  onClearLogs,
}: ExecutionPanelProps) {
  const runtimeEntries = Object.entries(runtimeContext?.maskedInputs ?? runtimeContext?.inputs ?? {});
  const inputSchemaMap = new Map<string, WorkflowInputField>(inputSchema.map((field) => [field.key, field]));

  return (
    <div className="z-10 flex h-full w-[400px] flex-col border-l border-white/[0.08] bg-[#0A0A0A] shadow-2xl">
      <BrowserPreview isRunning={isRunning} screenshot={screenshot} taskId={taskId} pageUrl={pageUrl} />

      <div className="border-t border-white/[0.06] bg-zinc-950/80 px-4 py-3">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-zinc-100">
          <KeyRound className="h-4 w-4 text-amber-300" />
          运行参数快照
        </div>
        <div className="mb-3 text-[11px] text-zinc-500">
          这里展示本次任务启动时实际带入的参数值，敏感字段会自动脱敏。
        </div>

        {runtimeEntries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-3 text-xs text-zinc-500">
            当前任务没有附带运行参数，或者这次执行使用了工作流默认配置。
          </div>
        ) : (
          <div className="max-h-44 space-y-2 overflow-auto pr-1">
            {runtimeEntries.map(([key, value]) => {
              const field = inputSchemaMap.get(key);
              return (
                <div key={key} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate text-xs font-medium text-zinc-100">{field?.label || key}</div>
                    <div className="font-mono text-[10px] text-zinc-500">{key}</div>
                  </div>
                  <div className="mt-1 break-all font-mono text-[11px] text-zinc-300">
                    {value || <span className="text-zinc-500">（空）</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <LogPanel logs={logs} onClear={onClearLogs} />
    </div>
  );
}
