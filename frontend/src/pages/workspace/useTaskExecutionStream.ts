import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { LogEntry } from "@/src/components/LogPanel";
import {
  type ExecutionNodeStatus,
  getAuthToken,
  getWsBaseUrl,
  type TaskEvent,
} from "@/src/lib/cloudflow";
import { toLogTimestamp } from "./utils";

type ScreenshotBinaryPayload =
  | ArrayBuffer
  | Uint8Array
  | Blob
  | {
      type: "Buffer";
      data: number[];
    };

type ScreenshotTaskEventPayload = Extract<TaskEvent["data"], { mimeType: string; timestamp: string }>;

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

export function useTaskExecutionStream(taskId: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const activeNodeIdRef = useRef<string | null>(null);
  const liveScreenshotUrlRef = useRef<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, ExecutionNodeStatus>>({});

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

  const resetTaskStreamState = useCallback(() => {
    setIsRunning(false);
    setIsCancelling(false);
    setLogs([]);
    replaceScreenshot(null);
    activeNodeIdRef.current = null;
  }, [replaceScreenshot]);

  return {
    addLog,
    isRunning,
    isCancelling,
    logs,
    screenshot,
    nodeStatuses,
    setIsRunning,
    setIsCancelling,
    setLogs,
    setNodeStatuses,
    replaceScreenshot,
    resetTaskStreamState,
  };
}
