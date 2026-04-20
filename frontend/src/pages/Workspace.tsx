import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { ReactFlowProvider } from "@xyflow/react";
import { io, Socket } from "socket.io-client";
import { ArrowRight, Save, Settings, UploadCloud, Video } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Sidebar } from "@/src/components/Sidebar";
import { Header } from "@/src/components/Header";
import { WorkflowCanvas } from "@/src/components/WorkflowCanvas";
import { ExecutionPanel } from "@/src/components/ExecutionPanel";
import { LogEntry } from "@/src/components/LogPanel";
import { NodeConfigPanel } from "@/src/components/NodeConfigPanel";
import { NodePalette } from "@/src/components/NodePalette";
import { RecorderDialog } from "@/src/components/RecorderDialog";
import { RunWorkflowDialog } from "@/src/components/RunWorkflowDialog";
import { WorkflowInputsDesigner } from "@/src/components/WorkflowInputsDesigner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/src/components/ui/Dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/Tabs";
import { Switch } from "@/src/components/ui/Switch";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { useAuth } from "@/src/context/AuthContext";
import { cn } from "@/src/lib/utils";
import {
  buildWorkflowDefinition,
  cancelTask,
  CanvasNodeData,
  formatWorkflowBuildErrorMessage,
  getTaskExecutionScreenshotSrc,
  createEmptyCanvasGraph,
  createWorkflow,
  CredentialRecord,
  ExecutionNodeStatus,
  getAuthToken,
  getTask,
  getWorkflow,
  getWsBaseUrl,
  hydrateCanvasFromWorkflow,
  listCredentials,
  listTasks,
  publishWorkflowTemplate,
  runTask,
  sanitizeCanvasEdges,
  sanitizeCanvasNodes,
  SanitizedCanvasEdge,
  SanitizedCanvasNode,
  TaskEvent,
  TaskExecutionRecord,
  updateWorkflow,
  validateWorkflowSchema,
  WorkflowCredentialRequirement,
  WorkflowInputField,
  WorkflowRecord,
  WorkflowTemplateRecord,
  WorkflowRuntimeContext,
  WorkflowStatus,
  WorkflowOwnerSummary,
  WORKFLOW_OPEN_BLANK_EVENT,
  WORKFLOW_SAVED_EVENT,
} from "@/src/lib/cloudflow";

type ScreenshotBinaryPayload =
  | ArrayBuffer
  | Uint8Array
  | Blob
  | {
      type: "Buffer";
      data: number[];
    };

type ScreenshotTaskEventPayload = Extract<TaskEvent["data"], { mimeType: string; timestamp: string }>;

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

function buildRestoredLogs(events: TaskExecutionRecord[]): LogEntry[] {
  return events
    .filter((event) => event.type === "log" && event.message)
    .map((event) => ({
      id: event.id,
      timestamp: toLogTimestamp(event.createdAt),
      level: (event.level ?? "info") as LogEntry["level"],
      message: event.message ?? "",
    }));
}

function getLatestPersistedScreenshot(taskId: string, events: TaskExecutionRecord[]) {
  const screenshots = events.filter((event) => event.type === "screenshot");
  return screenshots.length > 0
    ? getTaskExecutionScreenshotSrc(taskId, screenshots[screenshots.length - 1])
    : null;
}

function normalizeSelectInputValue(field: WorkflowInputField, value?: string) {
  if (field.type !== "select") {
    return value ?? "";
  }

  if (!value) {
    return "";
  }

  return field.options?.some((option) => option.value === value) ? value : "";
}

function buildInitialRunValues(schema: WorkflowInputField[]) {
  return schema.reduce<Record<string, string>>((acc, field) => {
    acc[field.key] = normalizeSelectInputValue(field, field.defaultValue);
    return acc;
  }, {});
}

function maskValue(value: string) {
  if (!value) {
    return "";
  }

  if (value.length <= 4) {
    return "*".repeat(value.length);
  }

  return `${"*".repeat(Math.max(4, value.length - 2))}${value.slice(-2)}`;
}

function buildRuntimePreview(
  schema: WorkflowInputField[],
  values: Record<string, string>,
  credentialRequirements: WorkflowCredentialRequirement[] = [],
  credentialBindings: Record<string, string> = {},
  credentials: CredentialRecord[] = [],
): WorkflowRuntimeContext {
  const inputs: Record<string, string> = {};
  const maskedInputs: Record<string, string> = {};
  const credentialMap = new Map(credentials.map((credential) => [credential.id, credential]));
  const maskedCredentials: NonNullable<WorkflowRuntimeContext["maskedCredentials"]> = {};
  const credentialMetadata: NonNullable<WorkflowRuntimeContext["credentialMetadata"]> = {};

  for (const field of schema) {
    const value = values[field.key] ?? field.defaultValue ?? "";
    inputs[field.key] = value;
    maskedInputs[field.key] = field.sensitive
      ? value
        ? maskValue(value)
        : ""
      : value;
  }

  for (const requirement of credentialRequirements) {
    const bindingId = credentialBindings[requirement.key];
    if (!bindingId) {
      continue;
    }

    const credential = credentialMap.get(bindingId);
    if (!credential) {
      continue;
    }

    const normalizedPayload = Object.entries(credential.payload ?? {}).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        acc[key] = value === null || value === undefined ? "" : String(value);
        return acc;
      },
      {},
    );

    maskedCredentials[requirement.key] = Object.entries(normalizedPayload).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        acc[key] = maskValue(value);
        return acc;
      },
      {},
    );
    credentialMetadata[requirement.key] = {
      credentialId: credential.id,
      credentialName: credential.name,
      type: credential.type,
      provider: credential.provider ?? undefined,
    };
  }

  return {
    inputs,
    maskedInputs,
    credentialBindings,
    maskedCredentials,
    credentialMetadata,
  };
}

