import { KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { Switch } from "@/src/components/ui/Switch";
import {
  WorkflowCredentialRequirement,
  WorkflowCredentialRequirementType,
  WorkflowInputField,
  WorkflowInputFieldOption,
  WorkflowInputFieldType,
} from "@/src/lib/cloudflow";

interface WorkflowInputsDesignerProps {
  inputSchema: WorkflowInputField[];
  credentialRequirements: WorkflowCredentialRequirement[];
  onInputSchemaChange: (next: WorkflowInputField[]) => void;
  onCredentialRequirementsChange: (next: WorkflowCredentialRequirement[]) => void;
}

const INPUT_TYPE_OPTIONS: Array<{ value: WorkflowInputFieldType; label: string; description: string }> = [
  { value: "text", label: "单行文本", description: "适合关键词、用户名、链接等普通输入" },
  { value: "textarea", label: "多行文本", description: "适合长提示词、备注或大段说明" },
  { value: "password", label: "密码", description: "输入框会自动隐藏内容并在快照中脱敏" },
  { value: "number", label: "数字", description: "适合数量、间隔、页码等数字参数" },
  { value: "select", label: "下拉选项", description: "从预设选项里选择，避免用户填错" },
  { value: "date", label: "日期", description: "适合账期、开始日期、结束日期" },
  { value: "email", label: "邮箱", description: "适合通知邮箱、收件人等场景" },
];

const CREDENTIAL_TYPE_OPTIONS: Array<{
  value: WorkflowCredentialRequirementType;
  label: string;
  description: string;
}> = [
  { value: "account", label: "账号密码", description: "用户名 / 密码类登录凭据" },
  { value: "api_key", label: "API Key", description: "第三方接口密钥、令牌等" },
  { value: "cookie", label: "Cookie", description: "适合已登录态或会话注入" },
  { value: "smtp", label: "SMTP", description: "邮件发送服务器账号配置" },
  { value: "custom", label: "自定义", description: "自定义字段结构，适合特殊平台" },
];

const CREDENTIAL_TEMPLATE_FIELDS: Record<WorkflowCredentialRequirementType, string[]> = {
  account: ["username", "password"],
  api_key: ["apiKey"],
  cookie: ["cookie"],
  smtp: ["host", "port", "user", "pass", "from", "secure"],
  custom: ["token", "secret", "value"],
};

function createInputField(): WorkflowInputField {
  return {
    key: `field_${Date.now()}`,
    label: "新参数",
    type: "text",
    required: false,
    sensitive: false,
    placeholder: "",
    description: "",
    defaultValue: "",
    options: [],
  };
}

function createCredentialRequirement(): WorkflowCredentialRequirement {
  return {
    key: `credential_${Date.now()}`,
    label: "新凭据需求",
    type: "custom",
    required: false,
    provider: "",
    description: "",
  };
}

function createInputOption(): WorkflowInputFieldOption {
  return {
    label: "新选项",
    value: "new_option",
  };
}

function normalizeKey(value: string) {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_");
}

function updateAt<T>(items: T[], index: number, nextValue: T) {
  return items.map((item, itemIndex) => (itemIndex === index ? nextValue : item));
}

function getCredentialExamples(requirement: WorkflowCredentialRequirement) {
  const fields = CREDENTIAL_TEMPLATE_FIELDS[requirement.type] ?? CREDENTIAL_TEMPLATE_FIELDS.custom;
  const requirementKey = requirement.key || "credential_key";
  return fields.map((field) => `{{credentials.${requirementKey}.${field}}}`);
}

export function WorkflowInputsDesigner({
  inputSchema,
  credentialRequirements,
  onInputSchemaChange,
  onCredentialRequirementsChange,
}: WorkflowInputsDesignerProps) {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-zinc-200">运行参数</div>
            <div className="mt-1 text-xs leading-6 text-zinc-500">
              工作流启动前会自动生成表单。节点里可以直接引用
              <code className="mx-1 rounded bg-black/20 px-1.5 py-0.5 text-sky-200">{`{{inputs.key}}`}</code>
              来读取用户填写的值。
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => onInputSchemaChange([...inputSchema, createInputField()])}
          >
            <Plus className="h-3.5 w-3.5" />
            添加参数
          </Button>
        </div>

        {inputSchema.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-4 text-sm text-zinc-500">
            还没有定义运行参数。适合把账号、关键词、日期、邮箱、店铺名这类“每次运行可能不同”的内容抽离出来。
          </div>
        ) : (
          <div className="space-y-4">
            {inputSchema.map((field, index) => (
              <div
                key={`${field.key}-${index}`}
                className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-100">
                      {field.label || "未命名参数"}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">{field.key || "请填写参数 key"}</div>
                  </div>
                  <button
                    type="button"
                    className="rounded-full p-1 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
                    onClick={() => onInputSchemaChange(inputSchema.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    value={field.label}
                    onChange={(event) =>
                      onInputSchemaChange(
                        updateAt(inputSchema, index, { ...field, label: event.target.value }),
                      )
                    }
                    placeholder="参数标题，例如：店铺名称"
                  />
                  <Input
                    value={field.key}
                    onChange={(event) =>
                      onInputSchemaChange(
                        updateAt(inputSchema, index, {
                          ...field,
                          key: normalizeKey(event.target.value),
                        }),
                      )
                    }
                    placeholder="参数 key，例如：shop_name"
                  />
                  <Select
                    value={field.type}
                    onChange={(value) =>
                      onInputSchemaChange(
                        updateAt(inputSchema, index, {
                          ...field,
                          type: value as WorkflowInputFieldType,
                          options: value === "select" ? field.options ?? [] : [],
                        }),
                      )
                    }
                    options={INPUT_TYPE_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                      description: option.description,
                    }))}
                  />
                  <Input
                    value={field.defaultValue ?? ""}
                    onChange={(event) =>
                      onInputSchemaChange(
                        updateAt(inputSchema, index, { ...field, defaultValue: event.target.value }),
                      )
                    }
                    placeholder="默认值，可留空"
                  />
                  <Input
                    value={field.placeholder ?? ""}
                    onChange={(event) =>
                      onInputSchemaChange(
                        updateAt(inputSchema, index, { ...field, placeholder: event.target.value }),
                      )
                    }
                    placeholder="输入提示，例如：请输入店铺链接"
                  />
                  <Input
                    value={field.description ?? ""}
                    onChange={(event) =>
                      onInputSchemaChange(
                        updateAt(inputSchema, index, { ...field, description: event.target.value }),
                      )
                    }
                    placeholder="参数说明，例如：用于搜索页面中的店铺关键词"
                  />
                </div>

                {field.type === "select" ? (
                  <div className="space-y-3 rounded-xl border border-white/[0.06] bg-black/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-zinc-200">下拉选项</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          直接填写“显示名”和“实际值”，用户运行时只会看到显示名。
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() =>
                          onInputSchemaChange(
                            updateAt(inputSchema, index, {
                              ...field,
                              options: [...(field.options ?? []), createInputOption()],
                            }),
                          )
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                        添加选项
                      </Button>
                    </div>

                    {(field.options ?? []).length === 0 ? (
                      <div className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-3 text-xs text-zinc-500">
                        还没有配置选项。至少添加一项，运行时用户才能从下拉中选择。
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(field.options ?? []).map((option, optionIndex) => (
                          <div key={`${option.value}-${optionIndex}`} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
                            <Input
                              value={option.label}
                              onChange={(event) =>
                                onInputSchemaChange(
                                  updateAt(inputSchema, index, {
                                    ...field,
                                    options: (field.options ?? []).map((item, itemIndex) =>
                                      itemIndex === optionIndex
                                        ? { ...item, label: event.target.value }
                                        : item,
                                    ),
                                  }),
                                )
                              }
                              placeholder="显示名，例如：成功"
                            />
                            <Input
                              value={option.value}
                              onChange={(event) =>
                                onInputSchemaChange(
                                  updateAt(inputSchema, index, {
                                    ...field,
                                    options: (field.options ?? []).map((item, itemIndex) =>
                                      itemIndex === optionIndex
                                        ? { ...item, value: event.target.value }
                                        : item,
                                    ),
                                  }),
                                )
                              }
                              placeholder="实际值，例如：success"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              className="justify-center text-red-300 hover:bg-red-500/10 hover:text-red-200"
                              onClick={() =>
                                onInputSchemaChange(
                                  updateAt(inputSchema, index, {
                                    ...field,
                                    options: (field.options ?? []).filter((_, itemIndex) => itemIndex !== optionIndex),
                                  }),
                                )
                              }
                            >
                              删除
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-6 text-sm">
                  <label className="flex items-center gap-3 text-zinc-300">
                    <Switch
                      checked={Boolean(field.required)}
                      onCheckedChange={(checked) =>
                        onInputSchemaChange(
                          updateAt(inputSchema, index, { ...field, required: checked }),
                        )
                      }
                    />
                    必填
                  </label>
                  <label className="flex items-center gap-3 text-zinc-300">
                    <Switch
                      checked={Boolean(field.sensitive)}
                      onCheckedChange={(checked) =>
                        onInputSchemaChange(
                          updateAt(inputSchema, index, { ...field, sensitive: checked }),
                        )
                      }
                    />
                    敏感字段
                  </label>
                </div>

                <div className="rounded-lg border border-sky-500/10 bg-sky-500/5 px-3 py-2 text-xs text-sky-200">
                  节点里引用示例：
                  <code className="ml-1">{`{{inputs.${field.key || "your_key"}}}`}</code>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 border-t border-white/[0.05] pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <KeyRound className="h-4 w-4 text-amber-300" />
              凭据需求
            </div>
            <div className="mt-1 text-xs leading-6 text-zinc-500">
              先声明这个工作流执行时需要哪些凭据，运行时用户再从凭据库里选择具体绑定项。
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() =>
              onCredentialRequirementsChange([
                ...credentialRequirements,
                createCredentialRequirement(),
              ])
            }
          >
            <Plus className="h-3.5 w-3.5" />
            添加凭据需求
          </Button>
        </div>

        {credentialRequirements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-4 text-sm text-zinc-500">
            还没有声明凭据需求。可以先标注平台账号、Cookie、API Key、SMTP 等外部依赖。
          </div>
        ) : (
          <div className="space-y-4">
            {credentialRequirements.map((credential, index) => (
              <div
                key={`${credential.key}-${index}`}
                className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-100">
                      {credential.label || "未命名凭据需求"}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">{credential.key || "请填写凭据 key"}</div>
                  </div>
                  <button
                    type="button"
                    className="rounded-full p-1 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
                    onClick={() =>
                      onCredentialRequirementsChange(
                        credentialRequirements.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    value={credential.label}
                    onChange={(event) =>
                      onCredentialRequirementsChange(
                        updateAt(credentialRequirements, index, {
                          ...credential,
                          label: event.target.value,
                        }),
                      )
                    }
                    placeholder="凭据标题，例如：淘宝店铺账号"
                  />
                  <Input
                    value={credential.key}
                    onChange={(event) =>
                      onCredentialRequirementsChange(
                        updateAt(credentialRequirements, index, {
                          ...credential,
                          key: normalizeKey(event.target.value),
                        }),
                      )
                    }
                    placeholder="凭据 key，例如：taobao_account"
                  />
                  <Select
                    value={credential.type}
                    onChange={(value) =>
                      onCredentialRequirementsChange(
                        updateAt(credentialRequirements, index, {
                          ...credential,
                          type: value as WorkflowCredentialRequirementType,
                        }),
                      )
                    }
                    options={CREDENTIAL_TYPE_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                      description: option.description,
                    }))}
                  />
                  <Input
                    value={credential.provider ?? ""}
                    onChange={(event) =>
                      onCredentialRequirementsChange(
                        updateAt(credentialRequirements, index, {
                          ...credential,
                          provider: event.target.value,
                        }),
                      )
                    }
                    placeholder="提供方，例如：淘宝 / Gmail / OpenAI"
                  />
                </div>

                <Input
                  value={credential.description ?? ""}
                  onChange={(event) =>
                    onCredentialRequirementsChange(
                      updateAt(credentialRequirements, index, {
                        ...credential,
                        description: event.target.value,
                      }),
                    )
                  }
                  placeholder="用途说明，例如：用于登录后台后抓取订单状态"
                />

                <label className="flex items-center gap-3 text-sm text-zinc-300">
                  <Switch
                    checked={Boolean(credential.required)}
                    onCheckedChange={(checked) =>
                      onCredentialRequirementsChange(
                        updateAt(credentialRequirements, index, {
                          ...credential,
                          required: checked,
                        }),
                      )
                    }
                  />
                  必填凭据
                </label>

                <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 px-3 py-3 text-xs text-amber-100">
                  <div className="font-medium">节点里可引用的凭据模板变量</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {getCredentialExamples(credential).map((example) => (
                      <code key={example} className="rounded-full border border-amber-400/10 bg-black/20 px-2 py-1">
                        {example}
                      </code>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
