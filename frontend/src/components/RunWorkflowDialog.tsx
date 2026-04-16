import { AlertTriangle, KeyRound, Play } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/Dialog";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import {
  CredentialRecord,
  WorkflowCredentialRequirement,
  WorkflowInputField,
} from "@/src/lib/cloudflow";

interface RunWorkflowDialogProps {
  open: boolean;
  workflowName: string;
  inputSchema: WorkflowInputField[];
  credentialRequirements: WorkflowCredentialRequirement[];
  credentials: CredentialRecord[];
  values: Record<string, string>;
  credentialBindings: Record<string, string>;
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onValuesChange: (next: Record<string, string>) => void;
  onCredentialBindingsChange: (next: Record<string, string>) => void;
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

function matchesRequirement(
  credential: CredentialRecord,
  requirement: WorkflowCredentialRequirement,
) {
  const requirementProvider = requirement.provider?.trim().toLowerCase();
  const credentialProvider = credential.provider?.trim().toLowerCase();

  if (requirement.type !== "custom" && credential.type !== requirement.type) {
    return false;
  }

  if (requirementProvider && credentialProvider && requirementProvider !== credentialProvider) {
    return false;
  }

  return true;
}

export function RunWorkflowDialog({
  open,
  workflowName,
  inputSchema,
  credentialRequirements,
  credentials,
  values,
  credentialBindings,
  isSubmitting = false,
  onOpenChange,
  onValuesChange,
  onCredentialBindingsChange,
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

  const credentialErrors = credentialRequirements.reduce<Record<string, string>>((acc, requirement) => {
    const bindingId = credentialBindings[requirement.key] ?? "";
    const availableOptions = credentials.filter((credential) => matchesRequirement(credential, requirement));

    if (requirement.required && !bindingId) {
      acc[requirement.key] = `请为 ${requirement.label} 选择凭据`;
      return acc;
    }

    if (bindingId && !availableOptions.some((credential) => credential.id === bindingId)) {
      acc[requirement.key] = "当前选择的凭据与需求不匹配，请重新选择";
    }

    return acc;
  }, {});

  const canSubmit = Object.keys(fieldErrors).length === 0 && Object.keys(credentialErrors).length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>启动工作流</DialogTitle>
        <DialogDescription>
          填写本次执行需要的参数，并选择要绑定的凭据后即可启动。
        </DialogDescription>
      </DialogHeader>
      <DialogContent className="space-y-6">
        <div className="rounded-2xl border border-sky-500/10 bg-sky-500/5 px-4 py-3 text-sm text-sky-100">
          即将执行：{workflowName}
        </div>

        {hasCredentials ? (
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <KeyRound className="h-4 w-4 text-amber-300" />
              凭据绑定
            </div>
            <div className="space-y-3">
              {credentialRequirements.map((requirement) => {
                const availableCredentials = credentials.filter((credential) =>
                  matchesRequirement(credential, requirement),
                );
                const selectedCredential = availableCredentials.find(
                  (credential) => credential.id === credentialBindings[requirement.key],
                );

                return (
                  <div
                    key={requirement.key}
                    className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-zinc-100">{requirement.label}</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {[requirement.type, requirement.provider].filter(Boolean).join(" / ") || "未指定类型"}
                        </div>
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {requirement.required ? "必填" : "可选"}
                      </div>
                    </div>

                    {requirement.description ? (
                      <div className="mt-2 text-xs leading-5 text-zinc-400">{requirement.description}</div>
                    ) : null}

                    <div className="mt-3">
                      <Select
                        value={credentialBindings[requirement.key] ?? ""}
                        onChange={(value) =>
                          onCredentialBindingsChange({
                            ...credentialBindings,
                            [requirement.key]: value,
                          })
                        }
                        placeholder={
                          availableCredentials.length > 0 ? "请选择一个凭据" : "暂无可匹配的凭据"
                        }
                        searchable
                        options={availableCredentials.map((credential) => ({
                          value: credential.id,
                          label: credential.name,
                          description: [credential.provider, credential.key]
                            .filter(Boolean)
                            .join(" / "),
                        }))}
                      />
                    </div>

                    {selectedCredential ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {Object.entries(selectedCredential.maskedPayload ?? {}).map(([key, value]) => (
                          <div
                            key={key}
                            className="rounded-full border border-white/[0.08] bg-black/20 px-2.5 py-1 text-[11px] text-zinc-300"
                          >
                            {key}: {value || "空"}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {credentialErrors[requirement.key] ? (
                      <div className="mt-2 text-xs text-red-300">{credentialErrors[requirement.key]}</div>
                    ) : null}

                    {availableCredentials.length === 0 ? (
                      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-500/10 bg-amber-500/5 px-3 py-3 text-xs text-amber-100">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        当前凭据库里没有匹配这项需求的凭据。请先到工作流设置中的“参数与凭据”页创建凭据。
                      </div>
                    ) : null}
                  </div>
                );
              })}
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
                  {fieldErrors[field.key] ? (
                    <div className="text-xs text-red-300">{fieldErrors[field.key]}</div>
                  ) : null}
                  {field.description ? (
                    <div className="text-xs leading-5 text-zinc-500">{field.description}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!hasForm && !hasCredentials ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm text-zinc-500">
            这个工作流没有额外的运行参数和凭据要求，可以直接启动。
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
