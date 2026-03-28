import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
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
import { getTask, listTasks, TaskRecord } from "@/src/lib/cloudflow";

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

export function MonitorCenter() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
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
    if (selectedTaskId) {
      void loadTaskDetail(selectedTaskId);
    } else {
      setSelectedTask(null);
    }
  }, [loadTaskDetail, selectedTaskId]);

  const metrics = useMemo(() => {
    const running = tasks.filter((task) => task.status === "running").length;
    const success = tasks.filter((task) => task.status === "success").length;
    const failed = tasks.filter((task) => task.status === "failed").length;
    const cancelled = tasks.filter((task) => task.status === "cancelled").length;

    return { running, success, failed, cancelled, total: tasks.length };
  }, [tasks]);

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
              <p className="text-zinc-400 mt-2 text-sm">查看最近任务的执行状态、时间线和工作流快照。</p>
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

          <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
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
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Workflow className="w-4 h-4" />
                      <span className="text-sm font-medium text-zinc-100">{selectedTask?.workflow?.name || "未命名工作流"}</span>
                    </div>
                    <div className="text-xs text-zinc-500 font-mono break-all">{selectedTask?.id}</div>
                  </div>

                  {selectedTask && (
                    <>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
                          <div className="text-zinc-500 mb-2">任务状态</div>
                          <div className="text-zinc-100">{getStatusMeta(selectedTask.status).label}</div>
                        </div>
                        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
                          <div className="text-zinc-500 mb-2">节点数量</div>
                          <div className="text-zinc-100">{selectedTask.workflowSnapshot?.nodes?.length ?? selectedTask.workflow?.definition?.nodes?.length ?? 0}</div>
                        </div>
                        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
                          <div className="text-zinc-500 mb-2">运行耗时</div>
                          <div className="text-zinc-100 font-mono">{formatDuration(selectedTask.startedAt, selectedTask.completedAt)}</div>
                        </div>
                        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
                          <div className="text-zinc-500 mb-2">关联工作流</div>
                          <div className="text-zinc-100 break-all">{selectedTask.workflowId}</div>
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
