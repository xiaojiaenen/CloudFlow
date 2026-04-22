import type { MouseEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Blend,
  Cable,
  CheckCircle2,
  CircleAlert,
  Keyboard,
  MousePointerClick,
  Navigation,
  Radar,
  RotateCcw,
  Scroll,
  Sparkles,
  Trash2,
  Type,
  Wand2,
} from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { Switch } from "@/src/components/ui/Switch";
import type {
  RecorderExtractSuggestion,
  RecorderPrecheckIssue,
  RecorderSessionSnapshot,
} from "@/src/lib/cloudflow";
import { cn } from "@/src/lib/utils";
import {
  canMoveRecorderActionDown,
  canMoveRecorderActionUp,
  COMMON_KEY_OPTIONS,
  RecorderActionBlock,
  RecorderActionEditorState,
} from "./shared";

interface RecorderWorkspaceScreenProps {
  navigateUrl: string;
  screenshotSrc: string | null;
  inputValue: string;
  selectedKey: string;
  scrollDistance: string;
  interactionMode: "click" | "input";
  blocks: RecorderActionBlock[];
  selectedActionId: string | null;
  selectedBlock: RecorderActionBlock | null;
  editorState: RecorderActionEditorState;
  selectedSuggestionIds: string[];
  snapshot: RecorderSessionSnapshot | null;
  isPerformingAction: boolean;
  isFinishing: boolean;
  isSavingAction: boolean;
  isAnalyzing: boolean;
  isPrechecking: boolean;
  onNavigateUrlChange: (value: string) => void;
  onInputValueChange: (value: string) => void;
  onSelectedKeyChange: (value: string) => void;
  onScrollDistanceChange: (value: string) => void;
  onInteractionModeChange: (value: "click" | "input") => void;
  onSelectActionId: (value: string) => void;
  onEditorStateChange: (
    updater: RecorderActionEditorState | ((current: RecorderActionEditorState) => RecorderActionEditorState),
  ) => void;
  onNavigate: () => void;
  onScreenshotClick: (event: MouseEvent<HTMLImageElement>) => void;
  onPressKey: () => void;
  onScroll: (direction: "up" | "down" | "top" | "bottom") => void;
  onClearActions: () => void;
  onMoveAction: (actionId: string, direction: "up" | "down") => void;
  onResumeFromAction: (actionId: string) => void;
  onDeleteAction: (actionId: string) => void;
  onSaveAction: () => void;
  onPrecheck: () => void;
  onAnalyze: () => void;
  onToggleSuggestion: (suggestionId: string) => void;
}

