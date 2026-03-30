import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { ReactFlowProvider } from "@xyflow/react";
import { io, Socket } from "socket.io-client";
import { Save, Settings } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Sidebar } from "@/src/components/Sidebar";
import { Header } from "@/src/components/Header";
import { WorkflowCanvas } from "@/src/components/WorkflowCanvas";
import { ExecutionPanel } from "@/src/components/ExecutionPanel";
import { LogEntry } from "@/src/components/LogPanel";
import { NodeConfigPanel } from "@/src/components/NodeConfigPanel";
import { NodePalette } from "@/src/components/NodePalette";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/src/components/ui/Dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/Tabs";
import { Switch } from "@/src/components/ui/Switch";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import {
  buildWorkflowDefinition,
  cancelTask,
  CanvasNodeData,
  createEmptyCanvasGraph,
  createWorkflow,
  ExecutionNodeStatus,
  getWorkflow,
  getWsBaseUrl,
  hydrateCanvasFromWorkflow,
  runTask,
  sanitizeCanvasEdges,
  sanitizeCanvasNodes,
  SanitizedCanvasEdge,
  SanitizedCanvasNode,
  TaskEvent,
  updateWorkflow,
  WORKFLOW_OPEN_BLANK_EVENT,
  WORKFLOW_SAVED_EVENT,
  WorkflowRecord,
} from "@/src/lib/cloudflow";

