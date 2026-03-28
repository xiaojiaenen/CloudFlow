import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { ReactFlowProvider } from "@xyflow/react";
import { io, Socket } from "socket.io-client";
import { Settings } from "lucide-react";
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
  CanvasNodeData,
  createWorkflow,
  ExecutionNodeStatus,
  getWsBaseUrl,
  runTask,
  TaskEvent,
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

function buildIdleNodeStatuses(nodes: Node<CanvasNodeData>[]) {
  return nodes.reduce<Record<string, ExecutionNodeStatus>>((acc, node) => {
    acc[node.id] = "idle";
    return acc;
  }, {});
}

function getPrimaryPageUrl(nodes: Node<CanvasNodeData>[]) {
  const pageNode = nodes.find((node) => node.data.type === "open_page");
  return typeof pageNode?.data.url === "string" ? pageNode.data.url : "";
}

export default function Workspace() {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [flowNodes, setFlowNodes] = useState<Node<CanvasNodeData>[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, ExecutionNodeStatus>>({});

  const socketRef = useRef<Socket | null>(null);
  const activeNodeIdRef = useRef<string | null>(null);

  const pageUrl = useMemo(() => getPrimaryPageUrl(flowNodes), [flowNodes]);

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

  useEffect(() => {
    const socket = io(`${getWsBaseUrl()}/tasks`, {
      transports: ["websocket"],
    });

    socketRef.current = socket;

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
        const payload = event.data as Extract<TaskEvent["data"], { status: "pending" | "running" | "success" | "failed" }>;

        if (payload.status === "running") {
          setIsRunning(true);
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
          activeNodeIdRef.current = null;

          if (payload.errorMessage) {
            addLog("error", payload.errorMessage, {
              timestamp: payload.timestamp,
            });
          }
        }
      }
    });

    socket.on("connect_error", () => {
      addLog("error", "WebSocket 连接失败，请确认后端服务已经启动。");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
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
    if (!isRunning) {
      setNodeStatuses(buildIdleNodeStatuses(flowNodes));
    }
  }, [flowNodes, isRunning]);

  const toggleRun = useCallback(async () => {
    if (isRunning) {
      addLog("warn", "当前版本暂不支持中止已投递任务，请等待任务完成。");
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
    activeNodeIdRef.current = null;
    setNodeStatuses(buildIdleNodeStatuses(flowNodes));

    try {
      const definition = buildWorkflowDefinition(flowNodes, flowEdges);
      const workflow = await createWorkflow({
        name: `CloudFlow 工作流 ${new Date().toLocaleString()}`,
        description: "由前端画布自动生成并提交执行",
        definition,
      });

      addLog("info", "工作流已保存，正在创建执行任务...");

      const task = await runTask(workflow.id);
      setTaskId(task.id);
      setIsRunning(true);
      addLog("info", `任务 ${task.id} 已入队，等待 Worker 执行...`);
    } catch (error) {
      setIsRunning(false);
      addLog("error", error instanceof Error ? error.message : "执行任务时发生未知错误。");
    }
  }, [addLog, flowEdges, flowNodes, isRunning]);

  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-50 flex overflow-hidden font-sans selection:bg-sky-500/30">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-[#09090b] relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-900/10 via-transparent to-transparent pointer-events-none"></div>

        <div className="flex items-center justify-between border-b border-white/[0.05] bg-zinc-950/50 backdrop-blur-md px-6 z-10">
          <Header isRunning={isRunning} onToggleRun={toggleRun} />
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="ml-4 h-8 gap-2">
            <Settings className="w-3.5 h-3.5" />
            全局配置
          </Button>
        </div>

        <div className="flex-1 flex overflow-hidden relative">
          <ReactFlowProvider>
            <NodePalette />

            <WorkflowCanvas
              isRunning={isRunning}
              nodeStatuses={nodeStatuses}
              onWorkflowChange={({ nodes, edges }) => {
                setFlowNodes(nodes);
                setFlowEdges(edges);
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
                <Switch checked={true} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Cron 表达式</label>
                <Input defaultValue="0 0 * * *" className="font-mono text-sm" />
                <p className="text-xs text-zinc-500">每天凌晨 00:00 执行</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">时区</label>
                <select className="flex h-10 w-full rounded-md border border-white/[0.06] bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-500">
                  <option value="Asia/Shanghai" className="bg-zinc-800 text-zinc-200">Asia/Shanghai (UTC+8)</option>
                  <option value="UTC" className="bg-zinc-800 text-zinc-200">UTC</option>
                </select>
              </div>
            </TabsContent>

            <TabsContent value="alerts" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-zinc-200">执行失败 (Error)</div>
                  <div className="text-xs text-zinc-500">节点报错或超时</div>
                </div>
                <Switch checked={true} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-zinc-200">执行成功 (Success)</div>
                  <div className="text-xs text-zinc-500">工作流完整运行结束</div>
                </div>
                <Switch checked={false} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-zinc-200">执行超时 (Timeout)</div>
                  <div className="text-xs text-zinc-500">运行时间超过设定阈值</div>
                </div>
                <Switch checked={true} />
              </div>
              <div className="pt-4 border-t border-white/[0.05] space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">通知邮箱</label>
                  <Input placeholder="admin@example.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Webhook URL (可选)</label>
                  <Input placeholder="https://..." />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-8 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setSettingsOpen(false)}>取消</Button>
            <Button className="bg-sky-600 hover:bg-sky-700 text-white border-transparent" onClick={() => setSettingsOpen(false)}>保存配置</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
