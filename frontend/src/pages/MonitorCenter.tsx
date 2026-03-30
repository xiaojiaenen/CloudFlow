import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock3,
  FileSearch,
  LoaderCircle,
  PlayCircle,
  RefreshCw,
  SquareTerminal,
  TimerReset,
  Workflow,
  XCircle,
} from "lucide-react";
import { Sidebar } from "@/src/components/Sidebar";
import { Button } from "@/src/components/ui/Button";
import { cn } from "@/src/lib/utils";
import { getTask, listTasks, TaskExecutionRecord, TaskRecord } from "@/src/lib/cloudflow";

function formatDateTime(value?: string | null) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}

function formatDuration(startedAt?: string | null, completedAt?: string | null) {
  if (!startedAt) {
    return "--";
  }

  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

function getStatusMeta(status: TaskRecord["status"]) {
  if (status === "running") {
    return {
      label: "运行中",
      className: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
      icon: LoaderCircle,
    };
  }

  if (status === "success") {
    return {
      label: "成功",
      className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
      icon: CheckCircle2,
    };
  }

  if (status === "failed") {
    return {
      label: "失败",
      className: "bg-red-500/10 text-red-400 border border-red-500/20",
      icon: XCircle,
    };
  }

  if (status === "cancelled") {
    return {
      label: "已取消",
      className: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
      icon: AlertCircle,
    };
  }

  return {
    label: "等待中",
    className: "bg-zinc-500/10 text-zinc-300 border border-zinc-500/20",
    icon: Clock3,
  };
}

function getPayloadString(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return typeof value === "string" ? value : "";
}

function getExecutionEventMeta(event: TaskExecutionRecord) {
  if (event.type === "status") {
    const status = event.status ?? "pending";
    const statusMeta = getStatusMeta(status);
    return {
      icon: statusMeta.icon,
      className: statusMeta.className,
      label: `状态更新为 ${statusMeta.label}`,
    };
  }

  if (event.type === "extract") {
    return {
      icon: FileSearch,
      className: "bg-violet-500/10 text-violet-300 border border-violet-500/20",
      label: "提取结果",
    };
  }

  if (event.level === "error") {
    return {
      icon: AlertCircle,
      className: "bg-red-500/10 text-red-300 border border-red-500/20",
      label: "错误日志",
    };
  }

  if (event.level === "warn") {
    return {
      icon: AlertCircle,
      className: "bg-amber-500/10 text-amber-300 border border-amber-500/20",
      label: "警告日志",
    };
  }

  if (event.level === "success") {
    return {
      icon: CheckCircle2,
      className: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
      label: "成功日志",
    };
  }

  return {
    icon: SquareTerminal,
    className: "bg-sky-500/10 text-sky-300 border border-sky-500/20",
    label: "执行日志",
  };
}

export function MonitorCenter() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
  const [selectedScreenshotId, setSelectedScreenshotId] = useState<string | null>(null);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const loadTasks = useCallback(async () => {
    try {
      setIsLoadingTasks(true);
      const data = await listTasks();
      setTasks(data);

      if (!selectedTaskId && data.length > 0) {
        setSelectedTaskId(data[0].id);
      }
    } finally {
      setIsLoadingTasks(false);
    }
  }, [selectedTaskId]);

  const loadTaskDetail = useCallback(async (taskId: string) => {
    try {
      setIsLoadingDetail(true);
      const data = await getTask(taskId);
      setSelectedTask(data);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();

    const interval = window.setInterval(() => {
      void loadTasks();
    }, 10000);

    return () => window.clearInterval(interval);
  }, [loadTasks]);

  useEffect(() => {
    if (!selectedTaskId) {
      setSelectedTask(null);
      return;
    }

    void loadTaskDetail(selectedTaskId);

    const interval = window.setInterval(() => {
      void loadTaskDetail(selectedTaskId);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [loadTaskDetail, selectedTaskId]);

  const metrics = useMemo(() => {
    const running = tasks.filter((task) => task.status === "running").length;
    const success = tasks.filter((task) => task.status === "success").length;
    const failed = tasks.filter((task) => task.status === "failed").length;
    const cancelled = tasks.filter((task) => task.status === "cancelled").length;

    return { running, success, failed, cancelled, total: tasks.length };
  }, [tasks]);

  const executionEvents = useMemo(() => selectedTask?.executionEvents ?? [], [selectedTask]);

  const activityEvents = useMemo(
    () => executionEvents.filter((event) => event.type !== "screenshot"),
    [executionEvents],
  );

  const screenshotEvents = useMemo(
    () => executionEvents.filter((event) => event.type === "screenshot" && Boolean(event.imageBase64)),
    [executionEvents],
  );

  const extractEvents = useMemo(
    () => executionEvents.filter((event) => event.type === "extract"),
    [executionEvents],
  );

  const activeScreenshot = useMemo(() => {
    if (screenshotEvents.length === 0) {
      return null;
    }

    return (
      screenshotEvents.find((event) => event.id === selectedScreenshotId) ??
      screenshotEvents[screenshotEvents.length - 1]
    );
  }, [screenshotEvents, selectedScreenshotId]);

  useEffect(() => {
    if (screenshotEvents.length === 0) {
      setSelectedScreenshotId(null);
      return;
    }

    setSelectedScreenshotId((current) => {
      if (current && screenshotEvents.some((event) => event.id === current)) {
        return current;
      }

      return screenshotEvents[screenshotEvents.length - 1].id;
    });
  }, [screenshotEvents]);

  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-50 flex overflow-hidden font-sans selection:bg-sky-500/30">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-[#09090b] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-900/10 via-transparent to-transparent pointer-events-none" />

        <div className="p-8 max-w-7xl mx-auto w-full space-y-8 relative z-10 overflow-y-auto">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100 tracking-tight flex items-center gap-3">
                <Activity className="w-6 h-6 text-sky-400" />
                任务历史与详情
              </h1>
              <p className="text-zinc-400 mt-2 text-sm">查看最近任务的执行状态、时间线、截图回放和提取结果。</p>
            </div>

            <Button variant="outline" onClick={() => void loadTasks()} className="gap-2">
              <RefreshCw className={cn("w-4 h-4", isLoadingTasks && "animate-spin")} />
              刷新任务
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl p-5 backdrop-blur-md">
              <div className="text-sm text-zinc-400 mb-2">任务总数</div>
              <div className="text-3xl font-bold text-zinc-100">{metrics.total}</div>
            </div>
            <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl p-5 backdrop-blur-md">
              <div className="text-sm text-zinc-400 mb-2">运行中</div>
              <div className="text-3xl font-bold text-sky-400">{metrics.running}</div>
            </div>
            <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl p-5 backdrop-blur-md">
              <div className="text-sm text-zinc-400 mb-2">成功</div>
              <div className="text-3xl font-bold text-emerald-400">{metrics.success}</div>
            </div>
            <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl p-5 backdrop-blur-md">
              <div className="text-sm text-zinc-400 mb-2">失败</div>
              <div className="text-3xl font-bold text-red-400">{metrics.failed}</div>
            </div>
            <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl p-5 backdrop-blur-md">
              <div className="text-sm text-zinc-400 mb-2">已取消</div>
              <div className="text-3xl font-bold text-amber-400">{metrics.cancelled}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-6">
            <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl backdrop-blur-md overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-100">最近 50 条任务</div>
                <div className="text-xs text-zinc-500">{isLoadingTasks ? "正在同步..." : `${tasks.length} 条记录`}</div>
              </div>

              <div className="divide-y divide-white/[0.05]">
                {tasks.length === 0 && (
                  <div className="px-5 py-12 text-center text-sm text-zinc-500">还没有任务记录，先去工作区运行一个工作流吧。</div>
                )}

                {tasks.map((task) => {
                  const statusMeta = getStatusMeta(task.status);
                  const StatusIcon = statusMeta.icon;

                  return (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={cn(
                        "w-full px-5 py-4 text-left transition-colors hover:bg-white/[0.03]",
                        selectedTaskId === task.id && "bg-white/[0.05]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-zinc-100 truncate">
                            {task.workflow?.name || "未命名工作流"}
                          </div>
                          <div className="text-xs text-zinc-500 mt-1 font-mono truncate">{task.id}</div>
                        </div>

                        <div className={cn("px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1.5 shrink-0", statusMeta.className)}>
                          <StatusIcon className={cn("w-3.5 h-3.5", task.status === "running" && "animate-spin")} />
                          {statusMeta.label}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
                        <div>
                          <div className="text-zinc-500">创建时间</div>
                          <div className="text-zinc-300 mt-1">{formatDateTime(task.createdAt)}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">开始时间</div>
                          <div className="text-zinc-300 mt-1">{formatDateTime(task.startedAt)}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">结束时间</div>
                          <div className="text-zinc-300 mt-1">{formatDateTime(task.completedAt)}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">耗时</div>
                          <div className="text-zinc-300 mt-1 font-mono">{formatDuration(task.startedAt, task.completedAt)}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl backdrop-blur-md overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-100">任务详情</div>
                {isLoadingDetail && <div className="text-xs text-zinc-500">正在加载...</div>}
              </div>

              {!selectedTask && !isLoadingDetail ? (
                <div className="px-5 py-12 text-center text-sm text-zinc-500">选择左侧任务查看详细信息。</div>
              ) : (
                <div className="p-5 space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-zinc-400 min-w-0">
                        <Workflow className="w-4 h-4 shrink-0" />
                        <span className="text-sm font-medium text-zinc-100 truncate">{selectedTask?.workflow?.name || "未命名工作流"}</span>
                      </div>
                      {selectedTask && (
                        <div className={cn("px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1.5 shrink-0", getStatusMeta(selectedTask.status).className)}>
                          {(() => {
                            const StatusIcon = getStatusMeta(selectedTask.status).icon;
                            return <StatusIcon className={cn("w-3.5 h-3.5", selectedTask.status === "running" && "animate-spin")} />;
                          })()}
                          {getStatusMeta(selectedTask.status).label}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 font-mono break-all">{selectedTask?.id}</div>
                  </div>

                  {selectedTask && (
                    <>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
                          <div className="text-zinc-500 mb-2">节点数量</div>
                          <div className="text-zinc-100">{selectedTask.workflowSnapshot?.nodes?.length ?? selectedTask.workflow?.definition?.nodes?.length ?? 0}</div>
                        </div>
                        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
                          <div className="text-zinc-500 mb-2">执行事件数</div>
                          <div className="text-zinc-100">{executionEvents.length}</div>
                        </div>
                        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
                          <div className="text-zinc-500 mb-2">运行耗时</div>
                          <div className="text-zinc-100 font-mono">{formatDuration(selectedTask.startedAt, selectedTask.completedAt)}</div>
                        </div>
                        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
                          <div className="text-zinc-500 mb-2">持久化截图</div>
                          <div className="text-zinc-100">{screenshotEvents.length}</div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                          <TimerReset className="w-4 h-4 text-sky-400" />
                          时间线
                        </div>
                        <div className="space-y-3 text-sm">
                          <div className="flex items-start justify-between gap-4 rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
                            <span className="text-zinc-500">创建时间</span>
                            <span className="text-zinc-200">{formatDateTime(selectedTask.createdAt)}</span>
                          </div>
                          <div className="flex items-start justify-between gap-4 rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
                            <span className="text-zinc-500">开始时间</span>
                            <span className="text-zinc-200">{formatDateTime(selectedTask.startedAt)}</span>
                          </div>
                          <div className="flex items-start justify-between gap-4 rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
                            <span className="text-zinc-500">结束时间</span>
                            <span className="text-zinc-200">{formatDateTime(selectedTask.completedAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                          <SquareTerminal className="w-4 h-4 text-emerald-400" />
                          执行时间线
                        </div>
                        <div className="space-y-3 max-h-[320px] overflow-auto pr-1">
                          {activityEvents.length === 0 && (
                            <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 text-sm text-zinc-500">
                              这个任务还没有持久化的执行事件。
                            </div>
                          )}

                          {activityEvents.map((event) => {
                            const eventMeta = getExecutionEventMeta(event);
                            const EventIcon = eventMeta.icon;
                            const selector = getPayloadString(event.payload, "selector");
                            const property = getPayloadString(event.payload, "property");
                            const value = getPayloadString(event.payload, "value");

                            return (
                              <div key={event.id} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", eventMeta.className)}>
                                      <EventIcon className={cn("w-4 h-4", event.status === "running" && "animate-spin")} />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-sm text-zinc-100 truncate">{eventMeta.label}</div>
                                      <div className="text-[11px] text-zinc-500 font-mono">
                                        #{event.sequence} · {formatDateTime(event.createdAt)}
                                      </div>
                                    </div>
                                  </div>
                                  {event.nodeId && <div className="text-[11px] text-zinc-500 font-mono shrink-0">{event.nodeId}</div>}
                                </div>

                                {event.message && <div className="text-sm text-zinc-300 leading-6">{event.message}</div>}

                                {event.type === "extract" && (
                                  <div className="rounded-lg border border-violet-500/10 bg-violet-500/5 p-3 space-y-2">
                                    <div className="text-xs text-zinc-400">
                                      目标: <span className="font-mono text-zinc-200">{selector || "--"}</span>
                                    </div>
                                    <div className="text-xs text-zinc-400">
                                      属性: <span className="font-mono text-zinc-200">{property || "text"}</span>
                                    </div>
                                    <pre className="text-xs text-zinc-200 whitespace-pre-wrap break-all font-mono max-h-32 overflow-auto">
                                      {value || "[空值]"}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                          <Camera className="w-4 h-4 text-fuchsia-400" />
                          截图回放
                        </div>
                        {activeScreenshot ? (
                          <div className="space-y-3">
                            <div className="rounded-xl overflow-hidden border border-white/[0.05] bg-black/40">
                              <img
                                src={`data:${activeScreenshot.mimeType || "image/jpeg"};base64,${activeScreenshot.imageBase64}`}
                                alt="任务截图"
                                className="w-full h-[280px] object-contain bg-black"
                              />
                            </div>
                            <div className="flex items-center justify-between text-xs text-zinc-500">
                              <span>截图时间: {formatDateTime(activeScreenshot.createdAt)}</span>
                              <span>{getPayloadString(activeScreenshot.payload, "source") === "node" ? "节点截图" : "过程截图"}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-3 max-h-[220px] overflow-auto pr-1">
                              {screenshotEvents.map((event) => (
                                <button
                                  key={event.id}
                                  onClick={() => setSelectedScreenshotId(event.id)}
                                  className={cn(
                                    "rounded-lg overflow-hidden border transition-colors bg-black/30",
                                    activeScreenshot.id === event.id
                                      ? "border-sky-500/60"
                                      : "border-white/[0.06] hover:border-white/[0.18]",
                                  )}
                                >
                                  <img
                                    src={`data:${event.mimeType || "image/jpeg"};base64,${event.imageBase64}`}
                                    alt="任务缩略图"
                                    className="w-full h-24 object-cover bg-black"
                                  />
                                  <div className="px-2 py-2 text-[11px] text-zinc-400">
                                    {formatDateTime(event.createdAt)}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 text-sm text-zinc-500">
                            这个任务还没有持久化截图。后续执行时，系统会自动按间隔保存执行画面。
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                          <FileSearch className="w-4 h-4 text-violet-400" />
                          提取结果
                        </div>
                        {extractEvents.length > 0 ? (
                          <div className="space-y-3">
                            {extractEvents.map((event) => (
                              <div key={event.id} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 space-y-2">
                                <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                                  <span>{formatDateTime(event.createdAt)}</span>
                                  {event.nodeId && <span className="font-mono">{event.nodeId}</span>}
                                </div>
                                <div className="text-xs text-zinc-400">
                                  选择器: <span className="font-mono text-zinc-200">{getPayloadString(event.payload, "selector") || "--"}</span>
                                </div>
                                <div className="text-xs text-zinc-400">
                                  属性: <span className="font-mono text-zinc-200">{getPayloadString(event.payload, "property") || "text"}</span>
                                </div>
                                <pre className="rounded-md bg-black/30 p-3 text-xs text-zinc-200 whitespace-pre-wrap break-all font-mono max-h-40 overflow-auto">
                                  {getPayloadString(event.payload, "value") || "[空值]"}
                                </pre>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 text-sm text-zinc-500">
                            这个任务没有提取类型节点结果。
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                          <SquareTerminal className="w-4 h-4 text-emerald-400" />
                          工作流快照
                        </div>
                        <div className="rounded-lg border border-white/[0.05] bg-black/30 p-4">
                          <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-all font-mono max-h-[260px] overflow-auto">
                            {JSON.stringify(selectedTask.workflowSnapshot ?? selectedTask.workflow?.definition ?? {}, null, 2)}
                          </pre>
                        </div>
                      </div>

                      {selectedTask.errorMessage && (
                        <div className="space-y-3">
                          <div className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-red-400" />
                            错误信息
                          </div>
                          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                            {selectedTask.errorMessage}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
                          <div className="text-zinc-500 text-xs mb-2">执行入口</div>
                          <div className="text-zinc-100 flex items-center gap-2">
                            <PlayCircle className="w-4 h-4 text-sky-400" />
                            POST /api/tasks/run
                          </div>
                        </div>
                        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
                          <div className="text-zinc-500 text-xs mb-2">详情接口</div>
                          <div className="text-zinc-100 flex items-center gap-2">
                            <Workflow className="w-4 h-4 text-emerald-400" />
                            GET /api/tasks/:id
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
