import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Bell,
  Camera,
  CheckCircle2,
  Copy,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Cpu,
  Database,
  Download,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/Table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/Tabs";
import { useNotice } from "@/src/context/NoticeContext";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import {
  AlertRecord,
  cancelTask,
  DataBatchRowsResponse,
  DataWriteBatchRecord,
  getTask,
  getTaskExecutionScreenshotSrc,
  listDataBatchRows,
  listTaskDataBatches,
  getTaskSummary,
  listAlerts,
  listTasks,
  retryTask,
  TaskExecutionRecord,
  TaskRecord,
  TaskSummaryRecord,
} from "@/src/lib/cloudflow";
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

function getPayloadNumber(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getExtractPayloadValue(payload: Record<string, unknown> | null | undefined) {
  const value = payload?.value;

  if (Array.isArray(value)) {
    return JSON.stringify(value, null, 2);
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    return value;
  }

  return "";
}

function getExtractModeLabel(mode?: string) {
  switch (mode) {
    case "all":
      return "全部匹配项";
    case "count":
      return "匹配数量";
    default:
      return "首个匹配项";
  }
}

function getExtractSaveTargetLabel(target?: string) {
  switch (target) {
    case "variable":
      return "变量";
    case "task_output":
      return "任务结果";
    default:
      return "变量 + 任务结果";
  }
}

function getExtractResultFormatLabel(format?: string) {
  switch (format) {
    case "join":
      return "按分隔符拼接";
    case "json_array":
      return "JSON 数组";
    default:
      return "--";
  }
}

function createExtractExportRecord(event: TaskExecutionRecord) {
  return {
    id: event.id,
    nodeId: event.nodeId ?? null,
    createdAt: event.createdAt,
    selector: getPayloadString(event.payload, "selector") || null,
    property: getPayloadString(event.payload, "property") || "text",
    targetMode: getPayloadString(event.payload, "targetMode") || "first",
    saveTarget: getPayloadString(event.payload, "saveTarget") || "both",
    saveKey: getPayloadString(event.payload, "saveKey") || null,
    itemCount: getPayloadNumber(event.payload, "itemCount"),
    resultFormat: getPayloadString(event.payload, "resultFormat") || null,
    value: event.payload?.value ?? null,
    preview: getPayloadString(event.payload, "preview") || null,
  };
}

function downloadJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], {
    type: mimeType,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function stringifyTableCellValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "--";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function escapeCsv(value: unknown) {
  const text = stringifyTableCellValue(value).replaceAll('"', '""');
  return /[",\n]/.test(text) ? `"${text}"` : text;
}

function buildBatchRowsCsv(data: DataBatchRowsResponse) {
  const header = ["recordKey", "operation", ...data.columns, "errorMessage", "createdAt"];
  const lines = [
    header.join(","),
    ...data.items.map((row) =>
      [
        escapeCsv(row.recordKey),
        escapeCsv(row.operation),
        ...data.columns.map((column) => escapeCsv(row.dataJson?.[column])),
        escapeCsv(row.errorMessage),
        escapeCsv(row.createdAt),
      ].join(","),
    ),
  ];

  return lines.join("\n");
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

  if (event.type === "data_write") {
    return {
      label: "数据写入",
      className: "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20",
      icon: Database,
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

function getAlertMeta(level: AlertRecord["level"]) {
  if (level === "success") {
    return {
      icon: CheckCircle2,
      label: "成功",
      className: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    };
  }

  if (level === "warning") {
    return {
      icon: AlertTriangle,
      label: "告警",
      className: "border border-amber-500/20 bg-amber-500/10 text-amber-300",
    };
  }

  return {
    icon: XCircle,
    label: "错误",
    className: "border border-red-500/20 bg-red-500/10 text-red-300",
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
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-2.5">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold text-zinc-100", colorClass)}>{value}</div>
    </div>
  );
}

export function MonitorCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const taskIdFromQuery = searchParams.get("taskId");
  const viewFromQuery = searchParams.get("view");
  const { notify } = useNotice();
  const [activeView, setActiveView] = useState<"tasks" | "alerts">(() =>
    viewFromQuery === "alerts" ? "alerts" : "tasks",
  );
  const [isTaskOverviewCollapsed, setIsTaskOverviewCollapsed] = useState(
    () => localStorage.getItem("monitorTaskOverviewCollapsed") === "true",
  );
  const [isTaskDensityCompact, setIsTaskDensityCompact] = useState(
    () => localStorage.getItem("monitorTaskDensityCompact") === "true",
  );

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
  const [mutatingTaskId, setMutatingTaskId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [alertPage, setAlertPage] = useState(1);
  const [alertPageSize] = useState(10);
  const [alertLevelFilter, setAlertLevelFilter] = useState<AlertRecord["level"] | "all">("all");
  const [alertTotal, setAlertTotal] = useState(0);
  const [alertTotalPages, setAlertTotalPages] = useState(1);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [taskDataBatches, setTaskDataBatches] = useState<DataWriteBatchRecord[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchRowsResponse, setBatchRowsResponse] = useState<DataBatchRowsResponse | null>(null);
  const [isLoadingTaskData, setIsLoadingTaskData] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 350);

  const loadTasks = useCallback(async () => {
    try {
      setIsLoadingTasks(true);
      const data = await listTasks({
        page: taskPage,
        pageSize: taskPageSize,
        status: statusFilter === "all" ? undefined : statusFilter,
        triggerSource: triggerFilter === "all" ? undefined : triggerFilter,
        search: debouncedSearch,
      });

      setTaskTotal(data.total);
      setTaskTotalPages(data.totalPages);
      setTasks(data.items);
      setListError(null);
      setSelectedTaskId((current) => {
        if (current) {
          return current;
        }

        if (taskIdFromQuery) {
          return taskIdFromQuery;
        }

        return data.items[0]?.id ?? null;
      });
    } catch (error) {
      setListError(error instanceof Error ? error.message : "加载任务列表失败。");
    } finally {
      setIsLoadingTasks(false);
    }
  }, [debouncedSearch, statusFilter, taskIdFromQuery, taskPage, taskPageSize, triggerFilter]);

  const loadSummary = useCallback(async () => {
    try {
      const data = await getTaskSummary({
        status: statusFilter === "all" ? undefined : statusFilter,
        triggerSource: triggerFilter === "all" ? undefined : triggerFilter,
        search: debouncedSearch,
      });
      setSummary(data);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "加载任务汇总失败。");
    }
  }, [debouncedSearch, statusFilter, triggerFilter]);

  const loadTaskDetail = useCallback(async (taskId: string) => {
    try {
      setIsLoadingDetail(true);
      const data = await getTask(taskId);
      setSelectedTask(data);
      setDetailError(null);
    } catch (error) {
      setSelectedTask(null);
      setDetailError(error instanceof Error ? error.message : "加载任务详情失败。");
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  const loadTaskDataBatches = useCallback(async (taskId: string) => {
    try {
      setIsLoadingTaskData(true);
      const data = await listTaskDataBatches(taskId);
      setTaskDataBatches(data);
      setSelectedBatchId((current) => {
        if (current && data.some((item) => item.id === current)) {
          return current;
        }
        return data[0]?.id ?? null;
      });
    } catch (error) {
      setTaskDataBatches([]);
      setSelectedBatchId(null);
      setBatchRowsResponse(null);
      notify({
        tone: "error",
        title: "加载任务数据输出失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsLoadingTaskData(false);
    }
  }, [notify]);

  const loadBatchRows = useCallback(async (batchId: string) => {
    try {
      setIsLoadingTaskData(true);
      const data = await listDataBatchRows(batchId, {
        page: 1,
        pageSize: 200,
      });
      setBatchRowsResponse(data);
    } catch (error) {
      setBatchRowsResponse(null);
      notify({
        tone: "error",
        title: "加载批次明细失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsLoadingTaskData(false);
    }
  }, [notify]);

  const loadAlerts = useCallback(async () => {
    try {
      setIsLoadingAlerts(true);
      const data = await listAlerts({
        page: alertPage,
        pageSize: alertPageSize,
        level: alertLevelFilter === "all" ? undefined : alertLevelFilter,
      });
      setAlerts(data.items);
      setAlertTotal(data.total);
      setAlertTotalPages(data.totalPages);
      setAlertError(null);
    } catch (error) {
      setAlertError(error instanceof Error ? error.message : "加载告警列表失败。");
    } finally {
      setIsLoadingAlerts(false);
    }
  }, [alertLevelFilter, alertPage, alertPageSize]);

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
    if (activeView !== "alerts") {
      return;
    }

    void loadAlerts();

    const interval = window.setInterval(() => {
      void loadAlerts();
    }, 10000);

    return () => window.clearInterval(interval);
  }, [activeView, loadAlerts]);

  useEffect(() => {
    setTaskPage(1);
  }, [search, statusFilter, triggerFilter]);

  useEffect(() => {
    setAlertPage(1);
  }, [alertLevelFilter]);

  useEffect(() => {
    localStorage.setItem("monitorTaskOverviewCollapsed", String(isTaskOverviewCollapsed));
  }, [isTaskOverviewCollapsed]);

  useEffect(() => {
    localStorage.setItem("monitorTaskDensityCompact", String(isTaskDensityCompact));
  }, [isTaskDensityCompact]);

  useEffect(() => {
    const nextView = viewFromQuery === "alerts" ? "alerts" : "tasks";
    setActiveView((current) => (current === nextView ? current : nextView));
  }, [viewFromQuery]);

  useEffect(() => {
    setSearchParams(
      (current) => {
        const currentView = current.get("view");
        if (activeView === "alerts") {
          if (currentView === "alerts") {
            return current;
          }
          const next = new URLSearchParams(current);
          next.set("view", "alerts");
          return next;
        }

        if (!currentView) {
          return current;
        }

        const next = new URLSearchParams(current);
        next.delete("view");
        return next;
      },
      { replace: true },
    );
  }, [activeView, setSearchParams]);

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

  useEffect(() => {
    if (!selectedTaskId) {
      setTaskDataBatches([]);
      setSelectedBatchId(null);
      setBatchRowsResponse(null);
      return;
    }

    void loadTaskDataBatches(selectedTaskId);

    const interval = window.setInterval(() => {
      void loadTaskDataBatches(selectedTaskId);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [loadTaskDataBatches, selectedTaskId]);

  useEffect(() => {
    if (!selectedBatchId) {
      setBatchRowsResponse(null);
      return;
    }

    void loadBatchRows(selectedBatchId);

    const interval = window.setInterval(() => {
      void loadBatchRows(selectedBatchId);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [loadBatchRows, selectedBatchId]);

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
  const selectedBatch = useMemo(
    () => taskDataBatches.find((item) => item.id === selectedBatchId) ?? null,
    [selectedBatchId, taskDataBatches],
  );
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

  const copyExtractResult = useCallback(
    async (event: TaskExecutionRecord) => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(createExtractExportRecord(event), null, 2));
        notify({
          title: "提取结果已复制",
          description: "结果内容已经复制到剪贴板，可直接粘贴到排查记录或工单里。",
          tone: "success",
        });
      } catch (error) {
        notify({
          title: "复制失败",
          description: error instanceof Error ? error.message : "当前环境暂时无法访问剪贴板。",
          tone: "error",
        });
      }
    },
    [notify],
  );

  const exportExtractResult = useCallback(
    (event: TaskExecutionRecord) => {
      const nodeSuffix = event.nodeId ? `-${event.nodeId}` : "";
      downloadJsonFile(`extract-result-${event.id}${nodeSuffix}.json`, createExtractExportRecord(event));
      notify({
        title: "提取结果已导出",
        description: "已生成当前提取结果的 JSON 文件。",
        tone: "success",
      });
    },
    [notify],
  );

  const copyAllExtractResults = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(extractEvents.map((event) => createExtractExportRecord(event)), null, 2),
      );
      notify({
        title: "全部提取结果已复制",
        description: `已复制 ${extractEvents.length} 条提取结果。`,
        tone: "success",
      });
    } catch (error) {
      notify({
        title: "复制失败",
        description: error instanceof Error ? error.message : "当前环境暂时无法访问剪贴板。",
        tone: "error",
      });
    }
  }, [extractEvents, notify]);

  const exportAllExtractResults = useCallback(() => {
    downloadJsonFile(
      `extract-results-${selectedTask?.id ?? "task"}.json`,
      extractEvents.map((event) => createExtractExportRecord(event)),
    );
    notify({
      title: "全部提取结果已导出",
      description: `已导出 ${extractEvents.length} 条提取结果。`,
      tone: "success",
    });
  }, [extractEvents, notify, selectedTask?.id]);

  const copyBatchRows = useCallback(async () => {
    if (!batchRowsResponse) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            batch: batchRowsResponse.batch,
            columns: batchRowsResponse.columns,
            items: batchRowsResponse.items,
          },
          null,
          2,
        ),
      );
      notify({
        tone: "success",
        title: "数据输出已复制",
        description: `已复制 ${batchRowsResponse.items.length} 条批次明细。`,
      });
    } catch (error) {
      notify({
        tone: "error",
        title: "复制失败",
        description: error instanceof Error ? error.message : "当前环境暂时无法访问剪贴板。",
      });
    }
  }, [batchRowsResponse, notify]);

  const exportBatchRowsJson = useCallback(() => {
    if (!selectedBatch) {
      return;
    }
    void (async () => {
      const data = await listDataBatchRows(selectedBatch.id, { page: 1, pageSize: 1000 });
      downloadJsonFile(`task-data-${selectedBatch.id}.json`, {
        batch: data.batch,
        columns: data.columns,
        items: data.items,
      });
      notify({
        tone: "success",
        title: "数据输出已导出",
        description: `已导出 ${data.items.length} 条批次明细 JSON。`,
      });
    })().catch((error) => {
      notify({
        tone: "error",
        title: "导出失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    });
  }, [notify, selectedBatch]);

  const exportBatchRowsCsv = useCallback(() => {
    if (!selectedBatch) {
      return;
    }

    void (async () => {
      const data = await listDataBatchRows(selectedBatch.id, { page: 1, pageSize: 1000 });
      downloadTextFile(
        `task-data-${selectedBatch.id}.csv`,
        buildBatchRowsCsv(data),
        "text/csv;charset=utf-8",
      );
      notify({
        tone: "success",
        title: "数据输出已导出",
        description: `已导出 ${data.items.length} 条批次明细 CSV。`,
      });
    })().catch((error) => {
      notify({
        tone: "error",
        title: "导出失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    });
  }, [notify, selectedBatch]);

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

  const alertMetrics = useMemo(() => {
    const error = alerts.filter((item) => item.level === "error").length;
    const warning = alerts.filter((item) => item.level === "warning").length;
    const success = alerts.filter((item) => item.level === "success").length;

    return {
      error,
      warning,
      success,
    };
  }, [alerts]);

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
          title={activeView === "alerts" ? "监控与告警" : "任务历史与详情"}
          subtitle={
            activeView === "alerts"
              ? "在一个页面里集中查看任务异常、成功通知和运行告警，不再拆成独立告警页。"
              : "支持筛选任务、批量取消和失败重试，并可查看图表、日志、截图与运行快照。"
          }
          badge="Monitor"
          actions={
            <Button
              variant="outline"
              onClick={() => {
                if (activeView === "alerts") {
                  void loadAlerts();
                  return;
                }

                void loadTasks();
                void loadSummary();
              }}
              className="gap-2"
            >
              <RefreshCw className={cn("w-4 h-4", (activeView === "alerts" ? isLoadingAlerts : isLoadingTasks) && "animate-spin")} />
              刷新
            </Button>
          }
        />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto p-4 xl:overflow-hidden xl:p-6 2xl:px-8">
          <div className="mx-auto flex w-full max-w-none flex-col gap-6 xl:min-h-0 xl:flex-1">
            <div className="flex items-center justify-between gap-4">
              <Tabs value={activeView} onValueChange={(value) => setActiveView(value as "tasks" | "alerts")}>
                <TabsList className="h-auto bg-zinc-950/70">
                  <TabsTrigger value="tasks" className="gap-2 py-2">
                    <Activity className="h-4 w-4" />
                    任务监控
                  </TabsTrigger>
                  <TabsTrigger value="alerts" className="gap-2 py-2">
                    <Bell className="h-4 w-4" />
                    告警事件
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="text-xs text-zinc-500">
                {activeView === "alerts" ? "告警已并入监控中心" : "任务、告警统一在这里排查"}
              </div>
            </div>

            {activeView === "tasks" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-4 xl:gap-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-100">概览与趋势</div>
                    <div className="text-xs text-zinc-500">收起后可把更多高度让给任务列表和任务详情。</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setIsTaskOverviewCollapsed((value) => !value)}
                  >
                    <ChevronRight
                      className={cn("h-4 w-4 transition-transform", !isTaskOverviewCollapsed && "rotate-90")}
                    />
                    {isTaskOverviewCollapsed ? "展开概览" : "收起概览"}
                  </Button>
                </div>

                {isTaskOverviewCollapsed ? (
                  <div className="rounded-xl border border-white/[0.05] bg-zinc-950/45 px-4 py-3 backdrop-blur-md">
                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 xl:grid-cols-6">
                      <CompactMetric label="任务总数" value={metrics.total} />
                      <CompactMetric label="等待中" value={metrics.pending} />
                      <CompactMetric label="运行中" value={metrics.running} colorClass="text-sky-400" />
                      <CompactMetric label="成功" value={metrics.success} colorClass="text-emerald-400" />
                      <CompactMetric label="失败" value={metrics.failed} colorClass="text-red-400" />
                      <CompactMetric label="已取消" value={metrics.cancelled} colorClass="text-amber-400" />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr_1fr]">
                    <div className="rounded-xl border border-white/[0.05] bg-zinc-950/50 p-3.5 backdrop-blur-md">
                      <div className="mb-2.5 flex items-center gap-2 text-sm font-medium text-zinc-100">
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
                    <div className="rounded-xl border border-white/[0.05] bg-zinc-950/50 p-3.5 backdrop-blur-md">
                      <div className="mb-2.5 flex items-center gap-2 text-sm font-medium text-zinc-100">
                        <BarChart3 className="h-4 w-4 text-sky-400" />
                        状态分布图
                      </div>
                      <Chart option={statusChartOption} className="h-[136px] xl:h-[128px]" notMerge lazyUpdate />
                    </div>
                    <div className="rounded-xl border border-white/[0.05] bg-zinc-950/50 p-3.5 backdrop-blur-md">
                      <div className="mb-2.5 flex items-center gap-2 text-sm font-medium text-zinc-100">
                        <Activity className="h-4 w-4 text-violet-300" />
                        触发来源分布
                      </div>
                      <Chart option={triggerChartOption} className="h-[136px] xl:h-[128px]" notMerge lazyUpdate />
                    </div>
                  </div>
                )}

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 xl:grid-cols-[minmax(620px,1.02fr)_minmax(760px,1.28fr)] 2xl:grid-cols-[minmax(700px,1fr)_minmax(920px,1.34fr)]">
              <div className="min-w-0 bg-zinc-950/50 border border-white/[0.05] rounded-xl backdrop-blur-md overflow-hidden xl:flex xl:min-h-0 xl:flex-col">
                <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-100">任务列表</div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setIsTaskDensityCompact((value) => !value)}
                  >
                    {isTaskDensityCompact ? "标准模式" : "紧凑模式"}
                  </Button>
                  <div className="text-xs text-zinc-500">
                    {isLoadingTasks ? "正在同步..." : `第 ${taskPage} / ${taskTotalPages} 页 · 共 ${taskTotal} 条`}
                  </div>
                </div>
              </div>

                <div className="px-5 py-4 border-b border-white/[0.05] space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.25fr)_180px_180px] gap-3">
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
                <div className="text-xs text-zinc-500">
                  {search !== debouncedSearch
                    ? "正在应用搜索条件..."
                    : isTaskDensityCompact
                      ? "紧凑模式已开启，同屏显示更多任务。"
                      : "点击任务卡片即可查看详情，支持分页与筛选。"}
                </div>
              </div>

              <div className="divide-y divide-white/[0.05] xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
                {listError ? (
                  <div className="px-5 py-4 text-sm text-red-300">{listError}</div>
                ) : null}
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
                        "group relative overflow-hidden border-l-2 border-transparent cursor-pointer transition-all duration-200 hover:bg-white/[0.04]",
                        isTaskDensityCompact ? "px-4 py-3" : "px-5 py-4",
                        selectedTaskId === task.id
                          ? "bg-sky-500/[0.08] border-l-sky-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                          : "hover:border-l-white/15",
                      )}
                    >
                      <div
                        className={cn(
                          "absolute left-0 w-1 rounded-r-full opacity-45 transition-opacity duration-200 group-hover:opacity-80",
                          isTaskDensityCompact ? "top-2.5 bottom-2.5" : "top-3 bottom-3",
                          getStatusStripeClass(task.status),
                          selectedTaskId === task.id && "opacity-100",
                        )}
                      />
                      <div className={cn("flex items-start justify-between", isTaskDensityCompact ? "gap-3" : "gap-4")}>
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
                              disabled={mutatingTaskId === task.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void (async () => {
                                  try {
                                    setMutatingTaskId(task.id);
                                    await cancelTask(task.id);
                                    await handleTaskMutationRefresh();
                                    notify({
                                      tone: "success",
                                      title: "停止请求已发送",
                                      description: `任务 ${task.id} 正在等待 Worker 安全退出。`,
                                    });
                                  } catch (error) {
                                    notify({
                                      tone: "error",
                                      title: "停止任务失败",
                                      description: error instanceof Error ? error.message : "请稍后重试。",
                                    });
                                  } finally {
                                    setMutatingTaskId(null);
                                  }
                                })();
                              }}
                            >
                              {mutatingTaskId === task.id ? "处理中..." : "取消"}
                            </Button>
                          )}
                          {(task.status === "failed" || task.status === "cancelled") && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={mutatingTaskId === task.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void (async () => {
                                  try {
                                    setMutatingTaskId(task.id);
                                    await retryTask(task.id);
                                    await handleTaskMutationRefresh();
                                    notify({
                                      tone: "success",
                                      title: "任务已重新入队",
                                      description: `任务 ${task.id} 会按最新快照重新执行。`,
                                    });
                                  } catch (error) {
                                    notify({
                                      tone: "error",
                                      title: "重试任务失败",
                                      description: error instanceof Error ? error.message : "请稍后重试。",
                                    });
                                  } finally {
                                    setMutatingTaskId(null);
                                  }
                                })();
                              }}
                            >
                              {mutatingTaskId === task.id ? "处理中..." : "重试"}
                            </Button>
                          )}
                          <div className={cn("px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1.5 shrink-0", statusMeta.className)}>
                            <StatusIcon className={cn("w-3.5 h-3.5", task.status === "running" && "animate-spin")} />
                            {statusMeta.label}
                          </div>
                        </div>
                      </div>

                      {isTaskDensityCompact ? (
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                          <div className="text-zinc-500">
                            创建：
                            <span className="ml-1 text-zinc-300">{formatDateTime(task.createdAt)}</span>
                          </div>
                          <div className="text-zinc-500">
                            开始：
                            <span className="ml-1 text-zinc-300">{formatDateTime(task.startedAt)}</span>
                          </div>
                          <div className="text-zinc-500">
                            结束：
                            <span className="ml-1 text-zinc-300">{formatDateTime(task.completedAt)}</span>
                          </div>
                          <div className="text-zinc-500">
                            耗时：
                            <span className="ml-1 font-mono text-zinc-300">{formatDuration(task.startedAt, task.completedAt)}</span>
                          </div>
                        </div>
                      ) : (
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
                      )}
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

              <div className="min-w-0 bg-zinc-950/50 border border-white/[0.05] rounded-xl backdrop-blur-md overflow-hidden xl:flex xl:min-h-0 xl:flex-col">
              <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-100">任务详情</div>
                {isLoadingDetail && <div className="text-xs text-zinc-500">正在加载...</div>}
              </div>

              {detailError && !isLoadingDetail ? (
                <div className="px-5 py-6 text-sm text-red-300">{detailError}</div>
              ) : null}

              {!selectedTask && !isLoadingDetail && !detailError ? (
                <div className="px-5 py-12 text-center text-sm text-zinc-500">请选择左侧任务查看详细信息。</div>
              ) : (
                  <div className="p-6 space-y-6 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
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
                      <div className={cn("grid text-sm", isTaskDensityCompact ? "grid-cols-2 gap-3 xl:grid-cols-4" : "grid-cols-2 gap-4")}>
                        <div className={cn("rounded-lg border border-white/[0.05] bg-white/[0.02]", isTaskDensityCompact ? "p-3" : "p-4")}>
                          <div className={cn("text-zinc-500", isTaskDensityCompact ? "mb-1 text-xs" : "mb-2")}>节点数量</div>
                          <div className="text-zinc-100">{selectedTask.workflowSnapshot?.nodes?.length ?? selectedTask.workflow?.definition?.nodes?.length ?? 0}</div>
                        </div>
                        <div className={cn("rounded-lg border border-white/[0.05] bg-white/[0.02]", isTaskDensityCompact ? "p-3" : "p-4")}>
                          <div className={cn("text-zinc-500", isTaskDensityCompact ? "mb-1 text-xs" : "mb-2")}>执行事件数</div>
                          <div className="text-zinc-100">{executionEvents.length}</div>
                        </div>
                        <div className={cn("rounded-lg border border-white/[0.05] bg-white/[0.02]", isTaskDensityCompact ? "p-3" : "p-4")}>
                          <div className={cn("text-zinc-500", isTaskDensityCompact ? "mb-1 text-xs" : "mb-2")}>运行耗时</div>
                          <div className="text-zinc-100 font-mono">{formatDuration(selectedTask.startedAt, selectedTask.completedAt)}</div>
                        </div>
                        <div className={cn("rounded-lg border border-white/[0.05] bg-white/[0.02]", isTaskDensityCompact ? "p-3" : "p-4")}>
                          <div className={cn("text-zinc-500", isTaskDensityCompact ? "mb-1 text-xs" : "mb-2")}>持久化截图</div>
                          <div className="text-zinc-100">{screenshotEvents.length}</div>
                        </div>
                      </div>

                      <Tabs value={detailTab} onValueChange={setDetailTab} className="flex min-h-0 flex-1 flex-col">
                        <div className="sticky top-0 z-10 -mx-1 border-b border-white/[0.05] bg-zinc-950/90 px-1 pb-4 backdrop-blur-md">
                          <TabsList className="grid h-auto w-full grid-cols-5 bg-zinc-900/70">
                            <TabsTrigger value="charts" className="py-2">图表</TabsTrigger>
                            <TabsTrigger value="logs" className="py-2">日志</TabsTrigger>
                            <TabsTrigger value="screenshots" className="py-2">截图</TabsTrigger>
                            <TabsTrigger value="data" className="py-2">数据输出</TabsTrigger>
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

                        <TabsContent value="data" className="mt-0 min-h-0 flex-1 overflow-y-auto pr-1 pt-4">
                          <div className="space-y-6">
                            <div className="flex items-center justify-between gap-3">
                              <SectionTitle icon={<Database className="w-4 h-4 text-cyan-300" />} title="数据输出" />
                              {batchRowsResponse ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button variant="outline" size="sm" className="gap-2" onClick={() => void copyBatchRows()}>
                                    <Copy className="h-4 w-4" />
                                    复制结果
                                  </Button>
                                  <Button variant="outline" size="sm" className="gap-2" onClick={exportBatchRowsJson}>
                                    <Download className="h-4 w-4" />
                                    导出 JSON
                                  </Button>
                                  <Button variant="outline" size="sm" className="gap-2" onClick={exportBatchRowsCsv}>
                                    <Download className="h-4 w-4" />
                                    导出 CSV
                                  </Button>
                                </div>
                              ) : null}
                            </div>

                            {taskDataBatches.length === 0 ? (
                              <EmptyBlock text={isLoadingTaskData ? "正在加载任务数据输出..." : "这个任务还没有保存数据节点的写入结果。"} />
                            ) : (
                              <>
                                <div className="flex flex-wrap gap-3">
                                  {taskDataBatches.map((batch) => (
                                    <button
                                      key={batch.id}
                                      type="button"
                                      onClick={() => setSelectedBatchId(batch.id)}
                                      className={cn(
                                        "rounded-2xl border px-4 py-3 text-left transition-colors",
                                        selectedBatchId === batch.id
                                          ? "border-cyan-400/40 bg-cyan-500/10"
                                          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]",
                                      )}
                                    >
                                      <div className="text-sm font-medium text-zinc-100">{batch.collection?.name ?? batch.collectionId}</div>
                                      <div className="mt-1 text-[11px] text-zinc-500">{batch.collection?.key ?? batch.collectionId}</div>
                                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                                        <span>新增 {batch.insertedCount}</span>
                                        <span>更新 {batch.updatedCount}</span>
                                        <span>跳过 {batch.skippedCount}</span>
                                        <span>失败 {batch.failedCount}</span>
                                      </div>
                                    </button>
                                  ))}
                                </div>

                                {selectedBatch ? (
                                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                                    <CompactMetric label="总条数" value={selectedBatch.totalCount} />
                                    <CompactMetric label="新增" value={selectedBatch.insertedCount} colorClass="text-emerald-300" />
                                    <CompactMetric label="更新" value={selectedBatch.updatedCount} colorClass="text-sky-300" />
                                    <CompactMetric label="跳过" value={selectedBatch.skippedCount} colorClass="text-amber-300" />
                                    <CompactMetric label="失败" value={selectedBatch.failedCount} colorClass="text-red-300" />
                                  </div>
                                ) : null}

                                <div className="rounded-xl border border-white/[0.05] bg-white/[0.02]">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>记录键</TableHead>
                                        <TableHead>操作</TableHead>
                                        {(batchRowsResponse?.columns ?? []).map((column) => (
                                          <TableHead key={column}>{column}</TableHead>
                                        ))}
                                        <TableHead>错误</TableHead>
                                        <TableHead>时间</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {(batchRowsResponse?.items.length ?? 0) === 0 ? (
                                        <TableRow>
                                          <TableCell colSpan={(batchRowsResponse?.columns.length ?? 0) + 4} className="py-12 text-center text-zinc-500">
                                            {isLoadingTaskData ? "正在加载批次明细..." : "当前批次没有可展示的数据行。"}
                                          </TableCell>
                                        </TableRow>
                                      ) : null}

                                      {batchRowsResponse?.items.map((row) => (
                                        <TableRow key={row.id}>
                                          <TableCell className="font-mono text-xs text-zinc-200">{row.recordKey ?? "--"}</TableCell>
                                          <TableCell>{row.operation}</TableCell>
                                          {batchRowsResponse.columns.map((column) => (
                                            <TableCell key={`${row.id}-${column}`} className="max-w-[240px]">
                                              <div className="truncate" title={stringifyTableCellValue(row.dataJson?.[column])}>
                                                {stringifyTableCellValue(row.dataJson?.[column])}
                                              </div>
                                            </TableCell>
                                          ))}
                                          <TableCell className="max-w-[240px] text-xs text-red-300">
                                            <div className="truncate" title={row.errorMessage ?? ""}>
                                              {row.errorMessage ?? "--"}
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-xs text-zinc-500">{formatDateTime(row.createdAt)}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </>
                            )}
                          </div>
                        </TabsContent>

                        <TabsContent value="snapshot" className="mt-0 min-h-0 flex-1 overflow-y-auto pr-1 pt-4">
                          <div className="space-y-6">
                            <div>
                              <div className="flex items-center justify-between gap-3">
                                <SectionTitle icon={<FileSearch className="w-4 h-4 text-violet-400" />} title="提取结果" />
                                {extractEvents.length > 0 ? (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Button variant="outline" size="sm" className="gap-2" onClick={() => void copyAllExtractResults()}>
                                      <Copy className="h-4 w-4" />
                                      复制全部
                                    </Button>
                                    <Button variant="outline" size="sm" className="gap-2" onClick={exportAllExtractResults}>
                                      <Download className="h-4 w-4" />
                                      导出全部
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                              <div className="mt-4 space-y-3">
                                {extractEvents.length > 0 ? (
                                  extractEvents.map((event) => (
                                    <div key={event.id} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 space-y-2">
                                      <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                                        <span>{formatDateTime(event.createdAt)}</span>
                                        {event.nodeId && <span className="font-mono">{event.nodeId}</span>}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Button variant="outline" size="sm" className="gap-2" onClick={() => void copyExtractResult(event)}>
                                          <Copy className="h-4 w-4" />
                                          复制结果
                                        </Button>
                                        <Button variant="outline" size="sm" className="gap-2" onClick={() => exportExtractResult(event)}>
                                          <Download className="h-4 w-4" />
                                          导出结果
                                        </Button>
                                      </div>
                                      <div className="text-xs text-zinc-400">选择器：<span className="font-mono text-zinc-200">{getPayloadString(event.payload, "selector") || "--"}</span></div>
                                      <div className="text-xs text-zinc-400">属性：<span className="font-mono text-zinc-200">{getPayloadString(event.payload, "property") || "text"}</span></div>
                                      <div className="grid gap-2 text-xs text-zinc-400 md:grid-cols-2">
                                        <div>提取模式：<span className="font-mono text-zinc-200">{getExtractModeLabel(getPayloadString(event.payload, "targetMode"))}</span></div>
                                        <div>保存位置：<span className="font-mono text-zinc-200">{getExtractSaveTargetLabel(getPayloadString(event.payload, "saveTarget"))}</span></div>
                                        <div>保存键名：<span className="font-mono text-zinc-200">{getPayloadString(event.payload, "saveKey") || "--"}</span></div>
                                        <div>结果条数：<span className="font-mono text-zinc-200">{getPayloadNumber(event.payload, "itemCount")}</span></div>
                                        <div>结果格式：<span className="font-mono text-zinc-200">{getExtractResultFormatLabel(getPayloadString(event.payload, "resultFormat"))}</span></div>
                                      </div>
                                      <pre className="rounded-md bg-black/30 p-3 text-xs text-zinc-200 whitespace-pre-wrap break-all font-mono max-h-56 overflow-auto">{getExtractPayloadValue(event.payload) || "[空值]"}</pre>
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
            ) : (
              <AlertsPanel
                alerts={alerts}
                total={alertTotal}
                totalPages={alertTotalPages}
                page={alertPage}
                pageSize={alertPageSize}
                levelFilter={alertLevelFilter}
                isLoading={isLoadingAlerts}
                error={alertError}
                metrics={alertMetrics}
                onPageChange={setAlertPage}
                onLevelFilterChange={setAlertLevelFilter}
                onOpenTask={(taskId) => {
                  setActiveView("tasks");
                  setSelectedTaskId(taskId);
                }}
              />
            )}
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

function AlertsPanel({
  alerts,
  total,
  totalPages,
  page,
  pageSize,
  levelFilter,
  isLoading,
  error,
  metrics,
  onPageChange,
  onLevelFilterChange,
  onOpenTask,
}: {
  alerts: AlertRecord[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
  levelFilter: AlertRecord["level"] | "all";
  isLoading: boolean;
  error: string | null;
  metrics: { error: number; warning: number; success: number };
  onPageChange: (value: number | ((current: number) => number)) => void;
  onLevelFilterChange: (
    value:
      | AlertRecord["level"]
      | "all"
      | ((current: AlertRecord["level"] | "all") => AlertRecord["level"] | "all"),
  ) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const levelOptions = [
    {
      value: "all",
      label: "全部级别",
      description: "查看所有告警记录",
      icon: <Bell className="h-3.5 w-3.5" />,
      group: "告警筛选",
    },
    {
      value: "error",
      label: "错误",
      description: "仅显示错误级别",
      icon: <XCircle className="h-3.5 w-3.5" />,
      tone: "danger" as const,
      group: "告警筛选",
    },
    {
      value: "warning",
      label: "告警",
      description: "仅显示告警级别",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      group: "告警筛选",
    },
    {
      value: "success",
      label: "成功",
      description: "仅显示成功通知",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      group: "告警筛选",
    },
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-white/[0.05] bg-zinc-950/50 p-4 backdrop-blur-md">
          <div className="mb-2 text-sm text-zinc-400">告警总数</div>
          <div className="text-3xl font-bold text-zinc-100">{total}</div>
        </div>
        <div className="rounded-xl border border-white/[0.05] bg-zinc-950/50 p-4 backdrop-blur-md">
          <div className="mb-2 text-sm text-zinc-400">当前页错误</div>
          <div className="text-3xl font-bold text-red-400">{metrics.error}</div>
        </div>
        <div className="rounded-xl border border-white/[0.05] bg-zinc-950/50 p-4 backdrop-blur-md">
          <div className="mb-2 text-sm text-zinc-400">当前页告警</div>
          <div className="text-3xl font-bold text-amber-400">{metrics.warning}</div>
        </div>
        <div className="rounded-xl border border-white/[0.05] bg-zinc-950/50 p-4 backdrop-blur-md">
          <div className="mb-2 text-sm text-zinc-400">当前页成功</div>
          <div className="text-3xl font-bold text-emerald-400">{metrics.success}</div>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.05] bg-zinc-950/50 backdrop-blur-md overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-white/[0.05] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-100">告警事件</div>
            <div className="mt-1 text-xs text-zinc-500">
              {isLoading ? "正在同步..." : `第 ${page} / ${totalPages} 页 · 每页 ${pageSize} 条`}
            </div>
          </div>
          <div className="w-full max-w-[260px]">
            <Select
              value={levelFilter}
              onChange={(value) => onLevelFilterChange(value as AlertRecord["level"] | "all")}
              options={levelOptions}
            />
          </div>
        </div>

        {error ? <div className="border-b border-white/[0.05] px-5 py-4 text-sm text-red-300">{error}</div> : null}

        <div className="px-5 py-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>级别</TableHead>
                <TableHead>工作流</TableHead>
                <TableHead>触发来源</TableHead>
                <TableHead>告警内容</TableHead>
                <TableHead>任务详情</TableHead>
                <TableHead className="text-right">时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-zinc-500">
                    当前条件下还没有告警记录。
                  </TableCell>
                </TableRow>
              ) : null}

              {alerts.map((alert) => {
                const meta = getAlertMeta(alert.level);
                const Icon = meta.icon;

                return (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <div className={cn("inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium", meta.className)}>
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-zinc-200">
                      <div>{alert.workflowName}</div>
                      <div className="mt-1 font-mono text-[11px] text-zinc-500">{alert.workflowId}</div>
                    </TableCell>
                    <TableCell className="text-zinc-400">
                      {alert.triggerSource === "schedule" ? "定时触发" : "手动触发"}
                    </TableCell>
                    <TableCell className="text-zinc-300">
                      <div className="font-medium text-zinc-100">{alert.title}</div>
                      <div className="mt-1 text-zinc-400">{alert.message}</div>
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => onOpenTask(alert.taskId)}>
                        <Bell className="h-4 w-4" />
                        查看任务
                      </Button>
                    </TableCell>
                    <TableCell className="text-right text-zinc-500">{formatDateTime(alert.createdAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-white/[0.05] px-5 py-4">
          <div className="text-xs text-zinc-500">告警已经并入监控中心，任务详情和异常事件现在可以一处联动排查。</div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => onPageChange((value) => Math.max(1, value - 1))}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => onPageChange((value) => Math.min(totalPages, value + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
