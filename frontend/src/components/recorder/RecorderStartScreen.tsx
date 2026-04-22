import { Bot, CheckCircle2, Play } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { OUTPUT_MODE_OPTIONS } from "./shared";

interface RecorderStartScreenProps {
  targetUrl: string;
  workflowName: string;
  outputMode: "workflow" | "template";
  showGuide: boolean;
  isStarting: boolean;
  onTargetUrlChange: (value: string) => void;
  onWorkflowNameChange: (value: string) => void;
  onOutputModeChange: (value: "workflow" | "template") => void;
  onStart: () => void;
  onDismissGuide: () => void;
}

export function RecorderStartScreen({
  targetUrl,
  workflowName,
  outputMode,
  showGuide,
  isStarting,
  onTargetUrlChange,
  onWorkflowNameChange,
  onOutputModeChange,
  onStart,
  onDismissGuide,
}: RecorderStartScreenProps) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.9fr]">
      <div className="space-y-4 rounded-3xl border border-white/[0.06] bg-black/20 p-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium text-zinc-100">起始页面</div>
            <Input
              value={targetUrl}
              onChange={(event) => onTargetUrlChange(event.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-zinc-100">工作流名称</div>
            <Input
              value={workflowName}
              onChange={(event) => onWorkflowNameChange(event.target.value)}
              placeholder="录制生成的工作流"
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          <div className="space-y-2">
            <div className="text-sm font-medium text-zinc-100">输出模式</div>
            <Select
              value={outputMode}
              onChange={(value) => onOutputModeChange(value as "workflow" | "template")}
              options={OUTPUT_MODE_OPTIONS}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={onStart} disabled={isStarting || !targetUrl.trim()} className="w-full gap-2">
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
            <div className="mt-3">1. 输入一个起始页面并启动录制。</div>
            <div>2. 直接在实时画面上点击、输入、按键、滚动。</div>
            <div>3. 录制完成后可继续轻编辑、参数化、预检，再生成完整工作流。</div>
            <Button variant="outline" size="sm" onClick={onDismissGuide} className="mt-4 gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              我知道了
            </Button>
          </div>
        ) : null}

        <div className="rounded-3xl border border-white/[0.06] bg-black/20 p-5 text-sm leading-7 text-zinc-300">
          <div className="font-medium text-zinc-100">当前录制器能力</div>
          <div className="mt-2">
            支持录制后轻编辑、输入变量化、实时画面预览、动作块编排、预检、智能提取推荐，以及直接生成工作流或模板。
          </div>
        </div>
      </div>
    </div>
  );
}
