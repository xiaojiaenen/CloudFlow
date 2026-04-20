import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  ArrowDown,
  ArrowUp,
  Blend,
  Bot,
  Cable,
  CheckCircle2,
  CircleAlert,
  Keyboard,
  Link2,
  MousePointerClick,
  Navigation,
  Play,
  Radar,
  RotateCcw,
  Scroll,
  Sparkles,
  Square,
  Trash2,
  Type,
  Wand2,
} from "lucide-react";
import {
  analyzeRecorderSession,
  clickRecorderSession,
  clearRecorderSessionActions,
  closeRecorderSession,
  createRecorderSession,
  createWorkflow,
  deleteRecorderSessionAction,
  finishRecorderSession,
  getAuthToken,
  getRecorderSession,
  getWsBaseUrl,
  inputRecorderSession,
  moveRecorderSessionAction,
  navigateRecorderSession,
  precheckRecorderSession,
  pressKeyRecorderSession,
  RecorderActionSummary,
  RecorderExtractSuggestion,
  RecorderLiveEvent,
  RecorderPrecheckIssue,
  RecorderSessionSnapshot,
  resumeRecorderSessionFromAction,
  scrollRecorderSession,
  updateRecorderSessionAction,
  WorkflowApiDefinition,
  WorkflowRecord,
} from "@/src/lib/cloudflow";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/Dialog";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { Switch } from "@/src/components/ui/Switch";
import { cn } from "@/src/lib/utils";

const COMMON_KEY_OPTIONS = [
  { value: "Enter", label: "Enter" },
  { value: "Tab", label: "Tab" },
  { value: "Escape", label: "Escape" },
  { value: "Space", label: "Space" },
  { value: "ArrowDown", label: "Arrow Down" },
  { value: "ArrowUp", label: "Arrow Up" },
  { value: "ArrowLeft", label: "Arrow Left" },
  { value: "ArrowRight", label: "Arrow Right" },
];

const OUTPUT_MODE_OPTIONS = [
  { value: "workflow", label: "普通工作流" },
  { value: "template", label: "模板化输出" },
];

const RECORDER_GUIDE_STORAGE_KEY = "cloudflow_recorder_guide_dismissed_v2";

type RecorderBinaryPayload =
  | ArrayBuffer
  | Uint8Array
  | Blob
  | {
      type: "Buffer";
      data: number[];
    };

type RecorderActionBlock = {
  mainAction: RecorderActionSummary;
  waitAction?: RecorderActionSummary;
};

type RecorderActionEditorState = {
  label: string;
  selector: string;
  value: string;
  url: string;
  key: string;
  direction: "up" | "down" | "top" | "bottom";
  distance: string;
  waitUrl: string;
  parameterized: boolean;
  parameterKey: string;
  parameterLabel: string;
  parameterDescription: string;
};

function buildActionBlocks(actions: RecorderActionSummary[]) {
  const blocks: RecorderActionBlock[] = [];

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];

    if (action.type === "wait_for_url" && action.linkedActionId) {
      continue;
    }

    const nextAction = actions[index + 1];
    const waitAction =
      nextAction?.type === "wait_for_url" && nextAction.linkedActionId === action.id
        ? nextAction
        : undefined;

    blocks.push({
      mainAction: action,
      waitAction,
    });

    if (waitAction) {
      index += 1;
    }
  }

  return blocks;
}

function createEditorState(block?: RecorderActionBlock | null): RecorderActionEditorState {
  const action = block?.mainAction;

  return {
    label: action?.label ?? "",
    selector: action?.selector ?? "",
    value: action?.value ?? "",
    url: action?.url ?? "",
    key: action?.key ?? "Enter",
    direction: action?.direction ?? "down",
    distance: String(action?.distance ?? 500),
    waitUrl: block?.waitAction?.url ?? "",
    parameterized: Boolean(action?.useRuntimeInput),
    parameterKey: action?.parameterKey ?? "",
    parameterLabel: action?.parameterLabel ?? "",
    parameterDescription: action?.parameterDescription ?? "",
  };
}

function canMoveRecorderActionUp(blocks: RecorderActionBlock[], index: number) {
  return index > 0;
}

function canMoveRecorderActionDown(blocks: RecorderActionBlock[], index: number) {
  return index < blocks.length - 1;
}

function buildScreenshotSrc(snapshot?: RecorderSessionSnapshot | null) {
  if (!snapshot?.imageBase64) {
    return null;
  }

  return `data:${snapshot.mimeType || "image/jpeg"};base64,${snapshot.imageBase64}`;
}

function normalizeBinaryPayload(payload?: RecorderBinaryPayload) {
  if (!payload) {
    return null;
  }

  if (payload instanceof Blob) {
    return payload;
  }

  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }

  if (payload instanceof Uint8Array) {
    return payload;
  }

  if (typeof payload === "object" && payload.type === "Buffer" && Array.isArray(payload.data)) {
    return new Uint8Array(payload.data);
  }

  return null;
}

function inferSuggestionFieldMappings(suggestion: RecorderExtractSuggestion) {
  if (suggestion.targetMode !== "all") {
    return undefined;
  }

  return JSON.stringify(
    {
      value: "{{item}}",
      source: suggestion.label,
      collectedAt: "{{index}}",
    },
    null,
    2,
  );
}