function buildWorkflowDraftSnapshot(params: {
  name: string;
  description: string;
  status: WorkflowStatus;
  scheduleEnabled: boolean;
  scheduleCron: string;
  scheduleTimezone: string;
  alertEmail: string;
  alertOnFailure: boolean;
  alertOnSuccess: boolean;
  inputSchema: WorkflowInputField[];
  credentialRequirements: WorkflowCredentialRequirement[];
  flowNodes: SanitizedCanvasNode[];
  flowEdges: SanitizedCanvasEdge[];
}) {
  return JSON.stringify({
    name: params.name.trim(),
    description: params.description.trim(),
    status: params.status,
    scheduleEnabled: params.scheduleEnabled,
    scheduleCron: params.scheduleCron.trim(),
    scheduleTimezone: params.scheduleTimezone,
    alertEmail: params.alertEmail.trim(),
    alertOnFailure: params.alertOnFailure,
    alertOnSuccess: params.alertOnSuccess,
    inputSchema: params.inputSchema,
    credentialRequirements: params.credentialRequirements,
    flowNodes: params.flowNodes,
    flowEdges: params.flowEdges,
  });
}

function formatWorkflowOwner(owner?: WorkflowOwnerSummary | null) {
  if (!owner) {
    return "";
  }

  if (owner.name?.trim()) {
    return owner.name.trim();
  }

  return owner.email?.trim() ?? "";
}

function isWorkflowOwnedByCurrentUser(owner?: WorkflowOwnerSummary | null, userId?: string) {
  return Boolean(userId && owner?.id && owner.id === userId);
}

function normalizeScreenshotBinaryPayload(payload?: ScreenshotBinaryPayload | null) {
  if (!payload) {
    return null;
  }

  if (payload instanceof Blob) {
    return payload;
  }

  if (payload instanceof Uint8Array) {
    return payload;
  }

  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }

  if (
    typeof payload === "object" &&
    payload.type === "Buffer" &&
    Array.isArray(payload.data)
  ) {
    return new Uint8Array(payload.data);
  }

  return null;
}

