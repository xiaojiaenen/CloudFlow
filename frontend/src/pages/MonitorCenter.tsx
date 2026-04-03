import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Cpu,
  FileSearch,
  LoaderCircle,
  RefreshCw,
  SquareTerminal,
  Workflow,
  XCircle,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AppTopbar } from "@/src/components/AppTopbar";
import { Sidebar } from "@/src/components/Sidebar";
import { Button } from "@/src/components/ui/Button";
import { Chart } from "@/src/components/ui/Chart";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/src/components/ui/Dialog";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/Tabs";
import { cancelTask, getTask, getTaskExecutionScreenshotSrc, getTaskSummary, listTasks, retryTask, TaskExecutionRecord, TaskRecord, TaskSummaryRecord } from "@/src/lib/cloudflow";
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

function getStatusStripeClass(status: TaskRecord["status"]) {
  if (status === "running") {
    return "bg-sky-400";
  }

  if (status === "success") {
    return "bg-emerald-400";
  }

  if (status === "failed") {
    return "bg-red-400";
  }

  if (status === "cancelled") {
    return "bg-amber-400";
  }

  return "bg-zinc-500";
}

function formatTimeLabel(value?: string | null) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function CompactMetric({ label, value, colorClass }: { label: string; value: number; colorClass?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-3">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold text-zinc-100", colorClass)}>{value}</div>
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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => taskIdFromQuery);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
  const [selectedScreenshotId, setSelectedScreenshotId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState("charts");
  const [isScreenshotDialogOpen, setIsScreenshotDialogOpen] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

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
      setSelectedTaskId((current) => {
        if (current) {
          return current;
        }

        if (taskIdFromQuery) {
          return taskIdFromQuery;
        }

        return data.items[0]?.id ?? null;
      });
    } finally {
      setIsLoadingTasks(false);
    }
  }, [search, statusFilter, taskIdFromQuery, taskPage, taskPageSize, triggerFilter]);

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
    if (!selectedTaskId && taskIdFromQuery) {
      setSelectedTaskId(taskIdFromQuery);
    }
  }, [selectedTaskId, taskIdFromQuery]);

  useEffect(() => {
    if (!selectedTaskId) {
      setSelectedTask(null);
      return;
    }

    setSearchParams((current) => {
      if (current.get("taskId") === selectedTaskId) {
        return current;
      }

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
  const screenshotEvents = useMemo(() => executionEvents.filter((event) => event.type === "screenshot"), [executionEvents]);
  const extractEvents = useMemo(() => executionEvents.filter((event) => event.type === "extract"), [executionEvents]);
  const activeScreenshot = useMemo(() => {
    if (screenshotEvents.length === 0) {
      return null;
    }

    return screenshotEvents.find((event) => event.id === selectedScreenshotId) ?? screenshotEvents[screenshotEvents.length - 1];
  }, [screenshotEvents, selectedScreenshotId]);
  const activeScreenshotIndex = useMemo(
    () => (activeScreenshot ? screenshotEvents.findIndex((event) => event.id === activeScreenshot.id) : -1),
    [activeScreenshot, screenshotEvents],
  );

  useEffect(() => {
    if (screenshotEvents.length === 0) {
      setSelectedScreenshotId(null);
      setIsScreenshotDialogOpen(false);
      return;
    }

    setSelectedScreenshotId((current) => {
      if (current && screenshotEvents.some((event) => event.id === current)) {
        return current;
      }

      return screenshotEvents[screenshotEvents.length - 1].id;
    });
  }, [screenshotEvents]);

  const showPreviousScreenshot = useCallback(() => {
    if (screenshotEvents.length <= 1 || activeScreenshotIndex <= 0) {
      return;
    }

    setSelectedScreenshotId(screenshotEvents[activeScreenshotIndex - 1].id);
  }, [activeScreenshotIndex, screenshotEvents]);

  const showNextScreenshot = useCallback(() => {
    if (screenshotEvents.length <= 1 || activeScreenshotIndex === -1 || activeScreenshotIndex >= screenshotEvents.length - 1) {
      return;
    }

    setSelectedScreenshotId(screenshotEvents[activeScreenshotIndex + 1].id);
  }, [activeScreenshotIndex, screenshotEvents]);

  useEffect(() => {
    if (!isScreenshotDialogOpen && detailTab !== "screenshots") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isTypingTarget =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        Boolean(target?.isContentEditable);

      if (isTypingTarget) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPreviousScreenshot();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNextScreenshot();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailTab, isScreenshotDialogOpen, showNextScreenshot, showPreviousScreenshot]);

  const statusChartOption = useMemo(() => ({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(9, 9, 11, 0.92)",
      borderColor: "rgba(255,255,255,0.08)",
      textStyle: { color: "#f4f4f5" },
    },
    legend: {
      bottom: 0,
      textStyle: { color: "#a1a1aa" },
      icon: "circle",
    },
    series: [
      {
        type: "pie",
        radius: ["54%", "78%"],
        center: ["50%", "42%"],
        label: { color: "#d4d4d8", formatter: "{b}\n{c}" },
        labelLine: { lineStyle: { color: "rgba(255,255,255,0.18)" } },
        itemStyle: { borderColor: "#09090b", borderWidth: 4 },
        data: [
          { value: metrics.pending, name: "等待中", itemStyle: { color: "#71717a" } },
          { value: metrics.running, name: "运行中", itemStyle: { color: "#38bdf8" } },
          { value: metrics.success, name: "成功", itemStyle: { color: "#34d399" } },
          { value: metrics.failed, name: "失败", itemStyle: { color: "#f87171" } },
          { value: metrics.cancelled, name: "已取消", itemStyle: { color: "#fbbf24" } },
        ],
      },
    ],
  }), [metrics]);

  const triggerChartOption = useMemo(() => ({
    backgroundColor: "transparent",
    grid: { left: 36, right: 18, top: 24, bottom: 30 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "rgba(9, 9, 11, 0.92)",
      borderColor: "rgba(255,255,255,0.08)",
      textStyle: { color: "#f4f4f5" },
    },
    xAxis: {
      type: "category",
      data: ["手动触发", "定时触发"],
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.12)" } },
      axisLabel: { color: "#a1a1aa" },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
      axisLabel: { color: "#71717a" },
    },
    series: [
      {
        type: "bar",
        barWidth: 34,
        data: [
          { value: summary?.byTriggerSource.manual ?? 0, itemStyle: { color: "#60a5fa", borderRadius: [10, 10, 0, 0] } },
          { value: summary?.byTriggerSource.schedule ?? 0, itemStyle: { color: "#a78bfa", borderRadius: [10, 10, 0, 0] } },
        ],
      },
    ],
  }), [summary]);

  const eventTrendOption = useMemo(() => {
    const timeline = executionEvents.slice(-18);
    const counters = {
      log: 0,
      screenshot: 0,
      extract: 0,
      status: 0,
    };

    const points = timeline.map((event) => {
      counters[event.type] += 1;
      return {
        label: `#${event.sequence}`,
        logs: counters.log,
        screenshots: counters.screenshot,
        extracts: counters.extract,
        statuses: counters.status,
      };
    });

    return {
      backgroundColor: "transparent",
      grid: { left: 36, right: 18, top: 24, bottom: 28 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(9, 9, 11, 0.92)",
        borderColor: "rgba(255,255,255,0.08)",
        textStyle: { color: "#f4f4f5" },
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: "#a1a1aa" },
      },
      xAxis: {
        type: "category",
        data: points.map((item) => item.label),
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.12)" } },
        axisLabel: { color: "#71717a" },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
        axisLabel: { color: "#71717a" },
      },
      series: [
        { type: "line", smooth: true, name: "日志", symbol: "circle", symbolSize: 7, lineStyle: { width: 3, color: "#38bdf8" }, itemStyle: { color: "#38bdf8" }, areaStyle: { color: "rgba(56, 189, 248, 0.12)" }, data: points.map((item) => item.logs) },
        { type: "line", smooth: true, name: "截图", symbol: "circle", symbolSize: 7, lineStyle: { width: 3, color: "#f472b6" }, itemStyle: { color: "#f472b6" }, areaStyle: { color: "rgba(244, 114, 182, 0.1)" }, data: points.map((item) => item.screenshots) },
        { type: "line", smooth: true, name: "提取", symbol: "circle", symbolSize: 7, lineStyle: { width: 3, color: "#a78bfa" }, itemStyle: { color: "#a78bfa" }, areaStyle: { color: "rgba(167, 139, 250, 0.1)" }, data: points.map((item) => item.extracts) },
        { type: "line", smooth: true, name: "状态", symbol: "circle", symbolSize: 7, lineStyle: { width: 3, color: "#34d399" }, itemStyle: { color: "#34d399" }, areaStyle: { color: "rgba(52, 211, 153, 0.1)" }, data: points.map((item) => item.statuses) },
      ],
    };
  }, [executionEvents]);

  const resourceChartOption = useMemo(() => ({
    backgroundColor: "transparent",
    grid: { left: 48, right: 18, top: 24, bottom: 24 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "rgba(9, 9, 11, 0.92)",
      borderColor: "rgba(255,255,255,0.08)",
      textStyle: { color: "#f4f4f5" },
    },
    legend: {
      top: 0,
      right: 0,
      textStyle: { color: "#a1a1aa" },
    },
    xAxis: {
      type: "category",
      data: ["RSS(MB)", "Heap(MB)", "CPU(%)"],
      axisLabel: { color: "#a1a1aa" },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.12)" } },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
      axisLabel: { color: "#71717a" },
    },
    series: [
      {
        name: "当前",
        type: "bar",
        barGap: "18%",
        data: [
          selectedTask?.memoryRssMb ?? 0,
          selectedTask?.heapUsedMb ?? 0,
          selectedTask?.cpuPercent ?? 0,
        ],
        itemStyle: { color: "#38bdf8", borderRadius: [8, 8, 0, 0] },
      },
      {
        name: "峰值",
        type: "bar",
        data: [
          selectedTask?.peakMemoryRssMb ?? selectedTask?.memoryRssMb ?? 0,
          selectedTask?.peakHeapUsedMb ?? selectedTask?.heapUsedMb ?? 0,
          selectedTask?.peakCpuPercent ?? selectedTask?.cpuPercent ?? 0,
        ],
        itemStyle: { color: "#f59e0b", borderRadius: [8, 8, 0, 0] },
      },
    ],
  }), [selectedTask]);

  const handleTaskMutationRefresh = useCallback(async () => {
    await Promise.all([loadTasks(), loadSummary()]);
    if (selectedTaskId) {
      await loadTaskDetail(selectedTaskId);
    }
  }, [loadSummary, loadTaskDetail, loadTasks, selectedTaskId]);

  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-50 flex overflow-hidden font-sans selection:bg-sky-500/30">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-[#09090b] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-900/10 via-transparent to-transparent pointer-events-none" />
        <AppTopbar
          title="任务历史与详情"
          subtitle="支持筛选任务、批量取消和失败重试，并可查看图表、日志、截图与运行快照。"
          badge="Monitor"
          actions={
            <Button variant="outline" onClick={() => { void loadTasks(); void loadSummary(); }} className="gap-2">
              <RefreshCw className={cn("w-4 h-4", isLoadingTasks && "animate-spin")} />
              刷新任务
            </Button>
          }
        />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto p-6 xl:overflow-hidden xl:p-8">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 xl:min-h-0 xl:flex-1">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr_1fr]">
              <div className="rounded-xl border border-white/[0.05] bg-zinc-950/50 p-4 backdrop-blur-md">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-100">
                  <BarChart3 className="h-4 w-4 text-sky-400" />
                  监控总览
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <CompactMetric label="任务总数" value={metrics.total} />
                  <CompactMetric label="等待中" value={metrics.pending} />
                  <CompactMetric label="运行中" value={metrics.running} colorClass="text-sky-400" />
                  <CompactMetric label="成功" value={metrics.success} colorClass="text-emerald-400" />
                  <CompactMetric label="失败" value={metrics.failed} colorClass="text-red-400" />
                  <CompactMetric label="已取消" value={metrics.cancelled} colorClass="text-amber-400" />
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.05] bg-zinc-950/50 p-4 backdrop-blur-md">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-100">
                  <BarChart3 className="h-4 w-4 text-sky-400" />
                  状态分布图
                </div>
                <Chart option={statusChartOption} className="h-[168px]" notMerge lazyUpdate />
              </div>
              <div className="rounded-xl border border-white/[0.05] bg-zinc-950/50 p-4 backdrop-blur-md">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-100">
                  <Activity className="h-4 w-4 text-violet-300" />
                  触发来源分布
                </div>
                <Chart option={triggerChartOption} className="h-[168px]" notMerge lazyUpdate />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:min-h-0 xl:flex-1 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl backdrop-blur-md overflow-hidden xl:flex xl:min-h-0 xl:flex-col">
                <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-100">任务列表</div>
                <div className="text-xs text-zinc-500">
                  {isLoadingTasks ? "正在同步..." : `第 ${taskPage} / ${taskTotalPages} 页 · 共 ${taskTotal} 条`}
                </div>
              </div>

              <div className="px-5 py-4 border-b border-white/[0.05] space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px_160px] gap-3">
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索任务 ID 或工作流名称" />
                  <Select
                    value={statusFilter}
                    onChange={(value) => setStatusFilter(value as typeof statusFilter)}
                    options={[
                      { value: "all", label: "全部状态", description: "查看全部任务状态", group: "任务状态" },
                      { value: "pending", label: "等待中", description: "尚未开始执行", group: "任务状态" },
                      { value: "running", label: "运行中", description: "正在执行中的任务", group: "任务状态" },
                      { value: "success", label: "成功", description: "已成功完成", group: "任务状态" },
                      { value: "failed", label: "失败", description: "执行失败的任务", tone: "danger", group: "任务状态" },
                      { value: "cancelled", label: "已取消", description: "手动取消或系统终止", group: "任务状态" },
                    ]}
                  />
                  <Select
                    value={triggerFilter}
                    onChange={(value) => setTriggerFilter(value as typeof triggerFilter)}
                    options={[
                      { value: "all", label: "全部触发方式", description: "包含手动和定时任务", group: "触发方式" },
                      { value: "manual", label: "手动触发", description: "来自工作区或详情页手动启动", group: "触发方式" },
                      { value: "schedule", label: "定时触发", description: "来自调度中心自动触发", group: "触发方式" },
                    ]}
                  />
                </div>
                <div className="text-xs text-zinc-500">点击任务卡片即可查看详情，支持分页与筛选。</div>
              </div>

              <div className="divide-y divide-white/[0.05] xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
                {tasks.length === 0 && (
                  <div className="px-5 py-12 text-center text-sm text-zinc-500">当前没有符合条件的任务记录。</div>
                )}

                {tasks.map((task) => {
                  const statusMeta = getStatusMeta(task.status);
                  const StatusIcon = statusMeta.icon;
                  const triggerMeta = getTriggerMeta(task.triggerSource);

                  return (
                    <div
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedTaskId(task.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedTaskId(task.id);
                        }
                      }}
                      className={cn(
                        "group relative overflow-hidden border-l-2 border-transparent px-5 py-4 cursor-pointer transition-all duration-200 hover:bg-white/[0.04]",
                        selectedTaskId === task.id
                          ? "bg-sky-500/[0.08] border-l-sky-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                          : "hover:border-l-white/15",
                      )}
                    >
                      <div className={cn("absolute left-0 top-3 bottom-3 w-1 rounded-r-full opacity-45 transition-opacity duration-200 group-hover:opacity-80", getStatusStripeClass(task.status), selectedTaskId === task.id && "opacity-100")} />
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 text-left">
                          <div className="text-sm font-medium text-zinc-100 truncate">{task.workflow?.name || "未命名工作流"}</div>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            <div className="text-xs text-zinc-500 font-mono truncate">{task.id}</div>
                            <div className={cn("px-2 py-0.5 rounded text-[10px] font-medium", triggerMeta.className)}>{triggerMeta.label}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {(task.status === "pending" || task.status === "running") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
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
                              onClick={(event) => {
                                event.stopPropagation();
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

              <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl backdrop-blur-md overflow-hidden xl:flex xl:min-h-0 xl:flex-col">
              <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-100">任务详情</div>
                {isLoadingDetail && <div className="text-xs text-zinc-500">正在加载...</div>}
              </div>

              {!selectedTask && !isLoadingDetail ? (
                <div className="px-5 py-12 text-center text-sm text-zinc-500">请选择左侧任务查看详细信息。</div>
              ) : (
                  <div className="p-5 space-y-6 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
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

                      <Tabs defaultValue="charts" className="flex min-h-0 flex-1 flex-col">
                        <div className="sticky top-0 z-10 -mx-1 border-b border-white/[0.05] bg-zinc-950/90 px-1 pb-4 backdrop-blur-md">
                          <TabsList className="grid h-auto w-full grid-cols-4 bg-zinc-900/70">
                            <TabsTrigger value="charts" className="py-2">图表</TabsTrigger>
                            <TabsTrigger value="logs" className="py-2">日志</TabsTrigger>
                            <TabsTrigger value="screenshots" className="py-2">截图</TabsTrigger>
                            <TabsTrigger value="snapshot" className="py-2">快照</TabsTrigger>
                          </TabsList>
                        </div>

                        <TabsContent value="charts" className="mt-0 min-h-0 flex-1 overflow-y-auto pr-1 pt-4">
                          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                            <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
                              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-100">
                                <BarChart3 className="h-4 w-4 text-sky-400" />
                                执行节奏图
                              </div>
                              {executionEvents.length > 0 ? (
                                <Chart option={eventTrendOption} className="h-[300px]" notMerge lazyUpdate />
                              ) : (
                                <EmptyBlock text="这个任务还没有足够的事件数据用于绘图。" />
                              )}
                            </div>
                            <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
                              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-100">
                                <Cpu className="h-4 w-4 text-amber-300" />
                                资源监控图
                              </div>
                              <Chart option={resourceChartOption} className="h-[300px]" notMerge lazyUpdate />
                              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-zinc-500">
                                <div>资源心跳：{formatTimeLabel(selectedTask.resourceHeartbeatAt)}</div>
                                <div>Worker PID：{selectedTask.workerPid ?? "--"}</div>
                                <div>临时目录：{selectedTask.tempDir ?? "--"}</div>
                                <div>优先级：{selectedTask.queuePriority ?? "--"}</div>
                              </div>
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="logs" className="mt-0 min-h-0 flex-1 overflow-y-auto pr-1 pt-4">
                          <SectionTitle icon={<SquareTerminal className="w-4 h-4 text-emerald-400" />} title="执行时间线" />
                          <div className="mt-4 space-y-3">
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
                        </TabsContent>

                        <TabsContent value="screenshots" className="mt-0 min-h-0 flex-1 overflow-y-auto pr-1 pt-4">
                          <SectionTitle icon={<Camera className="w-4 h-4 text-fuchsia-400" />} title="截图回放" />
                          <div className="mt-4">
                            {activeScreenshot ? (
                              <div className="space-y-3">
                                <button
                                  type="button"
                                  onClick={() => setIsScreenshotDialogOpen(true)}
                                  className="group block w-full rounded-xl overflow-hidden border border-white/[0.05] bg-black/40 text-left"
                                >
                                  <img
                                    src={getTaskExecutionScreenshotSrc(selectedTask.id, activeScreenshot) ?? ""}
                                    alt="任务截图"
                                    className="w-full h-[420px] object-contain bg-black transition-transform duration-200 group-hover:scale-[1.01]"
                                  />
                                </button>
                              <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                                <span>截图时间：{formatDateTime(activeScreenshot.createdAt)}</span>
                                <div className="flex items-center gap-3">
                                  <span className="hidden md:inline text-zinc-500">支持左右方向键切换上一张 / 下一张</span>
                                  <button type="button" onClick={() => setIsScreenshotDialogOpen(true)} className="text-sky-300 transition-colors hover:text-sky-200">
                                    点击放大查看
                                  </button>
                                </div>
                              </div>
                                <div className="grid grid-cols-3 gap-3 max-h-[260px] overflow-auto pr-1">
                                  {screenshotEvents.map((event) => (
                                    <button
                                      type="button"
                                      key={event.id}
                                      onClick={() => {
                                        setSelectedScreenshotId(event.id);
                                        setIsScreenshotDialogOpen(true);
                                      }}
                                      className={cn("rounded-lg overflow-hidden border transition-colors bg-black/30", activeScreenshot.id === event.id ? "border-sky-500/60" : "border-white/[0.06] hover:border-white/[0.18]")}
                                    >
                                      <img src={getTaskExecutionScreenshotSrc(selectedTask.id, event) ?? ""} alt="任务缩略图" className="w-full h-28 object-cover bg-black" />
                                      <div className="px-2 py-2 text-[11px] text-zinc-400">{formatDateTime(event.createdAt)}</div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <EmptyBlock text="这个任务还没有持久化截图。" />
                            )}
                          </div>
                        </TabsContent>

                        <TabsContent value="snapshot" className="mt-0 min-h-0 flex-1 overflow-y-auto pr-1 pt-4">
                          <div className="space-y-6">
                            <div>
                              <SectionTitle icon={<FileSearch className="w-4 h-4 text-violet-400" />} title="提取结果" />
                              <div className="mt-4 space-y-3">
                                {extractEvents.length > 0 ? (
                                  extractEvents.map((event) => (
                                    <div key={event.id} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 space-y-2">
                                      <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                                        <span>{formatDateTime(event.createdAt)}</span>
                                        {event.nodeId && <span className="font-mono">{event.nodeId}</span>}
                                      </div>
                                      <div className="text-xs text-zinc-400">选择器：<span className="font-mono text-zinc-200">{getPayloadString(event.payload, "selector") || "--"}</span></div>
                                      <div className="text-xs text-zinc-400">属性：<span className="font-mono text-zinc-200">{getPayloadString(event.payload, "property") || "text"}</span></div>
                                      <pre className="rounded-md bg-black/30 p-3 text-xs text-zinc-200 whitespace-pre-wrap break-all font-mono max-h-56 overflow-auto">{getPayloadString(event.payload, "value") || "[空值]"}</pre>
                                    </div>
                                  ))
                                ) : (
                                  <EmptyBlock text="这个任务没有提取类节点结果。" />
                                )}
                              </div>
                            </div>

                            <div>
                              <SectionTitle icon={<SquareTerminal className="w-4 h-4 text-emerald-400" />} title="工作流快照" />
                              <div className="mt-4 rounded-lg border border-white/[0.05] bg-black/30 p-4">
                                <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-all font-mono max-h-[420px] overflow-auto">
                                  {JSON.stringify(selectedTask.workflowSnapshot ?? selectedTask.workflow?.definition ?? {}, null, 2)}
                                </pre>
                              </div>
                            </div>

                            {selectedTask.errorMessage && (
                              <div>
                                <SectionTitle icon={<AlertCircle className="w-4 h-4 text-red-400" />} title="错误信息" />
                                <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                                  {selectedTask.errorMessage}
                                </div>
                              </div>
                            )}
                          </div>
                        </TabsContent>
                      </Tabs>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <Dialog open={isScreenshotDialogOpen && Boolean(activeScreenshot)} onOpenChange={setIsScreenshotDialogOpen} className="max-w-6xl border-white/[0.08] bg-zinc-950/95">
          <DialogHeader>
            <DialogTitle>任务截图预览</DialogTitle>
            {activeScreenshot && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
                <span>截图时间：{formatDateTime(activeScreenshot.createdAt)}</span>
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline">支持左右方向键切换</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={showPreviousScreenshot}
                    disabled={activeScreenshotIndex <= 0}
                    className="h-8 px-2 text-zinc-300 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    上一张
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={showNextScreenshot}
                    disabled={activeScreenshotIndex === -1 || activeScreenshotIndex >= screenshotEvents.length - 1}
                    className="h-8 px-2 text-zinc-300 disabled:opacity-40"
                  >
                    下一张
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </DialogHeader>
          <DialogContent className="space-y-4 overflow-y-auto">
            {activeScreenshot && (
              <img
                src={getTaskExecutionScreenshotSrc(selectedTask?.id ?? activeScreenshot.taskId, activeScreenshot) ?? ""}
                alt="任务截图大图预览"
                className="max-h-[75vh] w-full rounded-xl border border-white/[0.06] bg-black object-contain"
              />
            )}
          </DialogContent>
        </Dialog>
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
