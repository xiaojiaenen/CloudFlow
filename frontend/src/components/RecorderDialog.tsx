import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Square } from "lucide-react";
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
  navigateRecorderSession,
  moveRecorderSessionAction,
  precheckRecorderSession,
  pressKeyRecorderSession,
  RecorderLiveEvent,
  RecorderSessionSnapshot,
  resumeRecorderSessionFromAction,
  scrollRecorderSession,
  updateRecorderSessionAction,
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
import { RecorderStartScreen } from "@/src/components/recorder/RecorderStartScreen";
import { RecorderWorkspaceScreen } from "@/src/components/recorder/RecorderWorkspaceScreen";
import {
  appendSuggestionNodes,
  buildActionBlocks,
  buildScreenshotSrc,
  createEditorState,
  normalizeBinaryPayload,
  RECORDER_GUIDE_STORAGE_KEY,
  type RecorderActionEditorState,
  type RecorderBinaryPayload,
} from "@/src/components/recorder/shared";

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
      } else {
        setScreenshotSrc((current) => current ?? buildScreenshotSrc(nextSnapshot as RecorderSessionSnapshot));
      }

      setSnapshot({
        ...(nextSnapshot as RecorderSessionSnapshot),
        imageBase64:
          "imageBase64" in nextSnapshot && typeof nextSnapshot.imageBase64 === "string"
            ? nextSnapshot.imageBase64
            : "",
      });
    },
    [revokeLiveScreenshotUrl],
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
      setError("录制实时通道连接失败，已自动降级为静态刷新模式。");
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

  const refreshSession = useCallback(
    async (currentSessionId: string) => {
      const nextSnapshot = await getRecorderSession(currentSessionId);
      applySnapshot(nextSnapshot);
      setNavigateUrl(nextSnapshot.pageUrl);
      return nextSnapshot;
    },
    [applySnapshot],
  );

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
        setError(nextError instanceof Error ? nextError.message : "录制动作失败。");
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
      setError(nextError instanceof Error ? nextError.message : "保存动作块编辑失败。");
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
        setSelectedActionId(
          buildActionBlocks(nextSnapshot.actions).find((item) => item.mainAction.id === actionId)?.mainAction.id ??
            actionId,
        );
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
        throw new Error("录制预检未通过，请先修复阻塞问题后再生成工作流。");
      }

      const result = await finishRecorderSession(sessionId, {
        name: workflowName.trim() || "录制工作流",
        mode: outputMode,
      });

      if (!result.definition) {
        throw new Error("录制结果为空，请先完成至少一个有效动作。");
      }

      const baseName = workflowName.trim() || result.recommendedName || "录制工作流";
      const definition = appendSuggestionNodes(result.definition, selectedSuggestions);
      const workflow = await createWorkflow({
        name: outputMode === "template" ? `${baseName.replace(/模板$/, "")}模板` : baseName,
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
          <RecorderStartScreen
            targetUrl={targetUrl}
            workflowName={workflowName}
            outputMode={outputMode}
            showGuide={showGuide}
            isStarting={isStarting}
            onTargetUrlChange={setTargetUrl}
            onWorkflowNameChange={setWorkflowName}
            onOutputModeChange={setOutputMode}
            onStart={() => void handleStart()}
            onDismissGuide={dismissGuide}
          />
        ) : (
          <RecorderWorkspaceScreen
            navigateUrl={navigateUrl}
            screenshotSrc={screenshotSrc}
            inputValue={inputValue}
            selectedKey={selectedKey}
            scrollDistance={scrollDistance}
            interactionMode={interactionMode}
            blocks={blocks}
            selectedActionId={selectedActionId}
            selectedBlock={selectedBlock}
            editorState={editorState}
            selectedSuggestionIds={selectedSuggestionIds}
            snapshot={snapshot}
            isPerformingAction={isPerformingAction}
            isFinishing={isFinishing}
            isSavingAction={isSavingAction}
            isAnalyzing={isAnalyzing}
            isPrechecking={isPrechecking}
            onNavigateUrlChange={setNavigateUrl}
            onInputValueChange={setInputValue}
            onSelectedKeyChange={setSelectedKey}
            onScrollDistanceChange={setScrollDistance}
            onInteractionModeChange={setInteractionMode}
            onSelectActionId={setSelectedActionId}
            onEditorStateChange={setEditorState}
            onNavigate={() => void handleNavigate()}
            onScreenshotClick={(event) => void handleScreenshotClick(event)}
            onPressKey={() => void handlePressKey()}
            onScroll={(direction) => void handleScroll(direction)}
            onClearActions={() => void handleClearActions()}
            onMoveAction={(actionId, direction) => void handleMoveAction(actionId, direction)}
            onResumeFromAction={(actionId) => void handleResumeFromAction(actionId)}
            onDeleteAction={(actionId) => void handleDeleteAction(actionId)}
            onSaveAction={() => void handleSaveAction()}
            onPrecheck={() => void handlePrecheck()}
            onAnalyze={() => void handleAnalyze()}
            onToggleSuggestion={handleToggleSuggestion}
          />
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
                ? "存在阻塞问题，建议先修复后再生成。"
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