function appendSuggestionNodes(
  definition: WorkflowApiDefinition,
  suggestions: RecorderExtractSuggestion[],
) {
  if (suggestions.length === 0) {
    return definition;
  }

  const nextDefinition: WorkflowApiDefinition = {
    ...definition,
    nodes: [...definition.nodes],
    canvas: definition.canvas
      ? {
          nodes: [...definition.canvas.nodes],
          edges: [...definition.canvas.edges],
        }
      : undefined,
  };

  let maxCanvasY =
    nextDefinition.canvas?.nodes.reduce((max, node) => Math.max(max, node.position.y), 40) ?? 40;
  let previousNodeId =
    nextDefinition.canvas?.nodes[nextDefinition.canvas.nodes.length - 1]?.id ??
    String(nextDefinition.nodes[nextDefinition.nodes.length - 1]?.clientNodeId ?? "");
  let sequence = nextDefinition.nodes.length + 1;

  for (const suggestion of suggestions) {
    const extractNodeId = `recorded-node-${sequence++}`;
    const extractNode = {
      clientNodeId: extractNodeId,
      type: "extract",
      label: suggestion.label,
      selector: suggestion.selector,
      property: suggestion.property,
      targetMode: suggestion.targetMode,
      saveTarget: "both",
      saveKey: suggestion.saveKey,
      resultFormat: suggestion.targetMode === "all" ? "json_array" : undefined,
    };

    nextDefinition.nodes.push(extractNode);

    if (nextDefinition.canvas) {
      maxCanvasY += 180;
      nextDefinition.canvas.nodes.push({
        id: extractNodeId,
        type: "custom",
        position: { x: 240, y: maxCanvasY },
        data: {
          ...extractNode,
          label: suggestion.label,
          params: "",
        },
      });

      if (previousNodeId) {
        nextDefinition.canvas.edges.push({
          id: `e-${previousNodeId}-${extractNodeId}`,
          source: previousNodeId,
          target: extractNodeId,
        });
      }
    }

    previousNodeId = extractNodeId;

    if (suggestion.targetMode === "all") {
      const saveDataNodeId = `recorded-node-${sequence++}`;
      const saveDataNode = {
        clientNodeId: saveDataNodeId,
        type: "save_data",
        label: `${suggestion.label}入库`,
        collectionKey: suggestion.collectionKey ?? suggestion.saveKey,
        collectionName: suggestion.collectionName ?? suggestion.label,
        recordMode: suggestion.recommendedRecordMode ?? "array",
        sourceVariable: `{{variables.${suggestion.saveKey}}}`,
        writeMode: "upsert",
        fieldMappings: inferSuggestionFieldMappings(suggestion),
      };

      nextDefinition.nodes.push(saveDataNode);

      if (nextDefinition.canvas) {
        nextDefinition.canvas.nodes.push({
          id: saveDataNodeId,
          type: "custom",
          position: { x: 520, y: maxCanvasY + 24 },
          data: {
            ...saveDataNode,
            params: "",
          },
        });
        nextDefinition.canvas.edges.push({
          id: `e-${extractNodeId}-${saveDataNodeId}`,
          source: extractNodeId,
          target: saveDataNodeId,
        });
      }

      previousNodeId = saveDataNodeId;
    }
  }

  return nextDefinition;
}

interface RecorderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWorkflowCreated: (workflow: WorkflowRecord) => void;
}

