import { useMemo, useState } from "react";
import { FileDigit, KeyRound, MonitorSmartphone, ScrollText } from "lucide-react";
import { BrowserPreview } from "./BrowserPreview";
import { LogEntry, LogPanel } from "./LogPanel";
import { WorkflowInputField, WorkflowRuntimeContext } from "@/src/lib/cloudflow";
import { cn } from "@/src/lib/utils";

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

type DetailTab = "logs" | "snapshot";

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
  const [detailTab, setDetailTab] = useState<DetailTab>("logs");

  const inputSchemaMap = useMemo(
    () => new Map<string, WorkflowInputField>(inputSchema.map((field) => [field.key, field])),
    [inputSchema],
  );

  const runtimeInputEntries = Object.entries(
    runtimeContext?.maskedInputs ?? runtimeContext?.inputs ?? {},
  );
  const runtimeCredentialEntries = Object.entries(runtimeContext?.credentialMetadata ?? {});

  return (
    <div className="z-10 flex h-full w-[420px] min-w-[400px] flex-col border-l border-white/[0.08] bg-[#0A0A0A] shadow-2xl">
      <div className="flex-[0_0_44%] min-h-[320px]">
        <BrowserPreview isRunning={isRunning} screenshot={screenshot} taskId={taskId} pageUrl={pageUrl} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-white/[0.06] bg-zinc-950/80">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <MonitorSmartphone className="h-4 w-4 text-sky-300" />
              执行详情
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">
              {taskId ? `任务 ID：${taskId}` : "任务尚未启动"}
            </div>
          </div>

          <div className="inline-flex rounded-xl border border-white/[0.06] bg-black/20 p-1">
            <button
              type="button"
              onClick={() => setDetailTab("logs")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs transition-colors",
                detailTab === "logs" ? "bg-white text-black" : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              日志
            </button>
            <button
              type="button"
              onClick={() => setDetailTab("snapshot")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs transition-colors",
                detailTab === "snapshot" ? "bg-white text-black" : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              快照
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {detailTab === "logs" ? (
            <LogPanel logs={logs} onClear={onClearLogs} className="h-full" />
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                    <FileDigit className="h-4 w-4 text-sky-300" />
                    运行参数快照
                  </div>
                  {runtimeInputEntries.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-3 text-xs text-zinc-500">
                      当前任务没有附带运行参数，或本次执行直接使用了工作流默认值。
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {runtimeInputEntries.map(([key, value]) => {
                        const field = inputSchemaMap.get(key);
                        return (
                          <div key={key} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="truncate text-xs font-medium text-zinc-100">
                                {field?.label || key}
                              </div>
                              <div className="font-mono text-[10px] text-zinc-500">{key}</div>
                            </div>
                            <div className="mt-1 break-all font-mono text-[11px] leading-6 text-zinc-300">
                              {value || <span className="text-zinc-500">（空）</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                    <KeyRound className="h-4 w-4 text-amber-300" />
                    凭据绑定快照
                  </div>
                  {runtimeCredentialEntries.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-3 text-xs text-zinc-500">
                      当前任务没有绑定凭据，或工作流本身不依赖凭据库。
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {runtimeCredentialEntries.map(([bindingKey, metadata]) => {
                        const fields = runtimeContext?.maskedCredentials?.[bindingKey] ?? {};
                        return (
                          <div key={bindingKey} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-zinc-100">{metadata.credentialName}</div>
                                <div className="mt-1 text-[11px] text-zinc-500">
                                  {bindingKey} · {metadata.type}
                                  {metadata.provider ? ` · ${metadata.provider}` : ""}
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {Object.entries(fields).map(([key, value]) => (
                                <div
                                  key={key}
                                  className="rounded-full border border-white/[0.08] bg-black/20 px-2.5 py-1 text-[11px] text-zinc-300"
                                >
                                  {key}: {value || "空"}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-xs leading-6 text-zinc-500">
                  <div className="flex items-center gap-2 font-medium text-zinc-300">
                    <ScrollText className="h-3.5 w-3.5 text-sky-300" />
                    说明
                  </div>
                  <div className="mt-2">
                    这里展示的是本次任务启动时的参数和凭据快照。敏感内容会自动脱敏，便于排查问题时确认“用了哪份配置”，但不会泄露明文。
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
