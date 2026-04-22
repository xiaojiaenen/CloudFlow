import type { Edge, Node } from "@xyflow/react";
import type { LogEntry } from "@/src/components/LogPanel";
import type {
  CanvasNodeData,
  ExecutionNodeStatus,
  SanitizedCanvasEdge,
  SanitizedCanvasNode,
  TaskExecutionRecord,
} from "@/src/lib/cloudflow";
import { getTaskExecutionScreenshotSrc } from "@/src/lib/cloudflow";

export type CanvasNodeLike = Node<CanvasNodeData> | SanitizedCanvasNode;
export type CanvasEdgeLike = Edge | SanitizedCanvasEdge;

export function toLogTimestamp(timestamp?: string) {
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

export function buildIdleNodeStatuses(nodes: CanvasNodeLike[]) {
  return nodes.reduce<Record<string, ExecutionNodeStatus>>((acc, node) => {
    acc[node.id] = "idle";
    return acc;
  }, {});
}

export function getPrimaryPageUrl(nodes: CanvasNodeLike[]) {
  const pageNode = nodes.find((node) => node.data.type === "open_page");
  return typeof pageNode?.data.url === "string" ? pageNode.data.url : "";
}

export function buildRestoredLogs(events: TaskExecutionRecord[]): LogEntry[] {
  return events
    .filter((event) => event.type === "log" && event.message)
    .map((event) => ({
      id: event.id,
      timestamp: toLogTimestamp(event.createdAt),
      level: (event.level ?? "info") as LogEntry["level"],
      message: event.message ?? "",
    }));
}

export function getLatestPersistedScreenshot(taskId: string, events: TaskExecutionRecord[]) {
  const screenshots = events.filter((event) => event.type === "screenshot");
  return screenshots.length > 0
    ? getTaskExecutionScreenshotSrc(taskId, screenshots[screenshots.length - 1])
    : null;
}
