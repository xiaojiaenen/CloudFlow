import { type MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  Link2,
  MousePointerClick,
  Navigation,
  Play,
  Scroll,
  Square,
  Type,
} from "lucide-react";
import {
  clickRecorderSession,
  closeRecorderSession,
  createRecorderSession,
  createWorkflow,
  finishRecorderSession,
  getRecorderSession,
  inputRecorderSession,
  navigateRecorderSession,
  pressKeyRecorderSession,
  RecorderSessionSnapshot,
  scrollRecorderSession,
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

function buildScreenshotSrc(snapshot?: RecorderSessionSnapshot | null) {
  if (!snapshot?.imageBase64) {
    return null;
  }

  return `data:${snapshot.mimeType || "image/jpeg"};base64,${snapshot.imageBase64}`;
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RecorderSessionSnapshot | null>(null);
  const [targetUrl, setTargetUrl] = useState("https://example.com");
  const [workflowName, setWorkflowName] = useState("录制工作流");
  const [navigateUrl, setNavigateUrl] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [selectedKey, setSelectedKey] = useState("Enter");
  const [scrollDistance, setScrollDistance] = useState("500");
  const [interactionMode, setInteractionMode] = useState<"click" | "input">("click");
  const [isStarting, setIsStarting] = useState(false);
  const [isPerformingAction, setIsPerformingAction] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState("");

  const screenshotSrc = useMemo(() => buildScreenshotSrc(snapshot), [snapshot]);

  const resetLocalState = useCallback(() => {
    setSessionId(null);
    setSnapshot(null);
    setNavigateUrl("");
    setInputValue("");
    setInteractionMode("click");
    setIsStarting(false);
    setIsPerformingAction(false);
    setIsFinishing(false);
    setError("");
  }, []);

  const closeAndCleanup = useCallback(async () => {
    const currentSessionId = sessionId;
    resetLocalState();
    onOpenChange(false);

    if (currentSessionId) {
      await closeRecorderSession(currentSessionId).catch(() => undefined);
    }
  }, [onOpenChange, resetLocalState, sessionId]);

  useEffect(() => {
    if (!open || !sessionId) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const nextSnapshot = await getRecorderSession(sessionId);

        if (!cancelled) {
          setSnapshot(nextSnapshot);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "录制会话刷新失败。");
        }
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 800);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [open, sessionId]);

  useEffect(() => {
    if (!open && sessionId) {
      void closeRecorderSession(sessionId).catch(() => undefined);
      resetLocalState();
    }
  }, [open, resetLocalState, sessionId]);

  const handleStart = useCallback(async () => {
    try {
      setIsStarting(true);
      setError("");
      const created = await createRecorderSession({
        url: targetUrl.trim(),
        name: workflowName.trim() || "录制工作流",
      });
      setSessionId(created.sessionId);
      setSnapshot(created);
      setNavigateUrl(created.pageUrl);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "创建录制会话失败。");
    } finally {
      setIsStarting(false);
    }
  }, [targetUrl, workflowName]);

  const handleNavigate = useCallback(async () => {
    if (!sessionId || !navigateUrl.trim()) {
      return;
    }

    try {
      setIsPerformingAction(true);
      setError("");
      await navigateRecorderSession(sessionId, {
        url: navigateUrl.trim(),
      });
      const nextSnapshot = await getRecorderSession(sessionId);
      setSnapshot(nextSnapshot);
      setNavigateUrl(nextSnapshot.pageUrl);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "页面跳转失败。");
    } finally {
      setIsPerformingAction(false);
    }
  }, [navigateUrl, sessionId]);

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

        if (interactionMode === "click") {
          await clickRecorderSession(sessionId, {
            xRatio: Math.max(0, Math.min(1, xRatio)),
            yRatio: Math.max(0, Math.min(1, yRatio)),
          });
        } else {
          await inputRecorderSession(sessionId, {
            xRatio: Math.max(0, Math.min(1, xRatio)),
            yRatio: Math.max(0, Math.min(1, yRatio)),
            value: inputValue,
          });
        }

        const nextSnapshot = await getRecorderSession(sessionId);
        setSnapshot(nextSnapshot);
        setNavigateUrl(nextSnapshot.pageUrl);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "录制操作失败。");
      } finally {
        setIsPerformingAction(false);
      }
    },
    [inputValue, interactionMode, isFinishing, isPerformingAction, sessionId, snapshot],
  );

  const handlePressKey = useCallback(async () => {
    if (!sessionId || !selectedKey) {
      return;
    }

    try {
      setIsPerformingAction(true);
      setError("");
      await pressKeyRecorderSession(sessionId, { key: selectedKey });
      const nextSnapshot = await getRecorderSession(sessionId);
      setSnapshot(nextSnapshot);
      setNavigateUrl(nextSnapshot.pageUrl);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "录制按键失败。");
    } finally {
      setIsPerformingAction(false);
    }
  }, [selectedKey, sessionId]);

  const handleScroll = useCallback(
    async (direction: "up" | "down" | "top" | "bottom") => {
      if (!sessionId) {
        return;
      }

      try {
        setIsPerformingAction(true);
        setError("");
        await scrollRecorderSession(sessionId, {
          direction,
          distance: Number(scrollDistance) || 500,
        });
        const nextSnapshot = await getRecorderSession(sessionId);
        setSnapshot(nextSnapshot);
        setNavigateUrl(nextSnapshot.pageUrl);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "录制滚动失败。");
      } finally {
        setIsPerformingAction(false);
      }
    },
    [scrollDistance, sessionId],
  );

  const handleFinish = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    try {
      setIsFinishing(true);
      setError("");
      const result = await finishRecorderSession(sessionId, {
        name: workflowName.trim() || "录制工作流",
      });

      if (!result.definition) {
        throw new Error("录制结果为空，请先完成至少一个有效动作。");
      }

      const workflow = await createWorkflow({
        name: workflowName.trim() || result.recommendedName || "录制工作流",
        description: "由录制器自动生成",
        status: "draft",
        definition: result.definition,
      });

      resetLocalState();
      onOpenChange(false);
      onWorkflowCreated(workflow);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "结束录制失败。");
    } finally {
      setIsFinishing(false);
    }
  }, [onOpenChange, onWorkflowCreated, resetLocalState, sessionId, workflowName]);

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
      className="max-w-6xl"
    >
      <DialogHeader>
        <DialogTitle>录制生成工作流</DialogTitle>
        <DialogDescription>
          先打开目标页面，再在下方实时画面中点击、输入、按键、滚动。结束录制后系统会自动生成一整套工作流。
        </DialogDescription>
      </DialogHeader>

      <DialogContent className="flex min-h-0 flex-1 flex-col gap-5">
        {!sessionId ? (
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-4 rounded-3xl border border-white/[0.06] bg-black/20 p-5">
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
              <Button onClick={() => void handleStart()} disabled={isStarting || !targetUrl.trim()} className="gap-2">
                <Play className="h-4 w-4" />
                {isStarting ? "正在启动录制..." : "开始录制"}
              </Button>
            </div>

            <div className="rounded-3xl border border-sky-500/10 bg-sky-500/5 p-5 text-sm leading-7 text-sky-100">
              <div className="font-medium">这一版录制器支持</div>
              <div className="mt-2">打开页面、页面跳转、点击元素、输入内容、按键、滚动页面。</div>
              <div className="mt-2">结束后会自动生成顺序式工作流，适合大多数表单和后台操作场景。</div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[1.5fr_0.9fr]">
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
                  已录制 {snapshot?.actionCount ?? 0} 步
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-3xl border border-white/[0.08] bg-[#050505] p-2">
                {screenshotSrc ? (
                  <img
                    src={screenshotSrc}
                    alt="录制实时画面"
                    onClick={(event) => void handleScreenshotClick(event)}
                    className={cn(
                      "mx-auto max-h-[72vh] cursor-crosshair rounded-2xl object-contain",
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
                <div className="mb-3 text-sm font-medium text-zinc-100">点击模式</div>
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
                  按键录制
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Select value={selectedKey} onChange={setSelectedKey} options={COMMON_KEY_OPTIONS} />
                  <Button variant="outline" onClick={() => void handlePressKey()} disabled={isPerformingAction}>
                    录制
                  </Button>
                </div>
              </div>

              <div className="rounded-3xl border border-white/[0.06] bg-black/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-100">
                  <Scroll className="h-4 w-4 text-sky-300" />
                  滚动录制
                </div>
                <Input
                  value={scrollDistance}
                  onChange={(event) => setScrollDistance(event.target.value)}
                  placeholder="500"
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => void handleScroll("up")} disabled={isPerformingAction}>
                    向上
                  </Button>
                  <Button variant="outline" onClick={() => void handleScroll("down")} disabled={isPerformingAction}>
                    向下
                  </Button>
                  <Button variant="outline" onClick={() => void handleScroll("top")} disabled={isPerformingAction}>
                    顶部
                  </Button>
                  <Button variant="outline" onClick={() => void handleScroll("bottom")} disabled={isPerformingAction}>
                    底部
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 rounded-3xl border border-white/[0.06] bg-black/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-100">
                  <Link2 className="h-4 w-4 text-sky-300" />
                  已录制步骤
                </div>
                <div className="max-h-[260px] space-y-2 overflow-auto pr-1">
                  {(snapshot?.actions ?? []).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-5 text-sm text-zinc-500">
                      还没有录制动作。先打开页面，然后开始点击或输入。
                    </div>
                  ) : (
                    snapshot?.actions.map((action, index) => (
                      <div key={action.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                        <div className="text-xs text-zinc-500">步骤 {index + 1}</div>
                        <div className="mt-1 text-sm text-zinc-100">{action.label}</div>
                        {action.selector ? (
                          <div className="mt-2 break-all font-mono text-[11px] text-zinc-400">
                            {action.selector}
                          </div>
                        ) : null}
                        {action.url ? (
                          <div className="mt-2 break-all font-mono text-[11px] text-zinc-400">
                            {action.url}
                          </div>
                        ) : null}
                        {action.value ? (
                          <div className="mt-2 break-all text-xs text-zinc-400">{action.value}</div>
                        ) : null}
                      </div>
                    ))
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
              {isPerformingAction
                ? "正在执行录制动作..."
                : "点击实时画面即可录制操作，结束后会自动创建工作流。"}
            </div>
            <Button variant="ghost" onClick={() => void closeAndCleanup()} disabled={isFinishing}>
              <Square className="mr-2 h-4 w-4" />
              取消录制
            </Button>
            <Button onClick={() => void handleFinish()} disabled={isFinishing || isPerformingAction}>
              {isFinishing ? "生成中..." : "结束并生成工作流"}
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