function toLogTimestamp(timestamp?: string) {
  if (!timestamp) {
    return new Date().toLocaleTimeString([], {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function buildIdleNodeStatuses(nodes: Array<Node<CanvasNodeData> | SanitizedCanvasNode>) {
  return nodes.reduce<Record<string, ExecutionNodeStatus>>((acc, node) => {
    acc[node.id] = "idle";
    return acc;
  }, {});
}

function getPrimaryPageUrl(nodes: Array<Node<CanvasNodeData> | SanitizedCanvasNode>) {
  const pageNode = nodes.find((node) => node.data.type === "open_page");
  return typeof pageNode?.data.url === "string" ? pageNode.data.url : "";
}

export default function Workspace() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workflowId = searchParams.get("workflowId");

  const [isRunning, setIsRunning] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isSavingWorkflow, setIsSavingWorkflow] = useState(false);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [flowNodes, setFlowNodes] = useState<SanitizedCanvasNode[]>([]);
  const [flowEdges, setFlowEdges] = useState<SanitizedCanvasEdge[]>([]);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, ExecutionNodeStatus>>({});
  const [workflowName, setWorkflowName] = useState("未命名工作流");
  const [workflowDescription, setWorkflowDescription] = useState("由前端画布编辑的工作流");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleCron, setScheduleCron] = useState("0 0 * * *");
  const [scheduleTimezone, setScheduleTimezone] = useState("Asia/Shanghai");
  const [alertEmail, setAlertEmail] = useState("");
  const [alertOnFailure, setAlertOnFailure] = useState(true);
  const [alertOnSuccess, setAlertOnSuccess] = useState(false);
  const [canvasVersion, setCanvasVersion] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const activeNodeIdRef = useRef<string | null>(null);
  const lastFlowSnapshotRef = useRef<string>("");

  const pageUrl = useMemo(() => getPrimaryPageUrl(flowNodes), [flowNodes]);
  const scheduleSummary = useMemo(() => {
    if (!scheduleEnabled) {
      return "未启用定时调度";
    }

    return `定时调度已启用 · ${scheduleCron || "--"} · ${scheduleTimezone || "Asia/Shanghai"}`;
  }, [scheduleCron, scheduleEnabled, scheduleTimezone]);
  const alertSummary = useMemo(() => {
    const flags = [
      alertOnFailure ? "失败" : "",
      alertOnSuccess ? "成功" : "",
    ].filter(Boolean);

    if (!alertEmail || flags.length === 0) {
      return "未启用邮件告警";
    }

    return `邮件告警已启用 · ${flags.join(" / ")} · ${alertEmail}`;
  }, [alertEmail, alertOnFailure, alertOnSuccess]);

  const resetCanvasWithWorkflow = useCallback((workflow?: WorkflowRecord | null) => {
    const graph = workflow ? hydrateCanvasFromWorkflow(workflow.definition) : createEmptyCanvasGraph();
    const snapshot = JSON.stringify({
      nodes: graph.nodes,
      edges: graph.edges,
    });

    setWorkflowName(workflow?.name ?? "未命名工作流");
    setWorkflowDescription(workflow?.description ?? "由前端画布编辑的工作流");
    setScheduleEnabled(workflow?.scheduleEnabled ?? false);
    setScheduleCron(workflow?.scheduleCron ?? "0 0 * * *");
    setScheduleTimezone(workflow?.scheduleTimezone ?? "Asia/Shanghai");
    setAlertEmail(workflow?.alertEmail ?? "");
    setAlertOnFailure(workflow?.alertOnFailure ?? true);
    setAlertOnSuccess(workflow?.alertOnSuccess ?? false);
    setFlowNodes(graph.nodes);
    setFlowEdges(graph.edges);
    setNodeStatuses(buildIdleNodeStatuses(graph.nodes));
    setSelectedNodeId(null);
    activeNodeIdRef.current = null;
    lastFlowSnapshotRef.current = snapshot;
    setCanvasVersion((value) => value + 1);
  }, []);

  const addLog = useCallback(
    (
      level: LogEntry["level"],
      message: string,
      options?: {
        timestamp?: string;
        nodeId?: string;
      },
    ) => {
      setLogs((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: toLogTimestamp(options?.timestamp),
          level,
          message,
        },
      ]);

      if (options?.nodeId) {
        setNodeStatuses((prev) => {
          const next = { ...prev };
          const previousNodeId = activeNodeIdRef.current;

          if (previousNodeId && previousNodeId !== options.nodeId && next[previousNodeId] === "running") {
            next[previousNodeId] = "success";
          }

          next[options.nodeId] = "running";
          activeNodeIdRef.current = options.nodeId;
          return next;
        });
      }
    },
    [],
  );

  const persistWorkflow = useCallback(
    async (options?: { silent?: boolean }) => {
      const definition = buildWorkflowDefinition(flowNodes, flowEdges);
      const payload = {
        name: workflowName.trim() || "未命名工作流",
        description: workflowDescription.trim() || "由前端画布编辑的工作流",
        definition,
        schedule: {
          enabled: scheduleEnabled,
          cron: scheduleEnabled ? scheduleCron.trim() : undefined,
          timezone: scheduleEnabled ? scheduleTimezone : undefined,
        },
        alerts: {
          email: alertEmail.trim() || undefined,
          onFailure: alertOnFailure,
          onSuccess: alertOnSuccess,
        },
      };

      setIsSavingWorkflow(true);

      try {
        const workflow = workflowId
          ? await updateWorkflow(workflowId, payload)
          : await createWorkflow(payload);

        if (!workflowId) {
          navigate(`/?workflowId=${workflow.id}`, { replace: true });
        }

        window.dispatchEvent(new CustomEvent(WORKFLOW_SAVED_EVENT, { detail: workflow }));

        if (!options?.silent) {
          addLog("success", `工作流“${workflow.name}”已保存。`);
        }

        return workflow;
      } catch (error) {
        addLog("error", error instanceof Error ? error.message : "保存工作流失败。");
        throw error;
      } finally {
        setIsSavingWorkflow(false);
      }
    },
    [
      addLog,
      flowEdges,
      flowNodes,
      navigate,
      alertEmail,
      alertOnFailure,
      alertOnSuccess,
      scheduleCron,
      scheduleEnabled,
      scheduleTimezone,
      workflowDescription,
      workflowId,
      workflowName,
    ],
  );

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(`${getWsBaseUrl()}/tasks`, {
        transports: ["websocket"],
      });
    }

    const socket = socketRef.current;

    socket.on("task:event", (event: TaskEvent) => {
      if (event.type === "log") {
        const payload = event.data as Extract<TaskEvent["data"], { message: string }>;
        addLog(payload.level, payload.message, {
          timestamp: payload.timestamp,
          nodeId: payload.nodeId,
        });
        return;
      }

      if (event.type === "screenshot") {
        const payload = event.data as Extract<TaskEvent["data"], { imageBase64: string }>;
        setScreenshot(payload.imageBase64);
        return;
      }

      if (event.type === "status") {
        const payload = event.data as Extract<
          TaskEvent["data"],
          { status: "pending" | "running" | "success" | "failed" | "cancelled" }
        >;

        if (payload.status === "running") {
          setIsRunning(true);
          setIsCancelling(false);
          return;
        }

        if (payload.status === "success") {
          const activeNodeId = activeNodeIdRef.current;
          if (activeNodeId) {
            setNodeStatuses((prev) => ({
              ...prev,
              [activeNodeId]: "success",
            }));
          }
          setIsRunning(false);
          setIsCancelling(false);
          activeNodeIdRef.current = null;
          return;
        }

        if (payload.status === "failed") {
          const activeNodeId = activeNodeIdRef.current;
          if (activeNodeId) {
            setNodeStatuses((prev) => ({
              ...prev,
              [activeNodeId]: "error",
            }));
          }
          setIsRunning(false);
          setIsCancelling(false);
          activeNodeIdRef.current = null;

          if (payload.errorMessage) {
            addLog("error", payload.errorMessage, {
              timestamp: payload.timestamp,
            });
          }
          return;
        }

        if (payload.status === "cancelled") {
          const activeNodeId = activeNodeIdRef.current;
          if (activeNodeId) {
            setNodeStatuses((prev) => ({
              ...prev,
              [activeNodeId]: "cancelled",
            }));
          }
          setIsRunning(false);
          setIsCancelling(false);
          activeNodeIdRef.current = null;
        }
      }
    });

    socket.on("connect_error", () => {
      addLog("error", "WebSocket 连接失败，请确认后端服务已经启动。");
    });

    return () => {
      socket.off("task:event");
      socket.off("connect_error");
    };
  }, [addLog]);

  useEffect(() => {
    if (taskId) {
      socketRef.current?.emit("task:subscribe", { taskId });

      return () => {
        socketRef.current?.emit("task:unsubscribe", { taskId });
      };
    }
  }, [taskId]);

  useEffect(() => {
    const loadWorkflow = async () => {
      setIsLoadingWorkflow(true);

      try {
        if (!workflowId) {
          resetCanvasWithWorkflow(null);
          return;
        }

        const workflow = await getWorkflow(workflowId);
        resetCanvasWithWorkflow(workflow);
      } catch (error) {
        addLog("error", error instanceof Error ? error.message : "读取工作流失败。");
        resetCanvasWithWorkflow(null);
      } finally {
        setIsLoadingWorkflow(false);
      }
    };

    void loadWorkflow();
  }, [addLog, resetCanvasWithWorkflow, workflowId]);

  useEffect(() => {
    const handleOpenBlankWorkflow = () => {
      setLogs([]);
      setScreenshot(null);
      setTaskId(null);
      setIsRunning(false);
      setIsCancelling(false);
      setIsLoadingWorkflow(false);
      resetCanvasWithWorkflow(null);
    };

    window.addEventListener(WORKFLOW_OPEN_BLANK_EVENT, handleOpenBlankWorkflow);
    return () => window.removeEventListener(WORKFLOW_OPEN_BLANK_EVENT, handleOpenBlankWorkflow);
  }, [resetCanvasWithWorkflow]);

  useEffect(() => {
    setNodeStatuses((prev) => {
      const next = { ...prev };

      for (const node of flowNodes) {
        if (!(node.id in next)) {
          next[node.id] = "idle";
        }
      }

      for (const nodeId of Object.keys(next)) {
        if (!flowNodes.some((node) => node.id === nodeId)) {
          delete next[nodeId];
        }
      }

      return next;
    });
  }, [flowNodes]);

  const toggleRun = useCallback(async () => {
    if (isRunning) {
      if (!taskId) {
        addLog("warn", "当前任务还没有拿到 taskId，暂时无法停止。");
        return;
      }

      if (isCancelling) {
        return;
      }

      try {
        setIsCancelling(true);
        await cancelTask(taskId);
        addLog("warn", `已发送任务 ${taskId} 的停止请求，等待 Worker 安全退出...`);
      } catch (error) {
        setIsCancelling(false);
        addLog("error", error instanceof Error ? error.message : "停止任务时发生未知错误。");
      }
      return;
    }

    if (flowNodes.length === 0) {
      addLog("error", "当前画布为空，无法执行工作流。");
      return;
    }

    setSelectedNodeId(null);
    setLogs([]);
    setScreenshot(null);
    setTaskId(null);
    setIsCancelling(false);
    activeNodeIdRef.current = null;
    setNodeStatuses(buildIdleNodeStatuses(flowNodes));

    try {
      const workflow = await persistWorkflow({ silent: true });
      addLog("info", "工作流已保存，正在创建执行任务...");

      const task = await runTask(workflow.id);
      setTaskId(task.id);
      setIsRunning(true);
      addLog("info", `任务 ${task.id} 已入队，等待 Worker 执行...`);
    } catch (error) {
      setIsRunning(false);
      setIsCancelling(false);
      addLog("error", error instanceof Error ? error.message : "执行任务时发生未知错误。");
    }
  }, [addLog, flowNodes, isCancelling, isRunning, persistWorkflow, taskId]);

  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-50 flex overflow-hidden font-sans selection:bg-sky-500/30">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-[#09090b] relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-900/10 via-transparent to-transparent pointer-events-none" />

        <div className="flex items-center justify-between border-b border-white/[0.05] bg-zinc-950/50 backdrop-blur-md px-6 z-10">
          <Header isRunning={isRunning} isCancelling={isCancelling} onToggleRun={toggleRun} />
          <div className="ml-4 flex items-center gap-3">
            <Input
              value={workflowName}
              onChange={(event) => setWorkflowName(event.target.value)}
              className="h-8 w-56"
              placeholder="输入工作流名称"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void persistWorkflow().catch(() => undefined);
              }}
              disabled={isSavingWorkflow || isLoadingWorkflow}
              className="h-8 gap-2"
            >
              <Save className="w-3.5 h-3.5" />
              {isSavingWorkflow ? "保存中..." : "保存"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="h-8 gap-2">
              <Settings className="w-3.5 h-3.5" />
              全局配置
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-2 border-b border-white/[0.04] bg-zinc-950/30 z-10">
          <div className="text-xs text-zinc-500">
            {workflowId ? `当前工作流 ID: ${workflowId}` : "当前为未保存工作流"}
          </div>
          <div className="text-xs text-zinc-500">
            {isLoadingWorkflow ? "正在加载工作流..." : `${workflowDescription} · ${scheduleSummary} · ${alertSummary}`}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden relative">
          <ReactFlowProvider>
            <NodePalette />

            <WorkflowCanvas
              key={`${workflowId ?? "draft"}-${canvasVersion}`}
              isRunning={isRunning}
              nodeStatuses={nodeStatuses}
              initialNodes={flowNodes}
              initialEdges={flowEdges}
              onWorkflowChange={({ nodes, edges }) => {
                const sanitizedNodes = sanitizeCanvasNodes(nodes);
                const sanitizedEdges = sanitizeCanvasEdges(edges);
                const snapshot = JSON.stringify({
                  nodes: sanitizedNodes,
                  edges: sanitizedEdges,
                });

                if (snapshot === lastFlowSnapshotRef.current) {
                  return;
                }

                lastFlowSnapshotRef.current = snapshot;
                setFlowNodes(sanitizedNodes);
                setFlowEdges(sanitizedEdges);
              }}
              onNodeSelect={(id) => {
                if (!isRunning) {
                  setSelectedNodeId(id);
                }
              }}
            />

            <div className="h-full z-10 flex border-l border-white/[0.05]">
              {selectedNodeId && !isRunning ? (
                <NodeConfigPanel nodeId={selectedNodeId} onClose={() => setSelectedNodeId(null)} />
              ) : (
                <ExecutionPanel
                  isRunning={isRunning}
                  logs={logs}
                  screenshot={screenshot}
                  taskId={taskId}
                  pageUrl={pageUrl}
                  onClearLogs={() => setLogs([])}
                />
              )}
            </div>
          </ReactFlowProvider>
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogHeader>
          <DialogTitle>工作流全局配置</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <Tabs defaultValue="schedule">
            <TabsList className="w-full grid grid-cols-2 mb-6">
              <TabsTrigger value="schedule">调度执行</TabsTrigger>
              <TabsTrigger value="alerts">告警规则</TabsTrigger>
            </TabsList>

            <TabsContent value="schedule" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-zinc-200">启用定时调度</div>
                  <div className="text-xs text-zinc-500">按设定的时间周期自动运行此工作流</div>
                </div>
                <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Cron 表达式</label>
                <Input
                  value={scheduleCron}
                  onChange={(event) => setScheduleCron(event.target.value)}
                  className="font-mono text-sm"
                  placeholder="例如：0 0 * * *"
                  disabled={!scheduleEnabled}
                />
                <p className="text-xs text-zinc-500">支持标准 Cron 表达式，例如 `0 0 * * *` 表示每天凌晨 00:00。</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">时区</label>
                <select
                  value={scheduleTimezone}
                  onChange={(event) => setScheduleTimezone(event.target.value)}
                  disabled={!scheduleEnabled}
                  className="flex h-10 w-full rounded-md border border-white/[0.06] bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
                >
                  <option value="Asia/Shanghai" className="bg-zinc-800 text-zinc-200">
                    Asia/Shanghai (UTC+8)
                  </option>
                  <option value="UTC" className="bg-zinc-800 text-zinc-200">
                    UTC
                  </option>
                  <option value="Asia/Tokyo" className="bg-zinc-800 text-zinc-200">
                    Asia/Tokyo (UTC+9)
                  </option>
                  <option value="America/New_York" className="bg-zinc-800 text-zinc-200">
                    America/New_York (UTC-4/-5)
                  </option>
                </select>
              </div>
            </TabsContent>

            <TabsContent value="alerts" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-zinc-200">执行失败</div>
                  <div className="text-xs text-zinc-500">节点报错或超时</div>
                </div>
                <Switch checked={alertOnFailure} onCheckedChange={setAlertOnFailure} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-zinc-200">执行成功</div>
                  <div className="text-xs text-zinc-500">工作流完整运行结束</div>
                </div>
                <Switch checked={alertOnSuccess} onCheckedChange={setAlertOnSuccess} />
              </div>
              <div className="pt-4 border-t border-white/[0.05] space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">通知邮箱</label>
                  <Input
                    value={alertEmail}
                    onChange={(event) => setAlertEmail(event.target.value)}
                    placeholder="admin@example.com"
                  />
                  <p className="text-xs text-zinc-500">当前版本仅支持邮件通知。请在后端环境变量中配置 SMTP 参数后使用。</p>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-8 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setSettingsOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-sky-600 hover:bg-sky-700 text-white border-transparent"
              onClick={async () => {
                try {
                  await persistWorkflow();
                  setSettingsOpen(false);
                } catch {
                  // persistWorkflow already surfaces errors in the log panel.
                }
              }}
            >
              {isSavingWorkflow ? "保存中..." : "保存配置"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
