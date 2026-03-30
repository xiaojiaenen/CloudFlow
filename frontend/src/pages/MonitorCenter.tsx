import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock3,
  FileSearch,
  LoaderCircle,
  RefreshCw,
  SquareTerminal,
  Workflow,
  XCircle,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Sidebar } from "@/src/components/Sidebar";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { cancelTask, getTask, getTaskSummary, listTasks, retryTask, TaskExecutionRecord, TaskRecord, TaskSummaryRecord } from "@/src/lib/cloudflow";
import { cn } from "@/src/lib/utils";

function formatDateTime(value?: string | null) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatDuration(startedAt?: string | null, completedAt?: string | null) {
  if (!startedAt) {
    return "--";
  }

  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
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

function getTriggerMeta(triggerSource?: TaskRecord["triggerSource"]) {
  if (triggerSource === "schedule") {
    return {
      label: "定时触发",
      className: "bg-violet-500/10 text-violet-300 border border-violet-500/20",
    };
  }

  return {
    label: "手动触发",
    className: "bg-zinc-500/10 text-zinc-300 border border-zinc-500/20",
  };
}

function getPayloadString(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return typeof value === "string" ? value : "";
}

function getExecutionEventMeta(event: TaskExecutionRecord) {
  if (event.type === "status") {
    const statusMeta = getStatusMeta((event.status ?? "pending") as TaskRecord["status"]);
    return {
      label: `状态更新为 ${statusMeta.label}`,
      className: statusMeta.className,
      icon: statusMeta.icon,
    };
  }

  if (event.type === "extract") {
    return {
      label: "提取结果",
      className: "bg-violet-500/10 text-violet-300 border border-violet-500/20",
      icon: FileSearch,
    };
  }

  if (event.level === "error") {
    return {
      label: "错误日志",
      className: "bg-red-500/10 text-red-300 border border-red-500/20",
      icon: AlertCircle,
    };
  }

  if (event.level === "warn") {
    return {
      label: "告警日志",
      className: "bg-amber-500/10 text-amber-300 border border-amber-500/20",
      icon: AlertCircle,
    };
  }

  return {
    label: "执行日志",
    className: "bg-sky-500/10 text-sky-300 border border-sky-500/20",
    icon: SquareTerminal,
  };
}

function MetricCard({ label, value, colorClass }: { label: string; value: number; colorClass?: string }) {
  return (
    <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl p-5 backdrop-blur-md">
      <div className="text-sm text-zinc-400 mb-2">{label}</div>
      <div className={cn("text-3xl font-bold text-zinc-100", colorClass)}>{value}</div>
    </div>
  );
}

export function MonitorCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const taskIdFromQuery = searchParams.get("taskId");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskRecord["status"] | "all">("all");
  const [triggerFilter, setTriggerFilter] = useState<TaskRecord["triggerSource"] | "all">("all");
  const [taskPage, setTaskPage] = useState(1);
  const [taskPageSize] = useState(10);
  const [taskTotal, setTaskTotal] = useState(0);
  const [taskTotalPages, setTaskTotalPages] = useState(1);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [summary, setSummary] = useState<TaskSummaryRecord | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => taskIdFromQuery);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
  const [selectedScreenshotId, setSelectedScreenshotId] = useState<string | null>(null);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isMutatingTasks, setIsMutatingTasks] = useState(false);

  const loadTasks = useCallback(async () => {
    try {
      setIsLoadingTasks(true);
      const data = await listTasks({
        page: taskPage,
        pageSize: taskPageSize,
        status: statusFilter === "all" ? undefined : statusFilter,
        triggerSource: triggerFilter === "all" ? undefined : triggerFilter,
        search,
      });

      setTaskTotal(data.total);
      setTaskTotalPages(data.totalPages);
      setTasks(data.items);
      setSelectedTaskIds((current) => current.filter((id) => data.items.some((task) => task.id === id)));

      if (taskIdFromQuery) {
        setSelectedTaskId(taskIdFromQuery);
      } else if (!selectedTaskId && data.items.length > 0) {
        setSelectedTaskId(data.items[0].id);
      }
    } finally {
      setIsLoadingTasks(false);
    }
  }, [search, selectedTaskId, statusFilter, taskIdFromQuery, taskPage, taskPageSize, triggerFilter]);

  const loadSummary = useCallback(async () => {
    const data = await getTaskSummary({
      status: statusFilter === "all" ? undefined : statusFilter,
      triggerSource: triggerFilter === "all" ? undefined : triggerFilter,
      search,
    });
    setSummary(data);
  }, [search, statusFilter, triggerFilter]);

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
    void loadSummary();

    const interval = window.setInterval(() => {
      void loadTasks();
      void loadSummary();
    }, 10000);

    return () => window.clearInterval(interval);
  }, [loadSummary, loadTasks]);

  useEffect(() => {
    setTaskPage(1);
  }, [search, statusFilter, triggerFilter]);

  useEffect(() => {
    if (taskIdFromQuery && taskIdFromQuery !== selectedTaskId) {
      setSelectedTaskId(taskIdFromQuery);
    }
  }, [selectedTaskId, taskIdFromQuery]);

  useEffect(() => {
    if (!selectedTaskId) {
      setSelectedTask(null);
      return;
    }

    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("taskId", selectedTaskId);
      return next;
    }, { replace: true });

    void loadTaskDetail(selectedTaskId);

    const interval = window.setInterval(() => {
      void loadTaskDetail(selectedTaskId);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [loadTaskDetail, selectedTaskId, setSearchParams]);

  const metrics = useMemo(() => ({
    total: summary?.total ?? 0,
    pending: summary?.byStatus.pending ?? 0,
    running: summary?.byStatus.running ?? 0,
    success: summary?.byStatus.success ?? 0,
    failed: summary?.byStatus.failed ?? 0,
    cancelled: summary?.byStatus.cancelled ?? 0,
  }), [summary]);

  const executionEvents = useMemo(() => selectedTask?.executionEvents ?? [], [selectedTask]);
  const activityEvents = useMemo(() => executionEvents.filter((event) => event.type !== "screenshot"), [executionEvents]);
  const screenshotEvents = useMemo(() => executionEvents.filter((event) => event.type === "screenshot" && Boolean(event.imageBase64)), [executionEvents]);
  const extractEvents = useMemo(() => executionEvents.filter((event) => event.type === "extract"), [executionEvents]);
  const activeScreenshot = useMemo(() => {
    if (screenshotEvents.length === 0) {
      return null;
    }

    return screenshotEvents.find((event) => event.id === selectedScreenshotId) ?? screenshotEvents[screenshotEvents.length - 1];
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

  const selectedTasks = useMemo(() => tasks.filter((task) => selectedTaskIds.includes(task.id)), [selectedTaskIds, tasks]);

  const handleTaskMutationRefresh = useCallback(async () => {
    await Promise.all([loadTasks(), loadSummary()]);
    if (selectedTaskId) {
      await loadTaskDetail(selectedTaskId);
    }
  }, [loadSummary, loadTaskDetail, loadTasks, selectedTaskId]);

  const handleBatchCancel = useCallback(async () => {
    const cancellableTasks = selectedTasks.filter((task) => ["pending", "running"].includes(task.status));
    if (cancellableTasks.length === 0) {
      return;
    }

    try {
      setIsMutatingTasks(true);
      for (const task of cancellableTasks) {
        await cancelTask(task.id);
      }
      setSelectedTaskIds([]);
      await handleTaskMutationRefresh();
    } finally {
      setIsMutatingTasks(false);
    }
  }, [handleTaskMutationRefresh, selectedTasks]);

  const handleBatchRetry = useCallback(async () => {
    const retryableTasks = selectedTasks.filter((task) => ["failed", "cancelled"].includes(task.status));
    if (retryableTasks.length === 0) {
      return;
    }

    try {
      setIsMutatingTasks(true);
      for (const task of retryableTasks) {
        await retryTask(task.id);
      }
      setSelectedTaskIds([]);
      await handleTaskMutationRefresh();
    } finally {
      setIsMutatingTasks(false);
    }
  }, [handleTaskMutationRefresh, selectedTasks]);

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
              <p className="text-zinc-400 mt-2 text-sm">支持筛选任务、批量取消和失败重试，并可查看日志、截图与提取结果。</p>
            </div>

            <Button variant="outline" onClick={() => { void loadTasks(); void loadSummary(); }} className="gap-2">
              <RefreshCw className={cn("w-4 h-4", isLoadingTasks && "animate-spin")} />
              刷新任务
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <MetricCard label="任务总数" value={metrics.total} />
            <MetricCard label="等待中" value={metrics.pending} />
            <MetricCard label="运行中" value={metrics.running} colorClass="text-sky-400" />
            <MetricCard label="成功" value={metrics.success} colorClass="text-emerald-400" />
            <MetricCard label="失败" value={metrics.failed} colorClass="text-red-400" />
            <MetricCard label="已取消" value={metrics.cancelled} colorClass="text-amber-400" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-6">
            <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl backdrop-blur-md overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-100">任务列表</div>
                <div className="text-xs text-zinc-500">
                  {isLoadingTasks ? "正在同步..." : `第 ${taskPage} / ${taskTotalPages} 页 · 共 ${taskTotal} 条`}
                </div>
              </div>

              <div className="px-5 py-4 border-b border-white/[0.05] space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px_160px] gap-3">
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索任务 ID 或工作流名称" />
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="flex h-10 rounded-md border border-white/[0.06] bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-500">
                    <option value="all">全部状态</option>
                    <option value="pending">等待中</option>
                    <option value="running">运行中</option>
                    <option value="success">成功</option>
                    <option value="failed">失败</option>
                    <option value="cancelled">已取消</option>
                  </select>
                  <select value={triggerFilter} onChange={(event) => setTriggerFilter(event.target.value as typeof triggerFilter)} className="flex h-10 rounded-md border border-white/[0.06] bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-500">
                    <option value="all">全部触发方式</option>
                    <option value="manual">手动触发</option>
                    <option value="schedule">定时触发</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-zinc-500">已选 {selectedTaskIds.length} 条任务。</div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={tasks.length === 0} onClick={() => setSelectedTaskIds((current) => current.length === tasks.length ? [] : tasks.map((task) => task.id))}>
                      {selectedTaskIds.length === tasks.length && tasks.length > 0 ? "取消全选" : "全选当前页"}
                    </Button>
                    <Button variant="outline" size="sm" disabled={isMutatingTasks || selectedTasks.filter((task) => ["pending", "running"].includes(task.status)).length === 0} onClick={() => { void handleBatchCancel(); }}>
                      {isMutatingTasks ? "处理中..." : "批量取消"}
                    </Button>
                    <Button variant="outline" size="sm" disabled={isMutatingTasks || selectedTasks.filter((task) => ["failed", "cancelled"].includes(task.status)).length === 0} onClick={() => { void handleBatchRetry(); }}>
                      {isMutatingTasks ? "处理中..." : "批量重试"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-white/[0.05]">
                {tasks.length === 0 && (
                  <div className="px-5 py-12 text-center text-sm text-zinc-500">当前没有符合条件的任务记录。</div>
                )}

                {tasks.map((task) => {
                  const statusMeta = getStatusMeta(task.status);
                  const StatusIcon = statusMeta.icon;
                  const triggerMeta = getTriggerMeta(task.triggerSource);

                  return (
                    <div key={task.id} className={cn("px-5 py-4 transition-colors hover:bg-white/[0.03]", selectedTaskId === task.id && "bg-white/[0.05]")}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex items-start gap-3">
                          <input type="checkbox" checked={selectedTaskIds.includes(task.id)} onChange={() => setSelectedTaskIds((current) => current.includes(task.id) ? current.filter((id) => id !== task.id) : [...current, task.id])} className="mt-1 h-4 w-4 rounded border-white/10 bg-zinc-900" />
                          <button className="min-w-0 text-left" onClick={() => setSelectedTaskId(task.id)}>
                            <div className="text-sm font-medium text-zinc-100 truncate">{task.workflow?.name || "未命名工作流"}</div>
                            <div className="mt-1 flex items-center gap-2 flex-wrap">
                              <div className="text-xs text-zinc-500 font-mono truncate">{task.id}</div>
                              <div className={cn("px-2 py-0.5 rounded text-[10px] font-medium", triggerMeta.className)}>{triggerMeta.label}</div>
                            </div>
                          </button>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {(task.status === "pending" || task.status === "running") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                void cancelTask(task.id).then(async () => {
                                  await handleTaskMutationRefresh();
                                });
                              }}
                            >
                              取消
                            </Button>
                          )}
                          {(task.status === "failed" || task.status === "cancelled") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                void retryTask(task.id).then(async () => {
                                  await handleTaskMutationRefresh();
                                });
                              }}
                            >
                              重试
                            </Button>
                          )}
                          <div className={cn("px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1.5 shrink-0", statusMeta.className)}>
                            <StatusIcon className={cn("w-3.5 h-3.5", task.status === "running" && "animate-spin")} />
                            {statusMeta.label}
                          </div>
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
                    </div>
                  );
                })}
              </div>

              <div className="px-5 py-4 border-t border-white/[0.05] flex items-center justify-between gap-4">
                <div className="text-xs text-zinc-500">每页 {taskPageSize} 条，支持分页、筛选与批量动作。</div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={taskPage <= 1 || isLoadingTasks} onClick={() => setTaskPage((value) => Math.max(1, value - 1))}>
                    上一页
                  </Button>
                  <Button variant="outline" size="sm" disabled={taskPage >= taskTotalPages || isLoadingTasks} onClick={() => setTaskPage((value) => Math.min(taskTotalPages, value + 1))}>
                    下一页
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl backdrop-blur-md overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-100">任务详情</div>
                {isLoadingDetail && <div className="text-xs text-zinc-500">正在加载...</div>}
              </div>

              {!selectedTask && !isLoadingDetail ? (
                <div className="px-5 py-12 text-center text-sm text-zinc-500">请选择左侧任务查看详细信息。</div>
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

                      <SectionTitle icon={<SquareTerminal className="w-4 h-4 text-emerald-400" />} title="执行时间线" />
                      <div className="space-y-3 max-h-[320px] overflow-auto pr-1">
                        {activityEvents.length === 0 && (
                          <EmptyBlock text="这个任务还没有持久化的执行事件。" />
                        )}

                        {activityEvents.map((event) => {
                          const eventMeta = getExecutionEventMeta(event);
                          const EventIcon = eventMeta.icon;

                          return (
                            <div key={event.id} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", eventMeta.className)}>
                                    <EventIcon className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-sm text-zinc-100 truncate">{eventMeta.label}</div>
                                    <div className="text-[11px] text-zinc-500 font-mono">#{event.sequence} · {formatDateTime(event.createdAt)}</div>
                                  </div>
                                </div>
                                {event.nodeId && <div className="text-[11px] text-zinc-500 font-mono shrink-0">{event.nodeId}</div>}
                              </div>

                              {event.message && <div className="text-sm text-zinc-300 leading-6">{event.message}</div>}
                            </div>
                          );
                        })}
                      </div>

                      <SectionTitle icon={<Camera className="w-4 h-4 text-fuchsia-400" />} title="截图回放" />
                      {activeScreenshot ? (
                        <div className="space-y-3">
                          <div className="rounded-xl overflow-hidden border border-white/[0.05] bg-black/40">
                            <img src={`data:${activeScreenshot.mimeType || "image/jpeg"};base64,${activeScreenshot.imageBase64}`} alt="任务截图" className="w-full h-[280px] object-contain bg-black" />
                          </div>
                          <div className="text-xs text-zinc-500">截图时间：{formatDateTime(activeScreenshot.createdAt)}</div>
                          <div className="grid grid-cols-3 gap-3 max-h-[220px] overflow-auto pr-1">
                            {screenshotEvents.map((event) => (
                              <button key={event.id} onClick={() => setSelectedScreenshotId(event.id)} className={cn("rounded-lg overflow-hidden border transition-colors bg-black/30", activeScreenshot.id === event.id ? "border-sky-500/60" : "border-white/[0.06] hover:border-white/[0.18]")}>
                                <img src={`data:${event.mimeType || "image/jpeg"};base64,${event.imageBase64}`} alt="任务缩略图" className="w-full h-24 object-cover bg-black" />
                                <div className="px-2 py-2 text-[11px] text-zinc-400">{formatDateTime(event.createdAt)}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <EmptyBlock text="这个任务还没有持久化截图。" />
                      )}

                      <SectionTitle icon={<FileSearch className="w-4 h-4 text-violet-400" />} title="提取结果" />
                      {extractEvents.length > 0 ? (
                        <div className="space-y-3">
                          {extractEvents.map((event) => (
                            <div key={event.id} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 space-y-2">
                              <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                                <span>{formatDateTime(event.createdAt)}</span>
                                {event.nodeId && <span className="font-mono">{event.nodeId}</span>}
                              </div>
                              <div className="text-xs text-zinc-400">选择器：<span className="font-mono text-zinc-200">{getPayloadString(event.payload, "selector") || "--"}</span></div>
                              <div className="text-xs text-zinc-400">属性：<span className="font-mono text-zinc-200">{getPayloadString(event.payload, "property") || "text"}</span></div>
                              <pre className="rounded-md bg-black/30 p-3 text-xs text-zinc-200 whitespace-pre-wrap break-all font-mono max-h-40 overflow-auto">{getPayloadString(event.payload, "value") || "[空值]"}</pre>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyBlock text="这个任务没有提取类节点结果。" />
                      )}

                      <SectionTitle icon={<SquareTerminal className="w-4 h-4 text-emerald-400" />} title="工作流快照" />
                      <div className="rounded-lg border border-white/[0.05] bg-black/30 p-4">
                        <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-all font-mono max-h-[260px] overflow-auto">
                          {JSON.stringify(selectedTask.workflowSnapshot ?? selectedTask.workflow?.definition ?? {}, null, 2)}
                        </pre>
                      </div>

                      {selectedTask.errorMessage && (
                        <>
                          <SectionTitle icon={<AlertCircle className="w-4 h-4 text-red-400" />} title="错误信息" />
                          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                            {selectedTask.errorMessage}
                          </div>
                        </>
                      )}
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

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="text-sm font-medium text-zinc-100 flex items-center gap-2">
      {icon}
      {title}
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 text-sm text-zinc-500">
      {text}
    </div>
  );
}