export function RecorderWorkspaceScreen({
  navigateUrl,
  screenshotSrc,
  inputValue,
  selectedKey,
  scrollDistance,
  interactionMode,
  blocks,
  selectedActionId,
  selectedBlock,
  editorState,
  selectedSuggestionIds,
  snapshot,
  isPerformingAction,
  isFinishing,
  isSavingAction,
  isAnalyzing,
  isPrechecking,
  onNavigateUrlChange,
  onInputValueChange,
  onSelectedKeyChange,
  onScrollDistanceChange,
  onInteractionModeChange,
  onSelectActionId,
  onEditorStateChange,
  onNavigate,
  onScreenshotClick,
  onPressKey,
  onScroll,
  onClearActions,
  onMoveAction,
  onResumeFromAction,
  onDeleteAction,
  onSaveAction,
  onPrecheck,
  onAnalyze,
  onToggleSuggestion,
}: RecorderWorkspaceScreenProps) {
  return (
    <div className="grid min-h-0 flex-1 gap-5 2xl:grid-cols-[1.3fr_0.82fr_0.88fr]">
      <div className="flex min-h-0 flex-col rounded-3xl border border-white/[0.06] bg-black/20 p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto] gap-2">
            <Input
              value={navigateUrl}
              onChange={(event) => onNavigateUrlChange(event.target.value)}
              placeholder="输入新的页面地址并跳转"
            />
            <Button
              variant="outline"
              onClick={onNavigate}
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
              onClick={(event) => void onScreenshotClick(event)}
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
              onClick={() => onInteractionModeChange("click")}
              className="gap-2"
            >
              <MousePointerClick className="h-4 w-4" />
              点击
            </Button>
            <Button
              variant={interactionMode === "input" ? "default" : "outline"}
              onClick={() => onInteractionModeChange("input")}
              className="gap-2"
            >
              <Type className="h-4 w-4" />
              输入
            </Button>
          </div>
          {interactionMode === "input" ? (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-zinc-500">先填写内容，再点击实时画面里的输入框位置。</div>
              <Input
                value={inputValue}
                onChange={(event) => onInputValueChange(event.target.value)}
                placeholder="例如：admin"
              />
            </div>
          ) : (
            <div className="mt-3 text-xs text-zinc-500">直接点击实时画面中的目标元素，系统会自动记录动作。</div>
          )}
        </div>

        <div className="rounded-3xl border border-white/[0.06] bg-black/20 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-100">
            <Keyboard className="h-4 w-4 text-sky-300" />
            快捷动作
          </div>
          <div className="grid gap-3">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Select value={selectedKey} onChange={onSelectedKeyChange} options={COMMON_KEY_OPTIONS} />
              <Button variant="outline" onClick={onPressKey} disabled={isPerformingAction}>
                录制按键
              </Button>
            </div>
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2">
              <Input
                value={scrollDistance}
                onChange={(event) => onScrollDistanceChange(event.target.value)}
                placeholder="500"
              />
              <Button variant="outline" onClick={() => onScroll("up")} disabled={isPerformingAction}>
                上
              </Button>
              <Button variant="outline" onClick={() => onScroll("down")} disabled={isPerformingAction}>
                下
              </Button>
              <Button variant="outline" onClick={() => onScroll("top")} disabled={isPerformingAction}>
                顶
              </Button>
              <Button variant="outline" onClick={() => onScroll("bottom")} disabled={isPerformingAction}>
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
              onClick={onClearActions}
              disabled={isPerformingAction || blocks.length === 0}
              className="gap-2"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              清空
            </Button>
          </div>
          <div className="mb-3 text-xs leading-6 text-zinc-500">
            自动等待会折叠到主动作中，移动、删除和断点重录都按动作块来处理。
          </div>
          <div className="max-h-[460px] space-y-3 overflow-auto pr-1">
            {blocks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-5 text-sm text-zinc-500">
                还没有录制到动作。先操作页面，再回来轻编辑。
              </div>
            ) : (
              blocks.map((block, index) => (
                <button
                  type="button"
                  key={block.mainAction.id}
                  onClick={() => onSelectActionId(block.mainAction.id)}
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
                          onMoveAction(block.mainAction.id, "up");
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
                          onMoveAction(block.mainAction.id, "down");
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
                          onResumeFromAction(block.mainAction.id);
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
                          onDeleteAction(block.mainAction.id);
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
                  onChange={(event) =>
                    onEditorStateChange((current) => ({ ...current, label: event.target.value }))
                  }
                  placeholder="步骤标题"
                />
              </div>

              {selectedBlock.mainAction.type === "open_page" ? (
                <div className="space-y-2">
                  <div className="text-xs text-zinc-500">页面地址</div>
                  <Input
                    value={editorState.url}
                    onChange={(event) =>
                      onEditorStateChange((current) => ({ ...current, url: event.target.value }))
                    }
                    placeholder="https://example.com"
                  />
                </div>
              ) : null}

              {(selectedBlock.mainAction.type === "click" || selectedBlock.mainAction.type === "input") ? (
                <div className="space-y-2">
                  <div className="text-xs text-zinc-500">元素选择器</div>
                  <Input
                    value={editorState.selector}
                    onChange={(event) =>
                      onEditorStateChange((current) => ({ ...current, selector: event.target.value }))
                    }
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
                      onChange={(event) =>
                        onEditorStateChange((current) => ({ ...current, value: event.target.value }))
                      }
                      placeholder="请输入录制值"
                    />
                  </div>
                  <div className="rounded-2xl border border-emerald-400/12 bg-emerald-400/6 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-zinc-100">改成运行参数</div>
                        <div className="mt-1 text-xs leading-6 text-zinc-400">
                          打开后，这一步会在运行时展示为用户输入，而不是写死录制时的值。
                        </div>
                      </div>
                      <Switch
                        checked={editorState.parameterized}
                        onCheckedChange={(checked) =>
                          onEditorStateChange((current) => ({
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
                            onEditorStateChange((current) => ({
                              ...current,
                              parameterKey: event.target.value,
                            }))
                          }
                          placeholder="参数标识，例如 username"
                        />
                        <Input
                          value={editorState.parameterLabel}
                          onChange={(event) =>
                            onEditorStateChange((current) => ({
                              ...current,
                              parameterLabel: event.target.value,
                            }))
                          }
                          placeholder="参数名称，例如 用户名"
                        />
                        <textarea
                          value={editorState.parameterDescription}
                          onChange={(event) =>
                            onEditorStateChange((current) => ({
                              ...current,
                              parameterDescription: event.target.value,
                            }))
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
                    onChange={(value) => onEditorStateChange((current) => ({ ...current, key: value }))}
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
                        onEditorStateChange((current) => ({
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
                      onChange={(event) =>
                        onEditorStateChange((current) => ({ ...current, distance: event.target.value }))
                      }
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
                    onChange={(event) =>
                      onEditorStateChange((current) => ({ ...current, waitUrl: event.target.value }))
                    }
                    placeholder="/dashboard"
                  />
                </div>
              ) : null}

              <Button onClick={onSaveAction} disabled={isSavingAction} className="w-full gap-2">
                <Sparkles className="h-4 w-4" />
                {isSavingAction ? "正在保存..." : "保存动作块编辑"}
              </Button>
            </div>
          ) : (
            <div className="text-sm text-zinc-500">选择一个动作块后，可以在这里继续轻编辑并改造成运行参数。</div>
          )}
        </div>

        <RecorderPrecheckPanel
          issues={snapshot?.precheckIssues ?? []}
          isPrechecking={isPrechecking}
          onPrecheck={onPrecheck}
        />

        <RecorderSuggestionPanel
          suggestions={snapshot?.suggestions ?? []}
          selectedSuggestionIds={selectedSuggestionIds}
          isAnalyzing={isAnalyzing}
          onAnalyze={onAnalyze}
          onToggleSuggestion={onToggleSuggestion}
        />
      </div>
    </div>
  );
}

function RecorderPrecheckPanel({
  issues,
  isPrechecking,
  onPrecheck,
}: {
  issues: RecorderPrecheckIssue[];
  isPrechecking: boolean;
  onPrecheck: () => void;
}) {
  return (
    <div className="rounded-3xl border border-white/[0.06] bg-black/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
          <Radar className="h-4 w-4 text-sky-300" />
          回放预检
        </div>
        <Button variant="outline" size="sm" onClick={onPrecheck} disabled={isPrechecking} className="gap-2">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {isPrechecking ? "检查中..." : "立即预检"}
        </Button>
      </div>
      <div className="space-y-2">
        {issues.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-4 text-sm text-zinc-500">
            暂无预检结果。建议在生成工作流前先跑一遍。
          </div>
        ) : (
          issues.map((issue) => (
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
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>{issue.message}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RecorderSuggestionPanel({
  suggestions,
  selectedSuggestionIds,
  isAnalyzing,
  onAnalyze,
  onToggleSuggestion,
}: {
  suggestions: RecorderExtractSuggestion[];
  selectedSuggestionIds: string[];
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onToggleSuggestion: (suggestionId: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 rounded-3xl border border-white/[0.06] bg-black/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
          <Sparkles className="h-4 w-4 text-sky-300" />
          智能提取推荐
        </div>
        <Button variant="outline" size="sm" onClick={onAnalyze} disabled={isAnalyzing} className="gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          {isAnalyzing ? "分析中..." : "分析页面"}
        </Button>
      </div>
      <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
        {suggestions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-4 text-sm text-zinc-500">
            还没有推荐。通常在主流程录完后再点一次“分析页面”效果最好。
          </div>
        ) : (
          suggestions.map((suggestion) => {
            const checked = selectedSuggestionIds.includes(suggestion.id);
            return (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => onToggleSuggestion(suggestion.id)}
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
                    <div className="mt-1 break-all font-mono text-[11px] text-zinc-400">
                      {suggestion.selector}
                    </div>
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
  );
}