export default function Workspace() {
  const { user } = useAuth();
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
  const [taskRuntimeContext, setTaskRuntimeContext] = useState<WorkflowRuntimeContext | null>(null);
  const [flowNodes, setFlowNodes] = useState<SanitizedCanvasNode[]>([]);
  const [flowEdges, setFlowEdges] = useState<SanitizedCanvasEdge[]>([]);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, ExecutionNodeStatus>>({});
  const [workflowName, setWorkflowName] = useState("未命名工作流");
  const [workflowDescription, setWorkflowDescription] = useState("由前端画布编辑的工作流");
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>("draft");
  const [workflowOwner, setWorkflowOwner] = useState<WorkflowOwnerSummary | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleCron, setScheduleCron] = useState("0 0 * * *");
  const [scheduleTimezone, setScheduleTimezone] = useState("Asia/Shanghai");
  const [alertEmail, setAlertEmail] = useState("");
  const [alertOnFailure, setAlertOnFailure] = useState(false);
  const [alertOnSuccess, setAlertOnSuccess] = useState(false);
  const [inputSchema, setInputSchema] = useState<WorkflowInputField[]>([]);
  const [credentialRequirements, setCredentialRequirements] = useState<WorkflowCredentialRequirement[]>([]);
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(false);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [isPublishingTemplate, setIsPublishingTemplate] = useState(false);
  const [publishedTemplate, setPublishedTemplate] = useState<WorkflowTemplateRecord | null>(null);
  const [recorderDialogOpen, setRecorderDialogOpen] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [pendingRunWorkflowId, setPendingRunWorkflowId] = useState<string | null>(null);
  const [runFormValues, setRunFormValues] = useState<Record<string, string>>({});
  const [runCredentialBindings, setRunCredentialBindings] = useState<Record<string, string>>({});
  const [publishForm, setPublishForm] = useState({
    slug: "",
    title: "",
    description: "",
    category: "浏览器自动化",
    tags: "",
  });

  const socketRef = useRef<Socket | null>(null);
  const activeNodeIdRef = useRef<string | null>(null);
  const lastFlowSnapshotRef = useRef<string>("");
  const persistedWorkflowSnapshotRef = useRef<string>("");
  const autoSaveTimerRef = useRef<number | null>(null);
  const autoSaveSnapshotRef = useRef<string | null>(null);
  const liveScreenshotUrlRef = useRef<string | null>(null);

  const revokeLiveScreenshotUrl = useCallback(() => {
    if (liveScreenshotUrlRef.current) {
      URL.revokeObjectURL(liveScreenshotUrlRef.current);
      liveScreenshotUrlRef.current = null;
    }
  }, []);

  const replaceScreenshot = useCallback(
    (nextScreenshot: string | null) => {
      revokeLiveScreenshotUrl();
      setScreenshot(nextScreenshot);
    },
    [revokeLiveScreenshotUrl],
  );

  const updateScreenshotFromTaskEvent = useCallback(
    (payload: ScreenshotTaskEventPayload) => {
      const binaryPayload = normalizeScreenshotBinaryPayload(
        "imageBuffer" in payload ? payload.imageBuffer : undefined,
      );

      if (binaryPayload instanceof Blob) {
        const blobUrl = URL.createObjectURL(binaryPayload);
        revokeLiveScreenshotUrl();
        liveScreenshotUrlRef.current = blobUrl;
        setScreenshot(blobUrl);
        return;
      }

      if (binaryPayload instanceof Uint8Array) {
        const blobUrl = URL.createObjectURL(
          new Blob([binaryPayload], {
            type: payload.mimeType || "image/jpeg",
          }),
        );
        revokeLiveScreenshotUrl();
        liveScreenshotUrlRef.current = blobUrl;
        setScreenshot(blobUrl);
        return;
      }

      if ("imageBase64" in payload && payload.imageBase64) {
        replaceScreenshot(`data:${payload.mimeType || "image/jpeg"};base64,${payload.imageBase64}`);
      }
    },
    [replaceScreenshot, revokeLiveScreenshotUrl],
  );

  const pageUrl = useMemo(() => getPrimaryPageUrl(flowNodes), [flowNodes]);
  const scheduleSummary = useMemo(() => {
    if (!scheduleEnabled) {
      return "未启用定时调度";
    }

    return `定时调度已启用 · ${scheduleCron || "--"} · ${scheduleTimezone || "Asia/Shanghai"}`;
  }, [scheduleCron, scheduleEnabled, scheduleTimezone]);
  const alertSummary = useMemo(() => {
    const flags = [alertOnFailure ? "失败" : "", alertOnSuccess ? "成功" : ""].filter(Boolean);

    if (!alertEmail || flags.length === 0) {
      return "未启用邮件告警";
    }

    return `邮件告警已启用 · ${flags.join(" / ")} · ${alertEmail}`;
  }, [alertEmail, alertOnFailure, alertOnSuccess]);
  const workflowStatusLabel = useMemo(() => {
    if (workflowStatus === "draft") {
      return "草稿";
    }

    if (workflowStatus === "archived") {
      return "已归档";
    }

    return "已发布";
  }, [workflowStatus]);
  const workflowOwnerLabel = useMemo(() => formatWorkflowOwner(workflowOwner), [workflowOwner]);
  const isOwnWorkflowForAdmin = useMemo(
    () => isWorkflowOwnedByCurrentUser(workflowOwner, user?.id),
    [workflowOwner, user?.id],
  );
  const canManagePublishedTemplate = useMemo(
    () =>
      !publishedTemplate ||
      Boolean(user?.isSuperAdmin || (publishedTemplate.publisherId && publishedTemplate.publisherId === user?.id)),
    [publishedTemplate, user?.id, user?.isSuperAdmin],
  );
  const workflowSchemaValidation = useMemo(
    () => validateWorkflowSchema(inputSchema, credentialRequirements),
    [credentialRequirements, inputSchema],
  );
  const parameterSummary = useMemo(
    () =>
      workflowSchemaValidation.hasErrors
        ? `参数 ${inputSchema.length} 项 · 凭据要求 ${credentialRequirements.length} 项 · 待修复 ${workflowSchemaValidation.totalIssues} 项`
        : `参数 ${inputSchema.length} 项 · 凭据要求 ${credentialRequirements.length} 项`,
    [
      credentialRequirements.length,
      inputSchema.length,
      workflowSchemaValidation.hasErrors,
      workflowSchemaValidation.totalIssues,
    ],
  );
  const workflowDraftSnapshot = useMemo(
    () =>
      buildWorkflowDraftSnapshot({
        name: workflowName,
        description: workflowDescription,
        status: workflowStatus,
        scheduleEnabled,
        scheduleCron,
        scheduleTimezone,
        alertEmail,
        alertOnFailure,
        alertOnSuccess,
        inputSchema,
        credentialRequirements,
        flowNodes,
        flowEdges,
      }),
    [
      alertEmail,
      alertOnFailure,
      alertOnSuccess,
      credentialRequirements,
      flowEdges,
      flowNodes,
      inputSchema,
      scheduleCron,
      scheduleEnabled,
      scheduleTimezone,
      workflowDescription,
      workflowName,
      workflowStatus,
    ],
  );
  const hasUnsavedWorkflowChanges = workflowDraftSnapshot !== persistedWorkflowSnapshotRef.current;
  const resetCanvasWithWorkflow = useCallback((workflow?: WorkflowRecord | null) => {
    const graph = workflow ? hydrateCanvasFromWorkflow(workflow.definition) : createEmptyCanvasGraph();
    const snapshot = JSON.stringify({
      nodes: graph.nodes,
      edges: graph.edges,
    });

    setWorkflowName(workflow?.name ?? "未命名工作流");
    setWorkflowDescription(workflow?.description ?? "由前端画布编辑的工作流");
    setWorkflowStatus(workflow?.status ?? "draft");
    setWorkflowOwner(workflow?.owner ?? null);
    setScheduleEnabled(workflow?.scheduleEnabled ?? false);
    setScheduleCron(workflow?.scheduleCron ?? "0 0 * * *");
    setScheduleTimezone(workflow?.scheduleTimezone ?? "Asia/Shanghai");
    setAlertEmail(workflow?.alertEmail ?? "");
    setAlertOnFailure(workflow?.alertOnFailure ?? false);
    setAlertOnSuccess(workflow?.alertOnSuccess ?? false);
    setInputSchema(workflow?.definition.inputSchema ?? []);
    setCredentialRequirements(workflow?.definition.credentialRequirements ?? []);
    setPublishedTemplate(workflow?.publishedTemplate ?? null);
    setRunFormValues(buildInitialRunValues(workflow?.definition.inputSchema ?? []));
    setRunCredentialBindings(workflow?.definition.runtime?.credentialBindings ?? {});
    setTaskRuntimeContext(workflow?.definition.runtime ?? null);
    setFlowNodes(graph.nodes);
    setFlowEdges(graph.edges);
    setNodeStatuses(buildIdleNodeStatuses(graph.nodes));
    setSelectedNodeId(null);
    activeNodeIdRef.current = null;
    lastFlowSnapshotRef.current = snapshot;
    autoSaveSnapshotRef.current = null;
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    persistedWorkflowSnapshotRef.current = buildWorkflowDraftSnapshot({
      name: workflow?.name ?? "未命名工作流",
      description: workflow?.description ?? "由前端画布编辑的工作流",
      status: workflow?.status ?? "draft",
      scheduleEnabled: workflow?.scheduleEnabled ?? false,
      scheduleCron: workflow?.scheduleCron ?? "0 0 * * *",
      scheduleTimezone: workflow?.scheduleTimezone ?? "Asia/Shanghai",
      alertEmail: workflow?.alertEmail ?? "",
      alertOnFailure: workflow?.alertOnFailure ?? false,
      alertOnSuccess: workflow?.alertOnSuccess ?? false,
      inputSchema: workflow?.definition.inputSchema ?? [],
      credentialRequirements: workflow?.definition.credentialRequirements ?? [],
      flowNodes: graph.nodes,
      flowEdges: graph.edges,
    });
    setCanvasVersion((value) => value + 1);
  }, []);

  const loadCredentials = useCallback(async () => {
    try {
      setIsLoadingCredentials(true);
      setCredentials(await listCredentials());
    } finally {
      setIsLoadingCredentials(false);
    }
  }, []);

  useEffect(() => {
    void loadCredentials().catch((error) => {
      console.error(error);
    });
  }, [loadCredentials]);

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

  const ensureWorkflowSchemaReady = useCallback(
    (purpose: "run" | "publish") => {
      if (!workflowSchemaValidation.hasErrors) {
        return true;
      }

      const actionLabel = purpose === "publish" ? "发布" : "运行";
      const detail = workflowSchemaValidation.messages.slice(0, 3).join("；");
      addLog(
        "error",
        `当前参数/凭据配置还有 ${workflowSchemaValidation.totalIssues} 个问题，请先修复后再${actionLabel}。${detail}${workflowSchemaValidation.messages.length > 3 ? "；..." : ""}`,
      );
      setSettingsOpen(true);
      return false;
    },
    [addLog, workflowSchemaValidation],
  );

  const persistWorkflow = useCallback(
    async (options?: { silent?: boolean; snapshot?: string }) => {
      const definition = buildWorkflowDefinition(flowNodes, flowEdges, {
        inputSchema,
        credentialRequirements,
      });
      const payload = {
        name: workflowName.trim() || "未命名工作流",
        description: workflowDescription.trim() || "由前端画布编辑的工作流",
        status: workflowStatus,
        definition,
        schedule: {
          enabled: workflowStatus === "archived" ? false : scheduleEnabled,
          cron: scheduleEnabled ? scheduleCron.trim() : undefined,
          timezone: scheduleEnabled ? scheduleTimezone : undefined,
        },
        alerts: {
          email: alertEmail.trim() || undefined,
          onFailure: alertOnFailure,
          onSuccess: alertOnSuccess,
        },
      };

      const snapshotToPersist = options?.snapshot ?? workflowDraftSnapshot;

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

        persistedWorkflowSnapshotRef.current = snapshotToPersist;
        if (autoSaveSnapshotRef.current === snapshotToPersist) {
          autoSaveSnapshotRef.current = null;
        }

        return workflow;
      } catch (error) {
        if (autoSaveSnapshotRef.current === snapshotToPersist) {
          autoSaveSnapshotRef.current = null;
        }
        addLog("error", formatWorkflowBuildErrorMessage(error));
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
      workflowStatus,
      workflowDescription,
      workflowId,
      workflowName,
      inputSchema,
      credentialRequirements,
      workflowDraftSnapshot,
    ],
  );

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(`${getWsBaseUrl()}/tasks`, {
        transports: ["websocket"],
        auth: {
          token: getAuthToken(),
        },
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
        const payload = event.data as ScreenshotTaskEventPayload;
        updateScreenshotFromTaskEvent(payload);
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
  }, [addLog, updateScreenshotFromTaskEvent]);

  useEffect(() => () => revokeLiveScreenshotUrl(), [revokeLiveScreenshotUrl]);

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
      setTaskId(null);
      setIsRunning(false);
      setIsCancelling(false);
      setRunDialogOpen(false);
      setPendingRunWorkflowId(null);
      setLogs([]);
      replaceScreenshot(null);
      setTaskRuntimeContext(null);
      setRunCredentialBindings({});

      try {
        if (!workflowId) {
          resetCanvasWithWorkflow(null);
          return;
        }

        const workflow = await getWorkflow(workflowId);
        resetCanvasWithWorkflow(workflow);

        const runningTasks = await listTasks({
          page: 1,
          pageSize: 1,
          workflowId,
          activeOnly: true,
        });

        const activeTask = runningTasks.items[0];

        if (activeTask) {
          const taskDetail = await getTask(activeTask.id);
          setTaskId(taskDetail.id);
          setIsRunning(true);
          setIsCancelling(Boolean(taskDetail.cancelRequestedAt));
          setLogs(buildRestoredLogs(taskDetail.executionEvents ?? []));
          replaceScreenshot(getLatestPersistedScreenshot(taskDetail.id, taskDetail.executionEvents ?? []));
          setTaskRuntimeContext(taskDetail.workflowSnapshot?.runtime ?? null);
          setRunCredentialBindings(taskDetail.workflowSnapshot?.runtime?.credentialBindings ?? {});
        }
      } catch (error) {
        addLog("error", error instanceof Error ? error.message : "读取工作流失败。");
        setTaskId(null);
        setIsRunning(false);
        setIsCancelling(false);
        setTaskRuntimeContext(null);
        setRunCredentialBindings({});
        resetCanvasWithWorkflow(null);
      } finally {
        setIsLoadingWorkflow(false);
      }
    };

    void loadWorkflow();
  }, [addLog, replaceScreenshot, resetCanvasWithWorkflow, workflowId]);

  useEffect(() => {
    const handleOpenBlankWorkflow = () => {
      setLogs([]);
      replaceScreenshot(null);
      setTaskId(null);
      setIsRunning(false);
      setIsCancelling(false);
      setRunDialogOpen(false);
      setPendingRunWorkflowId(null);
      setIsLoadingWorkflow(false);
      setTaskRuntimeContext(null);
      setRunCredentialBindings({});
      resetCanvasWithWorkflow(null);
    };

    window.addEventListener(WORKFLOW_OPEN_BLANK_EVENT, handleOpenBlankWorkflow);
    return () => window.removeEventListener(WORKFLOW_OPEN_BLANK_EVENT, handleOpenBlankWorkflow);
  }, [replaceScreenshot, resetCanvasWithWorkflow]);

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

  useEffect(() => {
    if (workflowStatus === "archived" && scheduleEnabled) {
      setScheduleEnabled(false);
    }
  }, [scheduleEnabled, workflowStatus]);

  useEffect(() => {
    setRunFormValues((current) => {
      const next = buildInitialRunValues(inputSchema);

      for (const field of inputSchema) {
        if (current[field.key] !== undefined) {
          next[field.key] = normalizeSelectInputValue(field, current[field.key]);
        }
      }

      return next;
    });
  }, [inputSchema]);

  useEffect(() => {
    const requirementKeys = new Set(credentialRequirements.map((item) => item.key));
    setRunCredentialBindings((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => requirementKeys.has(key)),
      ),
    );
  }, [credentialRequirements]);

  useEffect(() => {
    const credentialIds = new Set(credentials.map((credential) => credential.id));
    setRunCredentialBindings((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([, credentialId]) => credentialIds.has(credentialId)),
      ),
    );
  }, [credentials]);

  useEffect(() => {
    const hasMeaningfulChanges =
      Boolean(workflowId) ||
      flowNodes.length > 0 ||
      flowEdges.length > 0 ||
      inputSchema.length > 0 ||
      credentialRequirements.length > 0 ||
      workflowName.trim() !== "未命名工作流" ||
      workflowDescription.trim() !== "由前端画布编辑的工作流" ||
      workflowStatus !== "draft" ||
      scheduleEnabled ||
      Boolean(alertEmail.trim()) ||
      alertOnFailure ||
      alertOnSuccess;

    if (!hasMeaningfulChanges || !hasUnsavedWorkflowChanges || isLoadingWorkflow || isSavingWorkflow) {
      if (!isSavingWorkflow && autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }

    if (autoSaveSnapshotRef.current === workflowDraftSnapshot) {
      return;
    }

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;

      if (workflowDraftSnapshot === persistedWorkflowSnapshotRef.current) {
        return;
      }

      autoSaveSnapshotRef.current = workflowDraftSnapshot;
      void persistWorkflow({
        silent: true,
        snapshot: workflowDraftSnapshot,
      }).catch(() => undefined);
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [
    alertEmail,
    alertOnFailure,
    alertOnSuccess,
    credentialRequirements.length,
    flowEdges.length,
    flowNodes.length,
    hasUnsavedWorkflowChanges,
    inputSchema.length,
    isLoadingWorkflow,
    isSavingWorkflow,
    persistWorkflow,
    scheduleEnabled,
    workflowDescription,
    workflowDraftSnapshot,
    workflowId,
    workflowName,
    workflowStatus,
  ]);

  const handlePublishTemplate = useCallback(async () => {
    if (user?.role !== "admin") {
      return;
    }

    if (!ensureWorkflowSchemaReady("publish")) {
      return;
    }

    try {
      setIsPublishingTemplate(true);
      const savedWorkflow = await persistWorkflow({ silent: true });
      const workflow =
        savedWorkflow.status === "active"
          ? savedWorkflow
          : await updateWorkflow(savedWorkflow.id, { status: "active" });
      const title = publishForm.title.trim() || workflow.name;
      const description = publishForm.description.trim() || workflow.description || `${workflow.name} 妯℃澘`;
      const template = await publishWorkflowTemplate({
        workflowId: workflow.id,
        slug: publishForm.slug.trim(),
        title,
        description,
        category: publishForm.category.trim() || "浏览器自动化",
        tags: publishForm.tags.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
        published: true,
        featured: false,
      });
      setWorkflowStatus("active");
      setPublishedTemplate(template);
      addLog("success", `工作流“${workflow.name}”已同步到商店模板。`);
      setPublishDialogOpen(false);
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : "发布模板失败。");
    } finally {
      setIsPublishingTemplate(false);
    }
  }, [addLog, ensureWorkflowSchemaReady, persistWorkflow, publishForm, user?.role]);

  const startWorkflowRun = useCallback(
    async (
      workflowExecutionId: string,
      inputs: Record<string, string>,
      credentialBindings: Record<string, string>,
    ) => {
      try {
        setIsStartingRun(true);
        addLog("info", "工作流已保存，正在创建执行任务...");
        const task = await runTask(workflowExecutionId, inputs, credentialBindings);
        setTaskId(task.id);
        setIsRunning(true);
        setTaskRuntimeContext(
          buildRuntimePreview(
            inputSchema,
            inputs,
            credentialRequirements,
            credentialBindings,
            credentials,
          ),
        );
        addLog("info", `任务 ${task.id} 已入队，等待 Worker 执行...`);
      } catch (error) {
        setIsRunning(false);
        setIsCancelling(false);
        addLog("error", error instanceof Error ? error.message : "执行任务时发生未知错误。");
      } finally {
        setIsStartingRun(false);
      }
    },
    [addLog, credentialRequirements, credentials, inputSchema],
  );

  const handleConfirmRun = useCallback(async () => {
    if (!pendingRunWorkflowId) {
      return;
    }

    await startWorkflowRun(pendingRunWorkflowId, runFormValues, runCredentialBindings);
    setRunDialogOpen(false);
    setPendingRunWorkflowId(null);
  }, [pendingRunWorkflowId, runCredentialBindings, runFormValues, startWorkflowRun]);

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

    if (!ensureWorkflowSchemaReady("run")) {
      return;
    }

    setSelectedNodeId(null);
    setLogs([]);
    replaceScreenshot(null);
    setTaskId(null);
    setTaskRuntimeContext(null);
    setIsCancelling(false);
    activeNodeIdRef.current = null;
    setNodeStatuses(buildIdleNodeStatuses(flowNodes));

    try {
      const workflow = await persistWorkflow({ silent: true });
      addLog("info", "工作流已保存，正在创建执行任务...");

      const nextRunValues = {
        ...buildInitialRunValues(inputSchema),
        ...runFormValues,
      };
      setRunFormValues(nextRunValues);

      if (inputSchema.length > 0 || credentialRequirements.length > 0) {
        setPendingRunWorkflowId(workflow.id);
        setRunDialogOpen(true);
        return;
      }

      const task = await runTask(workflow.id, nextRunValues, runCredentialBindings);
      setTaskId(task.id);
      setIsRunning(true);
      setTaskRuntimeContext(
        buildRuntimePreview(
          inputSchema,
          nextRunValues,
          credentialRequirements,
          runCredentialBindings,
          credentials,
        ),
      );
      addLog("info", `任务 ${task.id} 已入队，等待 Worker 执行...`);
    } catch (error) {
      setIsRunning(false);
      setIsCancelling(false);
      addLog("error", error instanceof Error ? error.message : "执行任务时发生未知错误。");
    }
  }, [
    addLog,
    credentialRequirements.length,
    credentials,
    flowNodes,
    inputSchema,
    isCancelling,
    isRunning,
    persistWorkflow,
    replaceScreenshot,
    runCredentialBindings,
    runFormValues,
    taskId,
    ensureWorkflowSchemaReady,
  ]);

  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-50 flex overflow-hidden font-sans selection:bg-sky-500/30">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-[#09090b] relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-900/10 via-transparent to-transparent pointer-events-none" />

        <div className="border-b border-white/[0.05] bg-zinc-950/50 px-6 backdrop-blur-md z-10">
          <Header
            isRunning={isRunning}
            isCancelling={isCancelling}
            onToggleRun={toggleRun}
            actions={
              <>
                <Input
                  value={workflowName}
                  onChange={(event) => setWorkflowName(event.target.value)}
                  className="h-8 w-48 lg:w-56"
                  placeholder="输入工作流名称"
                />
                <div className="min-w-[88px] text-right text-xs text-zinc-500">
                  {isSavingWorkflow ? "自动保存中..." : hasUnsavedWorkflowChanges ? "等待自动保存" : "已自动保存"}
                </div>
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
                {user?.role === "admin" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Boolean(publishedTemplate) && !canManagePublishedTemplate}
                    title={
                      publishedTemplate && !canManagePublishedTemplate
                        ? "仅模板发布者或超级管理员可更新该模板"
                        : undefined
                    }
                    onClick={() => {
                      if (publishedTemplate && !canManagePublishedTemplate) {
                        return;
                      }

                      setPublishForm({
                        slug: publishedTemplate?.slug || workflowName
                          .trim()
                          .toLowerCase()
                          .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
                          .replace(/^-+|-+$/g, "") || "workflow-template",
                        title: publishedTemplate?.title || workflowName.trim(),
                        description: publishedTemplate?.description || workflowDescription.trim(),
                        category: publishedTemplate?.category || "浏览器自动化",
                        tags: publishedTemplate?.tags?.join(", ") || "",
                      });
                      setPublishDialogOpen(true);
                    }}
                    className="h-8 gap-2"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    {publishedTemplate ? (canManagePublishedTemplate ? "更新" : "无权") : "发布"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRecorderDialogOpen(true)}
                  className="h-8 gap-2"
                >
                  <Video className="w-3.5 h-3.5" />
                  录制
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="h-8 gap-2">
                  <Settings className="w-3.5 h-3.5" />
                  设置
                </Button>
              </>
            }
          />
        </div>

        <div className="flex items-center justify-between px-6 py-2 border-b border-white/[0.04] bg-zinc-950/30 z-10">
          <div className="text-xs text-zinc-500">
            {workflowId ? `当前工作流 ID: ${workflowId}` : "当前为未保存工作流"}
          </div>
          <div className="text-xs text-zinc-500">
            {isLoadingWorkflow ? "正在加载工作流..." : `${workflowDescription} · 状态：${workflowStatusLabel} · ${parameterSummary} · ${scheduleSummary} · ${alertSummary}`}
          </div>
        </div>
        {user?.role === "admin" && workflowId && workflowOwnerLabel ? (
          <div
            className={cn(
              "px-6 py-2 border-b text-xs z-10",
              isOwnWorkflowForAdmin
                ? "border-emerald-500/10 bg-emerald-500/5 text-emerald-100"
                : "border-sky-500/10 bg-sky-500/5 text-sky-100",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full border px-1.5 py-0.5 text-[11px]",
                  isOwnWorkflowForAdmin
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                    : "border-sky-500/20 bg-sky-500/10 text-sky-300",
                )}
              >
                {isOwnWorkflowForAdmin ? "我的工作流" : "他人工作流"}
              </span>
              <span>
                当前查看的是 <span className="font-medium">{workflowOwnerLabel}</span> 的工作流
              </span>
              {workflowOwner?.email && workflowOwner.email !== workflowOwnerLabel ? (
                <span className="opacity-80">{workflowOwner.email}</span>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex-1 flex overflow-hidden relative">
          <ReactFlowProvider>
            <NodePalette />

            <div key={`${workflowId ?? "draft"}-${canvasVersion}`} className="contents">
              <WorkflowCanvas
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
                  setSelectedNodeId(id);
                }}
              />
            </div>

            <div className="h-full z-10 flex border-l border-white/[0.05]">
              {selectedNodeId ? (
                <NodeConfigPanel
                  nodeId={selectedNodeId}
                  inputSchema={inputSchema}
                  credentialRequirements={credentialRequirements}
                  taskId={taskId}
                  isTaskRunning={isRunning}
                  screenshot={screenshot}
                  pageUrl={pageUrl}
                  onClose={() => setSelectedNodeId(null)}
                />
              ) : (
                <ExecutionPanel
                  isRunning={isRunning}
                  logs={logs}
                  screenshot={screenshot}
                  taskId={taskId}
                  pageUrl={pageUrl}
                  runtimeContext={taskRuntimeContext}
                  inputSchema={inputSchema}
                  onClearLogs={() => setLogs([])}
                />
              )}
            </div>
          </ReactFlowProvider>
        </div>
      </div>

      <RunWorkflowDialog
        open={runDialogOpen}
        workflowName={workflowName}
        inputSchema={inputSchema}
        credentialRequirements={credentialRequirements}
        credentials={credentials}
        values={runFormValues}
        credentialBindings={runCredentialBindings}
        isSubmitting={isStartingRun}
        onOpenChange={(open) => {
          setRunDialogOpen(open);
          if (!open) {
            setPendingRunWorkflowId(null);
          }
        }}
        onValuesChange={setRunFormValues}
        onCredentialBindingsChange={setRunCredentialBindings}
        onSubmit={() => void handleConfirmRun()}
      />

      <RecorderDialog
        open={recorderDialogOpen}
        onOpenChange={setRecorderDialogOpen}
        onWorkflowCreated={(workflow) => {
          navigate(`/?workflowId=${workflow.id}`);
        }}
      />

      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogHeader>
          <DialogTitle>{publishedTemplate ? "更新商店模板" : "发布到工作流商店"}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                value={publishForm.title}
                onChange={(event) => setPublishForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="模板标题"
              />
              <Input
                value={publishForm.slug}
                onChange={(event) => setPublishForm((current) => ({ ...current, slug: event.target.value }))}
                placeholder="模板 slug"
              />
              <Input
                value={publishForm.category}
                onChange={(event) => setPublishForm((current) => ({ ...current, category: event.target.value }))}
                placeholder="分类"
              />
              <Input
                value={publishForm.tags}
                onChange={(event) => setPublishForm((current) => ({ ...current, tags: event.target.value }))}
                placeholder="标签，使用中英文逗号分隔"
              />
            </div>
            <Input
              value={publishForm.description}
              onChange={(event) => setPublishForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="模板描述"
            />
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-xs text-zinc-400">
              {publishedTemplate
                ? "更新时会自动保存当前工作流，并把最新工作流 JSON 同步覆盖到现有商店模板。"
                : "发布时会自动保存当前工作流，并把当前工作流 JSON 作为模板定义同步到商店。"}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setPublishDialogOpen(false)}>
                取消
              </Button>
              <Button
                onClick={() => {
                  void handlePublishTemplate();
                }}
                disabled={!publishForm.slug.trim() || !publishForm.title.trim() || isPublishingTemplate}
              >
                {isPublishingTemplate ? "同步中..." : publishedTemplate ? "确认更新" : "确认发布"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogHeader>
          <DialogTitle>工作流设置</DialogTitle>
        </DialogHeader>
        <DialogContent className="flex min-h-0 flex-1 flex-col p-0">
          <Tabs defaultValue="schedule" className="flex min-h-0 flex-1 flex-col">
            <div className="sticky top-0 z-10 border-b border-white/[0.05] bg-zinc-950/95 px-6 py-4 backdrop-blur">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="schedule">调度</TabsTrigger>
                <TabsTrigger value="alerts">告警</TabsTrigger>
                <TabsTrigger value="inputs">参数与凭据需求</TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              <TabsContent value="schedule" className="mt-0 space-y-6 pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-zinc-200">工作流状态</div>
                    <div className="text-xs text-zinc-500">草稿便于持续编辑；归档后会自动停用调度，避免继续触发。</div>
                  </div>
                  <Select
                    value={workflowStatus}
                    onChange={(value) => setWorkflowStatus(value as WorkflowStatus)}
                    options={[
                      { value: "draft", label: "草稿" },
                      { value: "active", label: "已发布" },
                      { value: "archived", label: "已归档" },
                    ]}
                    className="w-40"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-zinc-200">启用定时调度</div>
                    <div className="text-xs text-zinc-500">按设定周期自动运行这个工作流，适合日报、巡检、同步等场景。</div>
                  </div>
                  <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} disabled={workflowStatus === "archived"} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Cron 表达式</label>
                  <Input
                    value={scheduleCron}
                    onChange={(event) => setScheduleCron(event.target.value)}
                    className="font-mono text-sm"
                    placeholder="例如：0 * * * *"
                    disabled={!scheduleEnabled || workflowStatus === "archived"}
                  />
                  <p className="text-xs text-zinc-500">支持标准 Cron 表达式，例如 `0 0 * * *` 表示每天凌晨 00:00 执行一次。</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">时区</label>
                  <Select
                    value={scheduleTimezone}
                    onChange={setScheduleTimezone}
                    disabled={!scheduleEnabled || workflowStatus === "archived"}
                    options={[
                      { value: "Asia/Shanghai", label: "Asia/Shanghai (UTC+8)" },
                      { value: "UTC", label: "UTC" },
                      { value: "Asia/Tokyo", label: "Asia/Tokyo (UTC+9)" },
                      { value: "America/New_York", label: "America/New_York (UTC-4/-5)" },
                    ]}
                  />
                </div>
              </TabsContent>

              <TabsContent value="alerts" className="mt-0 space-y-6 pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-zinc-200">执行失败</div>
                    <div className="text-xs text-zinc-500">节点报错、超时或任务被 Worker 异常中断时通知。</div>
                  </div>
                  <Switch checked={alertOnFailure} onCheckedChange={setAlertOnFailure} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-zinc-200">执行成功</div>
                    <div className="text-xs text-zinc-500">工作流完整执行完成且最终状态为成功时通知。</div>
                  </div>
                  <Switch checked={alertOnSuccess} onCheckedChange={setAlertOnSuccess} />
                </div>
                <div className="space-y-4 border-t border-white/[0.05] pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">通知邮箱</label>
                    <Input
                      value={alertEmail}
                      onChange={(event) => setAlertEmail(event.target.value)}
                      placeholder="admin@example.com"
                    />
                    <p className="text-xs text-zinc-500">当前版本仅支持邮件通知。请先在后台完成 SMTP 配置，再启用这里的告警接收。</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="inputs" className="mt-0 space-y-6 pb-2">
                <div className="flex flex-col gap-4 rounded-2xl border border-sky-500/10 bg-sky-500/5 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-medium text-sky-100">全局凭据已独立到凭据库</div>
                    <div className="mt-1 text-xs leading-6 text-sky-200/80">
                      这里仅设计当前工作流的运行参数和凭据需求；真正的账号、Cookie、API Key 等全局凭据请到“凭据库”统一维护。
                    </div>
                  </div>
                  <Button variant="outline" className="gap-2" onClick={() => navigate("/credentials")}>
                    <ArrowRight className="h-4 w-4" />
                    打开凭据库
                  </Button>
                </div>
                <WorkflowInputsDesigner
                  inputSchema={inputSchema}
                  credentialRequirements={credentialRequirements}
                  onInputSchemaChange={setInputSchema}
                  onCredentialRequirementsChange={setCredentialRequirements}
                />
              </TabsContent>
            </div>
          </Tabs>

          <div className="sticky bottom-0 z-10 flex justify-end gap-3 border-t border-white/[0.05] bg-zinc-950/95 px-6 py-4 backdrop-blur">
            {workflowSchemaValidation.hasErrors ? (
              <div className="mr-auto flex items-center text-xs text-amber-300">
                参数/凭据还有 {workflowSchemaValidation.totalIssues} 个待修复项，当前仍可保存草稿。
              </div>
            ) : null}
            <Button variant="ghost" onClick={() => setSettingsOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-sky-600 text-white border-transparent hover:bg-sky-700"
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