export function RecorderDialog({
  open,
  onOpenChange,
  onWorkflowCreated,
}: RecorderDialogProps) {
  const socketRef = useRef<Socket | null>(null);
  const liveScreenshotUrlRef = useRef<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RecorderSessionSnapshot | null>(null);
  const [targetUrl, setTargetUrl] = useState("https://example.com");
  const [workflowName, setWorkflowName] = useState("录制工作流");
  const [navigateUrl, setNavigateUrl] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [selectedKey, setSelectedKey] = useState("Enter");
  const [scrollDistance, setScrollDistance] = useState("500");
  const [interactionMode, setInteractionMode] = useState<"click" | "input">("click");
  const [outputMode, setOutputMode] = useState<"workflow" | "template">("workflow");
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<RecorderActionEditorState>(() => createEditorState());
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
  const [screenshotSrc, setScreenshotSrc] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.localStorage.getItem(RECORDER_GUIDE_STORAGE_KEY) !== "true";
  });
  const [isStarting, setIsStarting] = useState(false);
  const [isPerformingAction, setIsPerformingAction] = useState(false);
  const [isSavingAction, setIsSavingAction] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPrechecking, setIsPrechecking] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState("");

  const blocks = useMemo(() => buildActionBlocks(snapshot?.actions ?? []), [snapshot?.actions]);
  const selectedBlock = useMemo(
    () => blocks.find((block) => block.mainAction.id === selectedActionId) ?? blocks[0] ?? null,
    [blocks, selectedActionId],
  );
  const selectedSuggestions = useMemo(
    () => (snapshot?.suggestions ?? []).filter((item) => selectedSuggestionIds.includes(item.id)),
    [selectedSuggestionIds, snapshot?.suggestions],
  );
  const hasBlockingPrecheckIssue = useMemo(
    () => (snapshot?.precheckIssues ?? []).some((item) => item.level === "error"),
    [snapshot?.precheckIssues],
  );

  const revokeLiveScreenshotUrl = useCallback(() => {
    if (liveScreenshotUrlRef.current) {
      URL.revokeObjectURL(liveScreenshotUrlRef.current);
      liveScreenshotUrlRef.current = null;
    }
  }, []);

  const resetLocalState = useCallback(() => {
    setSessionId(null);
    setSnapshot(null);
    setNavigateUrl("");
    setInputValue("");
    setInteractionMode("click");
    setSelectedActionId(null);
    setEditorState(createEditorState());
    setSelectedSuggestionIds([]);
    setOutputMode("workflow");
    setIsStarting(false);
    setIsPerformingAction(false);
    setIsSavingAction(false);
    setIsAnalyzing(false);
    setIsPrechecking(false);
    setIsFinishing(false);
    setError("");
    revokeLiveScreenshotUrl();
    setScreenshotSrc(null);
  }, [revokeLiveScreenshotUrl]);

  const applySnapshot = useCallback(
    (
      nextSnapshot:
        | RecorderSessionSnapshot
        | (Omit<RecorderSessionSnapshot, "imageBase64"> & {
            imageBase64?: string;
            imageBuffer?: RecorderBinaryPayload;
          }),
    ) => {
      const binaryPayload = normalizeBinaryPayload(
        "imageBuffer" in nextSnapshot ? nextSnapshot.imageBuffer : undefined,
      );

      if (binaryPayload instanceof Blob) {
        const blobUrl = URL.createObjectURL(binaryPayload);
        revokeLiveScreenshotUrl();
        liveScreenshotUrlRef.current = blobUrl;
        setScreenshotSrc(blobUrl);
      } else if (binaryPayload instanceof Uint8Array) {
        const blobUrl = URL.createObjectURL(
          new Blob([binaryPayload], {
            type: nextSnapshot.mimeType || "image/jpeg",
          }),
        );
        revokeLiveScreenshotUrl();
        liveScreenshotUrlRef.current = blobUrl;
        setScreenshotSrc(blobUrl);
      } else if ("imageBase64" in nextSnapshot && nextSnapshot.imageBase64) {
        revokeLiveScreenshotUrl();
        setScreenshotSrc(`data:${nextSnapshot.mimeType || "image/jpeg"};base64,${nextSnapshot.imageBase64}`);
      } else if (!screenshotSrc) {
        setScreenshotSrc(buildScreenshotSrc(nextSnapshot as RecorderSessionSnapshot));
      }

      setSnapshot({
        ...(nextSnapshot as RecorderSessionSnapshot),
        imageBase64:
          "imageBase64" in nextSnapshot && typeof nextSnapshot.imageBase64 === "string"
            ? nextSnapshot.imageBase64
            : "",
      });
    },
    [revokeLiveScreenshotUrl, screenshotSrc],
  );

  const closeAndCleanup = useCallback(async () => {
    const currentSessionId = sessionId;
    resetLocalState();
    onOpenChange(false);

    if (currentSessionId) {
      socketRef.current?.emit("recorder:unsubscribe", { sessionId: currentSessionId });
      await closeRecorderSession(currentSessionId).catch(() => undefined);
    }
  }, [onOpenChange, resetLocalState, sessionId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!socketRef.current) {
      socketRef.current = io(`${getWsBaseUrl()}/recorder`, {
        transports: ["websocket"],
        auth: {
          token: getAuthToken(),
        },
      });
    }

    const socket = socketRef.current;
    const handleLive = (event: RecorderLiveEvent) => {
      if (!sessionId || event.sessionId !== sessionId) {
        return;
      }

      applySnapshot(event.snapshot);
    };

    const handleError = () => {
      setError("录制实时通道连接失败，已自动降级为静态状态。");
    };

    socket.on("recorder:live", handleLive);
    socket.on("connect_error", handleError);

    return () => {
      socket.off("recorder:live", handleLive);
      socket.off("connect_error", handleError);
    };
  }, [applySnapshot, open, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    socketRef.current?.emit("recorder:subscribe", { sessionId });
    return () => {
      socketRef.current?.emit("recorder:unsubscribe", { sessionId });
    };
  }, [sessionId]);

  useEffect(() => {
    if (!open && sessionId) {
      void closeRecorderSession(sessionId).catch(() => undefined);
      resetLocalState();
    }
  }, [open, resetLocalState, sessionId]);

  useEffect(() => {
    if (!selectedBlock) {
      setEditorState(createEditorState());
      return;
    }

    setSelectedActionId(selectedBlock.mainAction.id);
    setEditorState(createEditorState(selectedBlock));
  }, [selectedBlock]);

  useEffect(() => {
    if (!selectedActionId && blocks.length > 0) {
      setSelectedActionId(blocks[0].mainAction.id);
    }
  }, [blocks, selectedActionId]);

  useEffect(() => () => revokeLiveScreenshotUrl(), [revokeLiveScreenshotUrl]);

  const handleStart = useCallback(async () => {
    try {
      setIsStarting(true);
      setError("");
      const created = await createRecorderSession({
        url: targetUrl.trim(),
        name: workflowName.trim() || "录制工作流",
      });
      setSessionId(created.sessionId);
      applySnapshot(created);
      setNavigateUrl(created.pageUrl);
      setSelectedActionId(created.actions[0]?.id ?? null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "创建录制会话失败。");
    } finally {
      setIsStarting(false);
    }
  }, [applySnapshot, targetUrl, workflowName]);

  const refreshSession = useCallback(
    async (currentSessionId: string) => {
      const nextSnapshot = await getRecorderSession(currentSessionId);
      applySnapshot(nextSnapshot);
      setNavigateUrl(nextSnapshot.pageUrl);
      return nextSnapshot;
    },
    [applySnapshot],
  );

  const handleNavigate = useCallback(async () => {
    if (!sessionId || !navigateUrl.trim()) {
      return;
    }

    try {
      setIsPerformingAction(true);
      setError("");
      const result = await navigateRecorderSession(sessionId, {
        url: navigateUrl.trim(),
      });
      if (result.snapshot) {
        applySnapshot(result.snapshot);
        setNavigateUrl(result.snapshot.pageUrl);
      } else {
        await refreshSession(sessionId);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "页面跳转失败。");
    } finally {
      setIsPerformingAction(false);
    }
  }, [applySnapshot, navigateUrl, refreshSession, sessionId]);

  const handleScreenshotClick = useCallback(
    async (event: MouseEvent<HTMLImageElement>) => {
      if (!sessionId || !snapshot || isPerformingAction || isFinishing) {
        return;
      }

      if (interactionMode === "input" && !inputValue.trim()) {
        setError("输入模式下请先填写要录制的内容。");
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const xRatio = (event.clientX - rect.left) / rect.width;
      const yRatio = (event.clientY - rect.top) / rect.height;

      try {
        setIsPerformingAction(true);
        setError("");

        const result =
          interactionMode === "click"
            ? await clickRecorderSession(sessionId, {
                xRatio: Math.max(0, Math.min(1, xRatio)),
                yRatio: Math.max(0, Math.min(1, yRatio)),
              })
            : await inputRecorderSession(sessionId, {
                xRatio: Math.max(0, Math.min(1, xRatio)),
                yRatio: Math.max(0, Math.min(1, yRatio)),
                value: inputValue,
              });

        if (result.snapshot) {
          applySnapshot(result.snapshot);
          setNavigateUrl(result.snapshot.pageUrl);
        } else {
          await refreshSession(sessionId);
        }
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "录制操作失败。");
      } finally {
        setIsPerformingAction(false);
      }
    },
    [applySnapshot, inputValue, interactionMode, isFinishing, isPerformingAction, refreshSession, sessionId, snapshot],
  );

  const handlePressKey = useCallback(async () => {
    if (!sessionId || !selectedKey) {
      return;
    }

    try {
      setIsPerformingAction(true);
      setError("");
      const result = await pressKeyRecorderSession(sessionId, { key: selectedKey });
      if (result.snapshot) {
        applySnapshot(result.snapshot);
        setNavigateUrl(result.snapshot.pageUrl);
      } else {
        await refreshSession(sessionId);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "录制按键失败。");
    } finally {
      setIsPerformingAction(false);
    }
  }, [applySnapshot, refreshSession, selectedKey, sessionId]);

  const handleScroll = useCallback(
    async (direction: "up" | "down" | "top" | "bottom") => {
      if (!sessionId) {
        return;
      }

    try {
      setIsPerformingAction(true);
      setError("");
      const result = await scrollRecorderSession(sessionId, {
        direction,
        distance: Number(scrollDistance) || 500,
      });
      if (result.snapshot) {
        applySnapshot(result.snapshot);
        setNavigateUrl(result.snapshot.pageUrl);
      } else {
        await refreshSession(sessionId);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "录制滚动失败。");
    } finally {
      setIsPerformingAction(false);
    }
  },
    [applySnapshot, refreshSession, scrollDistance, sessionId],
  );

  const handleSaveAction = useCallback(async () => {
    if (!sessionId || !selectedBlock) {
      return;
    }

    try {
      setIsSavingAction(true);
      setError("");
      const result = await updateRecorderSessionAction(sessionId, selectedBlock.mainAction.id, {
        label: editorState.label,
        selector: editorState.selector,
        value: editorState.value,
        url: editorState.url,
        key: editorState.key,
        direction: editorState.direction,
        distance: Number(editorState.distance) || 500,
        useRuntimeInput: editorState.parameterized,
        parameterKey: editorState.parameterKey,
        parameterLabel: editorState.parameterLabel,
        parameterDescription: editorState.parameterDescription,
      });

      if (selectedBlock.waitAction) {
        await updateRecorderSessionAction(sessionId, selectedBlock.waitAction.id, {
          url: editorState.waitUrl,
        });
      }

      if (result.snapshot) {
        applySnapshot(result.snapshot);
        setNavigateUrl(result.snapshot.pageUrl);
      } else {
        await refreshSession(sessionId);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存步骤编辑失败。");
    } finally {
      setIsSavingAction(false);
    }
  }, [applySnapshot, editorState, refreshSession, selectedBlock, sessionId]);

  const handleMoveAction = useCallback(
    async (actionId: string, direction: "up" | "down") => {
      if (!sessionId) {
        return;
      }

      try {
        setIsPerformingAction(true);
        setError("");
        const result = await moveRecorderSessionAction(sessionId, actionId, { direction });
        if (result.snapshot) {
          applySnapshot(result.snapshot);
          setNavigateUrl(result.snapshot.pageUrl);
        } else {
          await refreshSession(sessionId);
        }
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "调整录制步骤顺序失败。");
      } finally {
        setIsPerformingAction(false);
      }
    },
    [applySnapshot, refreshSession, sessionId],
  );

  const handleDeleteAction = useCallback(
    async (actionId: string) => {
      if (!sessionId) {
        return;
      }

      try {
        setIsPerformingAction(true);
        setError("");
        const result = await deleteRecorderSessionAction(sessionId, actionId);
        const nextSnapshot = result.snapshot ?? (await refreshSession(sessionId));
        applySnapshot(nextSnapshot);
        const nextBlocks = buildActionBlocks(nextSnapshot.actions);
        setSelectedActionId(nextBlocks[0]?.mainAction.id ?? null);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "删除录制步骤失败。");
      } finally {
        setIsPerformingAction(false);
      }
    },
    [applySnapshot, refreshSession, sessionId],
  );

  const handleClearActions = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    try {
      setIsPerformingAction(true);
      setError("");
      const result = await clearRecorderSessionActions(sessionId);
      const nextSnapshot = result.snapshot ?? (await refreshSession(sessionId));
      applySnapshot(nextSnapshot);
      setSelectedActionId(buildActionBlocks(nextSnapshot.actions)[0]?.mainAction.id ?? null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "清空录制步骤失败。");
    } finally {
      setIsPerformingAction(false);
    }
  }, [applySnapshot, refreshSession, sessionId]);

  const handleAnalyze = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    try {
      setIsAnalyzing(true);
      setError("");
      const result = await analyzeRecorderSession(sessionId);
      if (result.snapshot) {
        applySnapshot(result.snapshot);
      } else {
        await refreshSession(sessionId);
      }
      setSelectedSuggestionIds((current) => {
        const nextSuggestions = result.suggestions ?? result.snapshot?.suggestions ?? [];
        const nextIds = new Set(current);
        nextSuggestions.forEach((item) => nextIds.add(item.id));
        return Array.from(nextIds);
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "智能提取分析失败。");
    } finally {
      setIsAnalyzing(false);
    }
  }, [applySnapshot, refreshSession, sessionId]);

  const handlePrecheck = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    try {
      setIsPrechecking(true);
      setError("");
      const result = await precheckRecorderSession(sessionId);
      if (result.snapshot) {
        applySnapshot(result.snapshot);
      } else {
        await refreshSession(sessionId);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "录制预检失败。");
    } finally {
      setIsPrechecking(false);
    }
  }, [applySnapshot, refreshSession, sessionId]);

  const handleResumeFromAction = useCallback(
    async (actionId: string) => {
      if (!sessionId) {
        return;
      }

      try {
        setIsPerformingAction(true);
        setError("");
        const result = await resumeRecorderSessionFromAction(sessionId, actionId);
        const nextSnapshot = result.snapshot ?? (await refreshSession(sessionId));
        applySnapshot(nextSnapshot);
        setSelectedActionId(buildActionBlocks(nextSnapshot.actions).find((item) => item.mainAction.id === actionId)?.mainAction.id ?? actionId);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "断点重录失败。");
      } finally {
        setIsPerformingAction(false);
      }
    },
    [applySnapshot, refreshSession, sessionId],
  );

  const handleToggleSuggestion = useCallback((suggestionId: string) => {
    setSelectedSuggestionIds((current) =>
      current.includes(suggestionId)
        ? current.filter((item) => item !== suggestionId)
        : [...current, suggestionId],
    );
  }, []);

  const dismissGuide = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(RECORDER_GUIDE_STORAGE_KEY, "true");
    }

    setShowGuide(false);
  }, []);

  const handleFinish = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    try {
      setIsFinishing(true);
      setError("");

      const precheckResult = await precheckRecorderSession(sessionId);
      const precheckIssues = precheckResult.precheckIssues ?? precheckResult.snapshot?.precheckIssues ?? [];
      if (precheckResult.snapshot) {
        applySnapshot(precheckResult.snapshot);
      }

      if (precheckIssues.some((item) => item.level === "error")) {
        throw new Error("录制预检未通过，请先修正阻塞问题后再生成工作流。");
      }

      const result = await finishRecorderSession(sessionId, {
        name: workflowName.trim() || "录制工作流",
        mode: outputMode,
      });

      if (!result.definition) {
        throw new Error("录制结果为空，请先完成至少一个有效动作。");
      }

      const definition = appendSuggestionNodes(result.definition, selectedSuggestions);
      const workflow = await createWorkflow({
        name:
          outputMode === "template"
            ? `${(workflowName.trim() || result.recommendedName || "录制工作流").replace(/模板$/, "")}模板`
            : workflowName.trim() || result.recommendedName || "录制工作流",
        description:
          outputMode === "template"
            ? "由录制器自动生成的模板化工作流，可继续发布到工作流商店。"
            : "由录制器自动生成",
        status: "draft",
        definition,
      });

      resetLocalState();
      onOpenChange(false);
      onWorkflowCreated(workflow);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "结束录制失败。");
    } finally {
      setIsFinishing(false);
    }
  }, [applySnapshot, onOpenChange, onWorkflowCreated, outputMode, resetLocalState, selectedSuggestions, sessionId, workflowName]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          void closeAndCleanup();
          return;
        }

        onOpenChange(nextOpen);
      }}
      className="max-w-[1440px]"
    >
      <DialogHeader>
        <DialogTitle>录制生成工作流</DialogTitle>
        <DialogDescription>
          直接在实时画面里操作页面，录制完成后先轻编辑、参数化和预检，再生成完整工作流或模板。
        </DialogDescription>
      </DialogHeader>

      <DialogContent className="flex min-h-0 flex-1 flex-col gap-5">
        {!sessionId ? (
          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.9fr]">
            <div className="space-y-4 rounded-3xl border border-white/[0.06] bg-black/20 p-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-zinc-100">起始页面</div>
                  <Input
                    value={targetUrl}
                    onChange={(event) => setTargetUrl(event.target.value)}
                    placeholder="https://example.com"
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-zinc-100">工作流名称</div>
                  <Input
                    value={workflowName}
                    onChange={(event) => setWorkflowName(event.target.value)}
                    placeholder="录制工作流"
                  />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-zinc-100">输出模式</div>
                  <Select value={outputMode} onChange={(value) => setOutputMode(value as "workflow" | "template")} options={OUTPUT_MODE_OPTIONS} />
                </div>
                <div className="flex items-end">
                  <Button onClick={() => void handleStart()} disabled={isStarting || !targetUrl.trim()} className="w-full gap-2">
                    <Play className="h-4 w-4" />
                    {isStarting ? "正在启动录制..." : "开始录制"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {showGuide ? (
                <div className="rounded-3xl border border-sky-500/15 bg-sky-500/8 p-5 text-sm leading-7 text-sky-50">
                  <div className="flex items-center gap-2 text-base font-medium">
                    <Bot className="h-4 w-4 text-sky-300" />
                    首次使用录制器
                  </div>
                  <div className="mt-3">1. 先输入起始页面并开始录制。</div>
                  <div>2. 在实时画面里点击、输入、按键、滚动。</div>
                  <div>3. 录制后可直接编辑步骤、改成运行参数、做预检和智能提取。</div>
                  <Button variant="outline" size="sm" onClick={dismissGuide} className="mt-4 gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    我知道了
                  </Button>
                </div>
              ) : null}

              <div className="rounded-3xl border border-white/[0.06] bg-black/20 p-5 text-sm leading-7 text-zinc-300">
                <div className="font-medium text-zinc-100">这一版录制器能力</div>
                <div className="mt-2">录制后轻编辑、输入值参数化、实时二进制画面、动作块展示、智能提取推荐、预检、断点重录、模板化输出。</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-5 2xl:grid-cols-[1.3fr_0.82fr_0.88fr]">
            <div className="flex min-h-0 flex-col rounded-3xl border border-white/[0.06] bg-black/20 p-4">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto] gap-2">
                  <Input
                    value={navigateUrl}
                    onChange={(event) => setNavigateUrl(event.target.value)}
                    placeholder="输入一个新地址并跳转"
                  />
                  <Button
                    variant="outline"
                    onClick={() => void handleNavigate()}
                    disabled={isPerformingAction || !navigateUrl.trim()}
                    className="gap-2"
                  >
                    <Navigation className="h-4 w-4" />
                    跳转
                  </Button>
                </div>
                <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-zinc-400">
                  已录制 {blocks.length} 个动作块
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-3xl border border-white/[0.08] bg-[#050505] p-2">
                {screenshotSrc ? (
                  <img
                    src={screenshotSrc}
                    alt="录制实时画面"
                    onClick={(event) => void handleScreenshotClick(event)}
                    className={cn(
                      "mx-auto max-h-[74vh] cursor-crosshair rounded-2xl object-contain",
                      isPerformingAction || isFinishing
                        ? "pointer-events-none opacity-70"
                        : "hover:ring-2 hover:ring-sky-400/40",
                    )}
                  />
                ) : (
                  <div className="flex h-[420px] items-center justify-center text-sm text-zinc-500">
                    正在等待录制画面...
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-4">
              <div className="rounded-3xl border border-white/[0.06] bg-black/20 p-4">
                <div className="mb-3 text-sm font-medium text-zinc-100">录制模式</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={interactionMode === "click" ? "default" : "outline"}
                    onClick={() => setInteractionMode("click")}
                    className="gap-2"
                  >
                    <MousePointerClick className="h-4 w-4" />
                    点击
                  </Button>
                  <Button
                    variant={interactionMode === "input" ? "default" : "outline"}
                    onClick={() => setInteractionMode("input")}
                    className="gap-2"
                  >
                    <Type className="h-4 w-4" />
                    输入
                  </Button>
                </div>
                {interactionMode === "input" ? (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-zinc-500">先填内容，再点击截图里的输入框位置。</div>
                    <Input
                      value={inputValue}
                      onChange={(event) => setInputValue(event.target.value)}
                      placeholder="例如：admin"
                    />
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-zinc-500">直接点击截图中的目标元素，系统会自动录制点击节点。</div>
                )}
              </div>

              <div className="rounded-3xl border border-white/[0.06] bg-black/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-100">
                  <Keyboard className="h-4 w-4 text-sky-300" />
                  快捷动作
                </div>
                <div className="grid gap-3">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Select value={selectedKey} onChange={setSelectedKey} options={COMMON_KEY_OPTIONS} />
                    <Button variant="outline" onClick={() => void handlePressKey()} disabled={isPerformingAction}>
                      录制按键
                    </Button>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2">
                    <Input
                      value={scrollDistance}
                      onChange={(event) => setScrollDistance(event.target.value)}
                      placeholder="500"
                    />
                    <Button variant="outline" onClick={() => void handleScroll("up")} disabled={isPerformingAction}>
                      上
                    </Button>
                    <Button variant="outline" onClick={() => void handleScroll("down")} disabled={isPerformingAction}>
                      下
                    </Button>
                    <Button variant="outline" onClick={() => void handleScroll("top")} disabled={isPerformingAction}>
                      顶
                    </Button>
                    <Button variant="outline" onClick={() => void handleScroll("bottom")} disabled={isPerformingAction}>
                      底
                    </Button>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 rounded-3xl border border-white/[0.06] bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                    <Blend className="h-4 w-4 text-sky-300" />
                    动作块
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleClearActions()}
                    disabled={isPerformingAction || blocks.length === 0}
                    className="gap-2"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    清空
                  </Button>
                </div>
                <div className="mb-3 text-xs leading-6 text-zinc-500">
                  自动等待会折叠到主动作里，移动、删除和断点重录都按动作块处理。
                </div>
                <div className="max-h-[460px] space-y-3 overflow-auto pr-1">
                  {blocks.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-5 text-sm text-zinc-500">
                      还没有录制动作。先打开页面，然后开始点击或输入。
                    </div>
                  ) : (
                    blocks.map((block, index) => (
                      <button
                        type="button"
                        key={block.mainAction.id}
                        onClick={() => setSelectedActionId(block.mainAction.id)}
                        className={cn(
                          "w-full rounded-2xl border px-3 py-3 text-left transition-colors",
                          selectedActionId === block.mainAction.id
                            ? "border-sky-400/40 bg-sky-400/10"
                            : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs text-zinc-500">动作块 {index + 1}</div>
                            <div className="mt-1 text-sm text-zinc-100">{block.mainAction.label}</div>
                            <div className="mt-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                              {block.mainAction.type}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleMoveAction(block.mainAction.id, "up");
                              }}
                              disabled={isPerformingAction || !canMoveRecorderActionUp(blocks, index)}
                              className="h-8 w-8 px-0"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleMoveAction(block.mainAction.id, "down");
                              }}
                              disabled={isPerformingAction || !canMoveRecorderActionDown(blocks, index)}
                              className="h-8 w-8 px-0"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleResumeFromAction(block.mainAction.id);
                              }}
                              disabled={isPerformingAction}
                              className="h-8 w-8 px-0"
                            >
                              <Cable className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDeleteAction(block.mainAction.id);
                              }}
                              disabled={isPerformingAction}
                              className="h-8 w-8 px-0 text-red-200 hover:text-red-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {block.mainAction.selector ? (
                          <div className="mt-3 break-all font-mono text-[11px] text-zinc-400">
                            {block.mainAction.selector}
                          </div>
                        ) : null}
                        {block.mainAction.value ? (
                          <div className="mt-2 break-all text-xs text-zinc-400">{block.mainAction.value}</div>
                        ) : null}
                        {block.mainAction.url ? (
                          <div className="mt-2 break-all font-mono text-[11px] text-zinc-400">
                            {block.mainAction.url}
                          </div>
                        ) : null}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {block.mainAction.useRuntimeInput ? (
                            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-100">
                              运行参数 · {block.mainAction.parameterKey}
                            </div>
                          ) : null}
                          {block.waitAction ? (
                            <div className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[11px] text-sky-100">
                              自动等待 · {block.waitAction.url || "页面跳转"}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-4">
              <div className="rounded-3xl border border-white/[0.06] bg-black/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-100">
                  <Wand2 className="h-4 w-4 text-sky-300" />
                  轻编辑 / 参数化
                </div>
                {selectedBlock ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="text-xs text-zinc-500">步骤标题</div>
                      <Input
                        value={editorState.label}
                        onChange={(event) => setEditorState((current) => ({ ...current, label: event.target.value }))}
                        placeholder="步骤标题"
                      />
                    </div>

                    {selectedBlock.mainAction.type === "open_page" ? (
                      <div className="space-y-2">
                        <div className="text-xs text-zinc-500">页面地址</div>
                        <Input
                          value={editorState.url}
                          onChange={(event) => setEditorState((current) => ({ ...current, url: event.target.value }))}
                          placeholder="https://example.com"
                        />
                      </div>
                    ) : null}

                    {(selectedBlock.mainAction.type === "click" || selectedBlock.mainAction.type === "input") ? (
                      <div className="space-y-2">
                        <div className="text-xs text-zinc-500">元素选择器</div>
                        <Input
                          value={editorState.selector}
                          onChange={(event) => setEditorState((current) => ({ ...current, selector: event.target.value }))}
                          placeholder="#login-button"
                        />
                      </div>
                    ) : null}

                    {selectedBlock.mainAction.type === "input" ? (
                      <>
                        <div className="space-y-2">
                          <div className="text-xs text-zinc-500">输入值</div>
                          <Input
                            value={editorState.value}
                            onChange={(event) => setEditorState((current) => ({ ...current, value: event.target.value }))}
                            placeholder="请输入录制值"
                          />
                        </div>
                        <div className="rounded-2xl border border-emerald-400/12 bg-emerald-400/6 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-zinc-100">改成运行参数</div>
                              <div className="mt-1 text-xs leading-6 text-zinc-400">
                                打开后，这一步会在运行时向用户展示输入框，而不是把当前录制值写死。
                              </div>
                            </div>
                            <Switch
                              checked={editorState.parameterized}
                              onCheckedChange={(checked) =>
                                setEditorState((current) => ({
                                  ...current,
                                  parameterized: checked,
                                  parameterKey: current.parameterKey || "input_value",
                                }))
                              }
                            />
                          </div>
                          {editorState.parameterized ? (
                            <div className="mt-3 space-y-2">
                              <Input
                                value={editorState.parameterKey}
                                onChange={(event) =>
                                  setEditorState((current) => ({ ...current, parameterKey: event.target.value }))
                                }
                                placeholder="参数标识，例如 username"
                              />
                              <Input
                                value={editorState.parameterLabel}
                                onChange={(event) =>
                                  setEditorState((current) => ({ ...current, parameterLabel: event.target.value }))
                                }
                                placeholder="参数名称，例如 用户名"
                              />
                              <textarea
                                value={editorState.parameterDescription}
                                onChange={(event) =>
                                  setEditorState((current) => ({ ...current, parameterDescription: event.target.value }))
                                }
                                placeholder="参数说明，例如 登录账号"
                                className="min-h-[82px] w-full rounded-2xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-sky-400/40"
                              />
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : null}

                    {selectedBlock.mainAction.type === "press_key" ? (
                      <div className="space-y-2">
                        <div className="text-xs text-zinc-500">按键</div>
                        <Select
                          value={editorState.key}
                          onChange={(value) => setEditorState((current) => ({ ...current, key: value }))}
                          options={COMMON_KEY_OPTIONS}
                        />
                      </div>
                    ) : null}

                    {selectedBlock.mainAction.type === "scroll" ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <div className="text-xs text-zinc-500">方向</div>
                          <Select
                            value={editorState.direction}
                            onChange={(value) =>
                              setEditorState((current) => ({
                                ...current,
                                direction: value as "up" | "down" | "top" | "bottom",
                              }))
                            }
                            options={[
                              { value: "down", label: "向下" },
                              { value: "up", label: "向上" },
                              { value: "top", label: "顶部" },
                              { value: "bottom", label: "底部" },
                            ]}
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="text-xs text-zinc-500">距离</div>
                          <Input
                            value={editorState.distance}
                            onChange={(event) => setEditorState((current) => ({ ...current, distance: event.target.value }))}
                            placeholder="500"
                          />
                        </div>
                      </div>
                    ) : null}

                    {selectedBlock.waitAction ? (
                      <div className="space-y-2 rounded-2xl border border-sky-400/12 bg-sky-400/6 p-3">
                        <div className="text-xs font-medium text-sky-100">自动等待 URL</div>
                        <Input
                          value={editorState.waitUrl}
                          onChange={(event) => setEditorState((current) => ({ ...current, waitUrl: event.target.value }))}
                          placeholder="/dashboard"
                        />
                      </div>
                    ) : null}

                    <Button onClick={() => void handleSaveAction()} disabled={isSavingAction} className="w-full gap-2">
                      <Sparkles className="h-4 w-4" />
                      {isSavingAction ? "正在保存..." : "保存动作块编辑"}
                    </Button>
                  </div>
                ) : (
                  <div className="text-sm text-zinc-500">选择一个动作块后，可在这里轻编辑并把输入值改成运行参数。</div>
                )}
              </div>

              <div className="rounded-3xl border border-white/[0.06] bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                    <Radar className="h-4 w-4 text-sky-300" />
                    回放预检
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void handlePrecheck()} disabled={isPrechecking} className="gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {isPrechecking ? "检查中..." : "立即预检"}
                  </Button>
                </div>
                <div className="space-y-2">
                  {(snapshot?.precheckIssues ?? []).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-4 text-sm text-zinc-500">
                      还没有预检结果。生成前建议先跑一次。
                    </div>
                  ) : (
                    (snapshot?.precheckIssues ?? []).map((issue: RecorderPrecheckIssue) => (
                      <div
                        key={issue.id}
                        className={cn(
                          "rounded-2xl border px-3 py-3 text-sm",
                          issue.level === "error"
                            ? "border-red-500/20 bg-red-500/10 text-red-100"
                            : "border-amber-500/20 bg-amber-500/10 text-amber-100",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {issue.level === "error" ? (
                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                          ) : (
                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                          )}
                          <div>{issue.message}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 rounded-3xl border border-white/[0.06] bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                    <Sparkles className="h-4 w-4 text-sky-300" />
                    智能提取推荐
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void handleAnalyze()} disabled={isAnalyzing} className="gap-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    {isAnalyzing ? "分析中..." : "分析页面"}
                  </Button>
                </div>
                <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
                  {(snapshot?.suggestions ?? []).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-4 text-sm text-zinc-500">
                      还没有推荐。通常在完成主流程后点一次“分析页面”效果最好。
                    </div>
                  ) : (
                    (snapshot?.suggestions ?? []).map((suggestion: RecorderExtractSuggestion) => {
                      const checked = selectedSuggestionIds.includes(suggestion.id);
                      return (
                        <button
                          key={suggestion.id}
                          type="button"
                          onClick={() => handleToggleSuggestion(suggestion.id)}
                          className={cn(
                            "w-full rounded-2xl border px-3 py-3 text-left transition-colors",
                            checked
                              ? "border-emerald-400/30 bg-emerald-400/10"
                              : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-zinc-100">{suggestion.label}</div>
                              <div className="mt-1 break-all font-mono text-[11px] text-zinc-400">{suggestion.selector}</div>
                            </div>
                            <div className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[11px] text-zinc-300">
                              {checked ? "已加入" : "点击加入"}
                            </div>
                          </div>
                          <div className="mt-2 text-xs leading-6 text-zinc-400">{suggestion.preview}</div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </DialogContent>

      <DialogFooter>
        {sessionId ? (
          <>
            <div className="mr-auto text-xs text-zinc-500">
              {hasBlockingPrecheckIssue
                ? "存在阻塞问题，建议先修正后再生成。"
                : isPerformingAction
                  ? "正在执行录制动作..."
                  : selectedSuggestions.length > 0
                    ? `将追加 ${selectedSuggestions.length} 条智能提取推荐。`
                    : "点击实时画面即可继续录制，完成后会自动创建工作流。"}
            </div>
            <Button variant="ghost" onClick={() => void closeAndCleanup()} disabled={isFinishing}>
              <Square className="mr-2 h-4 w-4" />
              取消录制
            </Button>
            <Button onClick={() => void handleFinish()} disabled={isFinishing || isPerformingAction}>
              {isFinishing ? "生成中..." : outputMode === "template" ? "结束并生成模板工作流" : "结束并生成工作流"}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
