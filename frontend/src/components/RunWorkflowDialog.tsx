import { AlertTriangle, KeyRound, Play } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/Dialog";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { WorkflowCredentialRequirement, WorkflowInputField } from "@/src/lib/cloudflow";

interface RunWorkflowDialogProps {
  open: boolean;
  workflowName: string;
  inputSchema: WorkflowInputField[];
  credentialRequirements: WorkflowCredentialRequirement[];
  values: Record<string, string>;
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onValuesChange: (next: Record<string, string>) => void;
  onSubmit: () => void | Promise<void>;
}

function renderField(field: WorkflowInputField, value: string, onChange: (nextValue: string) => void) {
  if (field.type === "textarea") {
    return (
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        className="min-h-24 w-full rounded-xl border border-white/[0.08] bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
      />
    );
  }

  if (field.type === "select") {
    return (
      <Select
        value={value}
        onChange={onChange}
        placeholder="请选择"
        options={(field.options ?? []).map((option) => ({
          value: option.value,
          label: option.label,
        }))}
      />
    );
  }

  return (
    <Input
      type={field.type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder}
    />
  );
}

export function RunWorkflowDialog({
  open,
  workflowName,
  inputSchema,
  credentialRequirements,
  values,
  isSubmitting = false,
  onOpenChange,
  onValuesChange,
  onSubmit,
}: RunWorkflowDialogProps) {
  const hasForm = inputSchema.length > 0;
  const hasCredentials = credentialRequirements.length > 0;

  const fieldErrors = inputSchema.reduce<Record<string, string>>((acc, field) => {
    const value = values[field.key] ?? "";

    if (field.required && !value.trim()) {
      acc[field.key] = `请填写 ${field.label}`;
      return acc;
    }

    if (
      field.type === "select" &&
      value &&
      field.options?.length &&
      !field.options.some((option) => option.value === value)
    ) {
      acc[field.key] = "请选择有效选项";
    }

    return acc;
  }, {});

  const canSubmit = Object.keys(fieldErrors).length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>启动工作流</DialogTitle>
        <DialogDescription>填写本次执行所需的输入参数后即可开始运行。</DialogDescription>
      </DialogHeader>
      <DialogContent className="space-y-6">
        <div className="rounded-2xl border border-sky-500/10 bg-sky-500/5 px-4 py-3 text-sm text-sky-100">
          即将执行：{workflowName}
        </div>

        {hasCredentials ? (
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <KeyRound className="h-4 w-4 text-amber-300" />
              凭据准备
            </div>
            <div className="space-y-3">
              {credentialRequirements.map((credential) => (
                <div key={credential.key} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-zinc-100">{credential.label}</div>
                    <div className="text-[11px] text-zinc-500">{credential.required ? "必填" : "可选"}</div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {[credential.type, credential.provider].filter(Boolean).join(" / ") || "未指定类型"}
                  </div>
                  {credential.description ? <div className="mt-2 text-xs text-zinc-400">{credential.description}</div> : null}
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 rounded-2xl border border-amber-500/10 bg-amber-500/5 px-3 py-3 text-xs text-amber-100">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              当前版本先展示凭据要求说明，真正的凭据库与绑定能力会在下一阶段接入。
            </div>
          </section>
        ) : null}

        {hasForm ? (
          <section className="space-y-4">
            <div className="text-sm font-medium text-zinc-200">运行参数</div>
            <div className="space-y-4">
              {inputSchema.map((field) => (
                <div key={field.key} className="space-y-2">
                  <label className="block text-sm text-zinc-300">
                    {field.label}
                    {field.required ? <span className="ml-1 text-red-300">*</span> : null}
                  </label>
                  {renderField(field, values[field.key] ?? "", (nextValue) =>
                    onValuesChange({ ...values, [field.key]: nextValue }),
                  )}
                  {fieldErrors[field.key] ? <div className="text-xs text-red-300">{fieldErrors[field.key]}</div> : null}
                  {field.description ? <div className="text-xs text-zinc-500">{field.description}</div> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!hasForm && !hasCredentials ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm text-zinc-500">
            这个工作流没有额外的运行参数，可以直接启动。
          </div>
        ) : null}
      </DialogContent>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
          取消
        </Button>
        <Button onClick={() => void onSubmit()} disabled={isSubmitting || !canSubmit} className="gap-2">
          <Play className="h-4 w-4 fill-current" />
          {isSubmitting ? "启动中..." : "确认启动"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
