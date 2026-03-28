import type { Edge, Node } from "@xyflow/react";

export type ExecutionNodeStatus = "idle" | "running" | "success" | "error";

export interface CanvasNodeData {
  label: string;
  type: string;
  params: string;
  status?: ExecutionNodeStatus;
  [key: string]: unknown;
}

export interface WorkflowApiDefinition {
  nodes: Array<Record<string, unknown>>;
}

export interface WorkflowRecord {
  id: string;
  name: string;
  description?: string | null;
  definition: WorkflowApiDefinition;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRecord {
  id: string;
  workflowId: string;
  status: "pending" | "running" | "success" | "failed";
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface TaskEvent {
  taskId: string;
  type: "log" | "screenshot" | "status";
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
        timestamp: string;
      }
    | {
        status: "pending" | "running" | "success" | "failed";
        errorMessage?: string;
        timestamp: string;
      };
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:3001/api";
const WS_BASE_URL = (import.meta.env.VITE_WS_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:3001";

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function getWsBaseUrl() {
  return WS_BASE_URL;
}

export async function createWorkflow(payload: {
  name: string;
  description?: string;
  definition: WorkflowApiDefinition;
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

export function buildWorkflowDefinition(
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
): WorkflowApiDefinition {
  const supportedTypes = new Set(["open_page", "click", "input", "wait"]);
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
    throw new Error(`当前后端仅支持打开网页、点击元素、输入文本、等待时间。请移除不支持的节点：${labels}`);
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
      }

      return baseNode;
    }),
  };
}
