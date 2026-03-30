import type { Edge, Node } from "@xyflow/react";
import { getNodeDefinition } from "@/src/registry/nodes";

export type ExecutionNodeStatus = "idle" | "running" | "success" | "error" | "cancelled";

export interface CanvasNodeData {
  label: string;
  type: string;
  params: string;
  status?: ExecutionNodeStatus;
  [key: string]: unknown;
}

export interface SanitizedCanvasNode {
  id: string;
  type: string | undefined;
  position: {
    x: number;
    y: number;
  };
  data: CanvasNodeData;
}

export interface SanitizedCanvasEdge {
  id: string;
  source: string;
  target: string;
}

export interface WorkflowCanvasSnapshot {
  nodes: SanitizedCanvasNode[];
  edges: SanitizedCanvasEdge[];
}

export interface WorkflowApiDefinition {
  nodes: Array<Record<string, unknown>>;
  canvas?: WorkflowCanvasSnapshot;
}

export interface WorkflowRecord {
  id: string;
  name: string;
  description?: string | null;
  definition: WorkflowApiDefinition;
  scheduleEnabled?: boolean;
  scheduleCron?: string | null;
  scheduleTimezone?: string | null;
  alertEmail?: string | null;
  alertOnSuccess?: boolean;
  alertOnFailure?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowSchedulePayload {
  enabled: boolean;
  cron?: string;
  timezone?: string;
}

export interface WorkflowAlertPayload {
  email?: string;
  onFailure: boolean;
  onSuccess: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TaskRecord {
  id: string;
  workflowId: string;
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  triggerSource?: "manual" | "schedule";
  errorMessage?: string | null;
  cancelRequestedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  workflow?: WorkflowRecord;
  workflowSnapshot?: WorkflowApiDefinition;
  executionEvents?: TaskExecutionRecord[];
}

export interface AlertRecord {
  id: string;
  level: "error" | "warning" | "success";
  title: string;
  message: string;
  createdAt: string;
  taskId: string;
  workflowId: string;
  workflowName: string;
  triggerSource?: "manual" | "schedule";
  taskStatus: "pending" | "running" | "success" | "failed" | "cancelled";
}

export interface WorkflowScheduleRecord {
  id: string;
  name: string;
  description?: string | null;
  scheduleCron?: string | null;
  scheduleTimezone?: string | null;
  nextRunAt?: string | null;
  updatedAt: string;
  alertEmail?: string | null;
  alertOnFailure?: boolean;
  alertOnSuccess?: boolean;
  lastScheduledTask?: {
    id: string;
    status: "pending" | "running" | "success" | "failed" | "cancelled";
    createdAt: string;
    startedAt?: string | null;
    completedAt?: string | null;
  } | null;
}

export interface TaskEvent {
  taskId: string;
  type: "log" | "screenshot" | "status" | "extract";
  data:
    | {
        message: string;
        level: "info" | "warn" | "error" | "success";
        timestamp: string;
        nodeId?: string;
      }
    | {
        imageBase64: string;
        mimeType: string;
        source?: "stream" | "node";
        timestamp: string;
      }
    | {
        status: "pending" | "running" | "success" | "failed" | "cancelled";
        errorMessage?: string;
        timestamp: string;
      }
    | {
        selector: string;
        property: string;
        value: string;
        preview: string;
        nodeId?: string;
        timestamp: string;
      };
}

export interface TaskExecutionRecord {
  id: string;
  taskId: string;
  type: "log" | "screenshot" | "status" | "extract";
  sequence: number;
  level?: "info" | "warn" | "error" | "success" | null;
  nodeId?: string | null;
  message?: string | null;
  status?: "pending" | "running" | "success" | "failed" | "cancelled" | null;
  mimeType?: string | null;
  imageBase64?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

export const WORKFLOW_SAVED_EVENT = "cloudflow:workflow-saved";
export const WORKFLOW_OPEN_BLANK_EVENT = "cloudflow:open-blank-workflow";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:3001/api";
const WS_BASE_URL =
  (import.meta.env.VITE_WS_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:3001";

function buildNodeParams(data: Record<string, unknown>) {
  return Object.entries(data)
    .filter(
      ([key, value]) =>
        !["label", "type", "status", "params", "clientNodeId"].includes(key) &&
        value !== undefined &&
        value !== "",
    )
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(", ");
}

function createNodeData(type: string, extra: Record<string, unknown> = {}): CanvasNodeData {
  const defaultLabel = getNodeDefinition(type)?.label ?? type;
  const data = {
    label: defaultLabel,
    type,
    status: "idle" as const,
    ...extra,
  };

  return {
    ...data,
    params: buildNodeParams(data),
  };
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function getWsBaseUrl() {
  return WS_BASE_URL;
}

export function createEmptyCanvasGraph(): WorkflowCanvasSnapshot {
  return {
    nodes: [],
    edges: [],
  };
}

export function createDemoCanvasGraph(): WorkflowCanvasSnapshot {
  return {
    nodes: [
      {
        id: "1",
        type: "custom",
        position: { x: 250, y: 50 },
        data: createNodeData("open_page", {
          label: "打开目标网页",
          url: "data:text/html,%3C!doctype%20html%3E%3Chtml%3E%3Cbody%20style%3D%22font-family%3AArial%3Bpadding%3A40px%3Bbackground%3A%230f172a%3Bcolor%3Awhite%22%3E%3Ch1%3ECloudFlow%20Demo%3C%2Fh1%3E%3Cinput%20id%3D%22username%22%20placeholder%3D%22username%22%20style%3D%22display%3Ablock%3Bmargin-bottom%3A12px%3Bpadding%3A10px%3Bwidth%3A240px%22%20%2F%3E%3Cbutton%20id%3D%22login%22%20style%3D%22padding%3A10px%2016px%22%20onclick%3D%22document.getElementById(%27result%27).textContent%20%3D%20%27Login%20clicked%27%22%3ELogin%3C%2Fbutton%3E%3Cp%20id%3D%22result%22%20style%3D%22margin-top%3A16px%22%3EWaiting...%3C%2Fp%3E%3C%2Fbody%3E%3C%2Fhtml%3E",
        }),
      },
      {
        id: "2",
        type: "custom",
        position: { x: 250, y: 200 },
        data: createNodeData("input", {
          label: "输入账号",
          selector: "#username",
          value: "test",
        }),
      },
      {
        id: "3",
        type: "custom",
        position: { x: 250, y: 350 },
        data: createNodeData("click", {
          label: "点击登录按钮",
          selector: "#login",
        }),
      },
      {
        id: "4",
        type: "custom",
        position: { x: 250, y: 500 },
        data: createNodeData("wait", {
          label: "等待页面稳定",
          time: "1500",
        }),
      },
    ],
    edges: [
      { id: "e1-2", source: "1", target: "2" },
      { id: "e2-3", source: "2", target: "3" },
      { id: "e3-4", source: "3", target: "4" },
    ],
  };
}

export async function listWorkflows() {
  const response = await fetch(`${API_BASE_URL}/workflows`);

  if (!response.ok) {
    throw new Error(`读取工作流列表失败 (${response.status})`);
  }

  return (await response.json()) as WorkflowRecord[];
}

export async function getWorkflow(id: string) {
  const response = await fetch(`${API_BASE_URL}/workflows/${id}`);

  if (!response.ok) {
    throw new Error(`读取工作流失败 (${response.status})`);
  }

  return (await response.json()) as WorkflowRecord;
}

export async function createWorkflow(payload: {
  name: string;
  description?: string;
  definition: WorkflowApiDefinition;
  schedule?: WorkflowSchedulePayload;
  alerts?: WorkflowAlertPayload;
}) {
  const response = await fetch(`${API_BASE_URL}/workflows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`创建工作流失败 (${response.status})`);
  }

  return (await response.json()) as WorkflowRecord;
}

export async function updateWorkflow(
  id: string,
  payload: {
    name?: string;
    description?: string;
    definition?: WorkflowApiDefinition;
    schedule?: WorkflowSchedulePayload;
    alerts?: WorkflowAlertPayload;
  },
) {
  const response = await fetch(`${API_BASE_URL}/workflows/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`保存工作流失败 (${response.status})`);
  }

  return (await response.json()) as WorkflowRecord;
}

export async function deleteWorkflow(id: string) {
  const response = await fetch(`${API_BASE_URL}/workflows/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`删除工作流失败 (${response.status})`);
  }

  return (await response.json()) as { id: string; deletedAt: string };
}

export async function listWorkflowSchedules(params?: {
  page?: number;
  pageSize?: number;
}) {
  const query = new URLSearchParams();

  if (params?.page) {
    query.set("page", String(params.page));
  }

  if (params?.pageSize) {
    query.set("pageSize", String(params.pageSize));
  }

  const response = await fetch(`${API_BASE_URL}/workflows/schedules${query.toString() ? `?${query.toString()}` : ""}`);

  if (!response.ok) {
    throw new Error(`读取调度列表失败 (${response.status})`);
  }

  return (await response.json()) as PaginatedResponse<WorkflowScheduleRecord>;
}

export async function listTasks(params?: {
  page?: number;
  pageSize?: number;
  status?: TaskRecord["status"];
  triggerSource?: TaskRecord["triggerSource"];
}) {
  const query = new URLSearchParams();

  if (params?.page) {
    query.set("page", String(params.page));
  }

  if (params?.pageSize) {
    query.set("pageSize", String(params.pageSize));
  }

  if (params?.status) {
    query.set("status", params.status);
  }

  if (params?.triggerSource) {
    query.set("triggerSource", params.triggerSource);
  }

  const response = await fetch(`${API_BASE_URL}/tasks${query.toString() ? `?${query.toString()}` : ""}`);

  if (!response.ok) {
    throw new Error(`读取任务列表失败 (${response.status})`);
  }

  return (await response.json()) as PaginatedResponse<TaskRecord>;
}

export async function getTask(id: string) {
  const response = await fetch(`${API_BASE_URL}/tasks/${id}`);

  if (!response.ok) {
    throw new Error(`读取任务详情失败 (${response.status})`);
  }

  return (await response.json()) as TaskRecord;
}

export async function listAlerts(params?: {
  page?: number;
  pageSize?: number;
  level?: AlertRecord["level"];
}) {
  const query = new URLSearchParams();

  if (params?.page) {
    query.set("page", String(params.page));
  }

  if (params?.pageSize) {
    query.set("pageSize", String(params.pageSize));
  }

  if (params?.level) {
    query.set("level", params.level);
  }

  const response = await fetch(`${API_BASE_URL}/alerts${query.toString() ? `?${query.toString()}` : ""}`);

  if (!response.ok) {
    throw new Error(`读取告警列表失败 (${response.status})`);
  }

  return (await response.json()) as PaginatedResponse<AlertRecord>;
}

export async function runTask(workflowId: string) {
  const response = await fetch(`${API_BASE_URL}/tasks/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ workflowId }),
  });

  if (!response.ok) {
    throw new Error(`创建任务失败 (${response.status})`);
  }

  return (await response.json()) as TaskRecord;
}

export async function cancelTask(taskId: string) {
  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/cancel`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`停止任务失败 (${response.status})`);
  }

  return (await response.json()) as TaskRecord;
}

export function buildWorkflowDefinition(nodes: Node<CanvasNodeData>[], edges: Edge[]): WorkflowApiDefinition {
  const supportedTypes = new Set(["open_page", "click", "input", "wait", "scroll", "extract", "screenshot"]);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incomingCounts = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  nodes.forEach((node) => {
    incomingCounts.set(node.id, 0);
    outgoing.set(node.id, []);
  });

  edges.forEach((edge) => {
    incomingCounts.set(edge.target, (incomingCounts.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  });

  const startNodes = nodes
    .filter((node) => (incomingCounts.get(node.id) ?? 0) === 0)
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

  const visited = new Set<string>();
  const orderedNodes: Node<CanvasNodeData>[] = [];

  const walk = (nodeId: string) => {
    if (visited.has(nodeId)) {
      return;
    }

    const node = nodeById.get(nodeId);
    if (!node) {
      return;
    }

    visited.add(nodeId);
    orderedNodes.push(node);

    const nextNodes = (outgoing.get(nodeId) ?? [])
      .map((id) => nodeById.get(id))
      .filter((candidate): candidate is Node<CanvasNodeData> => Boolean(candidate))
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

    nextNodes.forEach((nextNode) => walk(nextNode.id));
  };

  startNodes.forEach((node) => walk(node.id));

  nodes
    .filter((node) => !visited.has(node.id))
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    .forEach((node) => orderedNodes.push(node));

  const unsupportedNodes = orderedNodes.filter((node) => !supportedTypes.has(String(node.data.type)));
  if (unsupportedNodes.length > 0) {
    const labels = unsupportedNodes.map((node) => node.data.label || node.id).join("、");
    throw new Error(`当前后端仅支持打开网页、点击元素、输入文本、等待、滚动、提取和截图节点。请移除不支持的节点：${labels}`);
  }

  return {
    nodes: orderedNodes.map((node) => {
      const type = String(node.data.type);
      const baseNode = {
        clientNodeId: node.id,
        type,
      } as Record<string, unknown>;

      if (type === "open_page") {
        baseNode.url = String(node.data.url ?? "");
      } else if (type === "click") {
        baseNode.selector = String(node.data.selector ?? "");
      } else if (type === "input") {
        baseNode.selector = String(node.data.selector ?? "");
        baseNode.value = String(node.data.value ?? "");
      } else if (type === "wait") {
        baseNode.time = Number(node.data.time ?? 1000);
      } else if (type === "scroll") {
        baseNode.direction = String(node.data.direction ?? "down");
        baseNode.distance = Number(node.data.distance ?? 500);
      } else if (type === "extract") {
        baseNode.selector = String(node.data.selector ?? "");
        baseNode.property = String(node.data.property ?? "text");
      } else if (type === "screenshot") {
        baseNode.scope = String(node.data.scope ?? "viewport");
      }

      return baseNode;
    }),
    canvas: {
      nodes: sanitizeCanvasNodes(nodes),
      edges: sanitizeCanvasEdges(edges),
    },
  };
}

export function hydrateCanvasFromWorkflow(definition?: WorkflowApiDefinition | null): WorkflowCanvasSnapshot {
  if (definition?.canvas?.nodes?.length) {
    return {
      nodes: definition.canvas.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          params: buildNodeParams(node.data),
          status: "idle",
        } as CanvasNodeData,
      })),
      edges: definition.canvas.edges.map((edge) => ({ ...edge })),
    };
  }

  if (!definition?.nodes?.length) {
    return createEmptyCanvasGraph();
  }

  const nodes: SanitizedCanvasNode[] = definition.nodes.map((node, index) => {
    const type = String(node.type ?? "unknown");
    const nodeId = String(node.clientNodeId ?? index + 1);
    const data = createNodeData(type, {
      ...node,
      type,
    });

    return {
      id: nodeId,
      type: "custom",
      position: {
        x: 250,
        y: 50 + index * 150,
      },
      data,
    };
  });

  const edges: SanitizedCanvasEdge[] = nodes.slice(1).map((node, index) => ({
    id: `e${nodes[index].id}-${node.id}`,
    source: nodes[index].id,
    target: node.id,
  }));

  return { nodes, edges };
}

export function sanitizeCanvasNodes(nodes: Node<CanvasNodeData>[]): SanitizedCanvasNode[] {
  return nodes.map((node) => {
    const data = {
      ...node.data,
      status: undefined,
    };

    return {
      id: node.id,
      type: node.type,
      position: {
        x: node.position.x,
        y: node.position.y,
      },
      data: {
        ...data,
        params: buildNodeParams(data),
      },
    };
  });
}

export function sanitizeCanvasEdges(edges: Edge[]): SanitizedCanvasEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
  }));
}
