import { KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { Switch } from "@/src/components/ui/Switch";
import {
  WorkflowCredentialRequirement,
  WorkflowInputField,
  WorkflowInputFieldOption,
} from "@/src/lib/cloudflow";

interface WorkflowInputsDesignerProps {
  inputSchema: WorkflowInputField[];
  credentialRequirements: WorkflowCredentialRequirement[];
  onInputSchemaChange: (next: WorkflowInputField[]) => void;
  onCredentialRequirementsChange: (next: WorkflowCredentialRequirement[]) => void;
}

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

function toOptionsString(options?: WorkflowInputFieldOption[]) {
  return (options ?? []).map((option) => `${option.label}:${option.value}`).join(", ");
}

function parseOptionsString(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [label, rawValue] = item.split(":").map((segment) => segment.trim());
      return {
        label: label || rawValue || item,
        value: rawValue || label || item,
      };
    });
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
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-200">运行参数</div>
            <div className="text-xs text-zinc-500">
              执行前会展示成表单，节点里可以直接引用 <code>{`{{inputs.key}}`}</code>。
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
          <div className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] p-4 text-sm text-zinc-500">
            还没有定义运行参数。适合把账号、关键词、日期、邮箱、店铺名这类因用户而异的值抽离出来。
          </div>
        ) : (
          <div className="space-y-4">
            {inputSchema.map((field, index) => (
              <div
                key={`${field.key}-${index}`}
                className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-zinc-200">{field.label || "未命名参数"}</div>
                  <button
                    type="button"
                    className="text-zinc-500 transition-colors hover:text-red-300"
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
                        inputSchema.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, label: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="参数标题"
                  />
                  <Input
                    value={field.key}
                    onChange={(event) =>
                      onInputSchemaChange(
                        inputSchema.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, key: event.target.value.replace(/\s+/g, "_") } : item,
                        ),
                      )
                    }
                    placeholder="变量 key，例如 username"
                  />
                  <Select
                    value={field.type}
                    onChange={(value) =>
                      onInputSchemaChange(
                        inputSchema.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                type: value as WorkflowInputField["type"],
                                options: value === "select" ? item.options ?? [] : [],
                              }
                            : item,
                        ),
                      )
                    }
                    options={[
                      { value: "text", label: "单行文本" },
                      { value: "textarea", label: "多行文本" },
                      { value: "password", label: "密码" },
                      { value: "number", label: "数字" },
                      { value: "select", label: "下拉选择" },
                      { value: "date", label: "日期" },
                      { value: "email", label: "邮箱" },
                    ]}
                  />
                  <Input
                    value={field.defaultValue ?? ""}
                    onChange={(event) =>
                      onInputSchemaChange(
                        inputSchema.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, defaultValue: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="默认值"
                  />
                  <Input
                    value={field.placeholder ?? ""}
                    onChange={(event) =>
                      onInputSchemaChange(
                        inputSchema.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, placeholder: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="输入提示"
                  />
                  <Input
                    value={field.description ?? ""}
                    onChange={(event) =>
                      onInputSchemaChange(
                        inputSchema.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, description: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="字段说明"
                  />
                </div>

                {field.type === "select" ? (
                  <Input
                    value={toOptionsString(field.options)}
                    onChange={(event) =>
                      onInputSchemaChange(
                        inputSchema.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, options: parseOptionsString(event.target.value) } : item,
                        ),
                      )
                    }
                    placeholder="选项格式：显示名:值，例如 成功:success"
                  />
                ) : null}

                <div className="flex flex-wrap items-center gap-6 text-sm">
                  <label className="flex items-center gap-3 text-zinc-300">
                    <Switch
                      checked={Boolean(field.required)}
                      onCheckedChange={(checked) =>
                        onInputSchemaChange(
                          inputSchema.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, required: checked } : item,
                          ),
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
                          inputSchema.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, sensitive: checked } : item,
                          ),
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
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <KeyRound className="h-4 w-4 text-amber-300" />
              凭据需求
            </div>
            <div className="text-xs text-zinc-500">
              先作为模板说明和结构预留，后续可接凭据库与权限控制。
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() =>
              onCredentialRequirementsChange([...credentialRequirements, createCredentialRequirement()])
            }
          >
            <Plus className="h-3.5 w-3.5" />
            添加凭据需求
          </Button>
        </div>

        {credentialRequirements.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] p-4 text-sm text-zinc-500">
            还没有声明凭据需求。可以先标注平台账号、Cookie、API Key、SMTP 等外部依赖。
          </div>
        ) : (
          <div className="space-y-4">
            {credentialRequirements.map((credential, index) => (
              <div
                key={`${credential.key}-${index}`}
                className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-zinc-200">{credential.label || "未命名凭据"}</div>
                  <button
                    type="button"
                    className="text-zinc-500 transition-colors hover:text-red-300"
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
                        credentialRequirements.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, label: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="凭据标题"
                  />
                  <Input
                    value={credential.key}
                    onChange={(event) =>
                      onCredentialRequirementsChange(
                        credentialRequirements.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, key: event.target.value.replace(/\s+/g, "_") } : item,
                        ),
                      )
                    }
                    placeholder="凭据 key，例如 taobao_account"
                  />
                  <Select
                    value={credential.type}
                    onChange={(value) =>
                      onCredentialRequirementsChange(
                        credentialRequirements.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, type: value as WorkflowCredentialRequirement["type"] }
                            : item,
                        ),
                      )
                    }
                    options={[
                      { value: "account", label: "账号密码" },
                      { value: "api_key", label: "API Key" },
                      { value: "cookie", label: "Cookie" },
                      { value: "smtp", label: "SMTP" },
                      { value: "custom", label: "自定义" },
                    ]}
                  />
                  <Input
                    value={credential.provider ?? ""}
                    onChange={(event) =>
                      onCredentialRequirementsChange(
                        credentialRequirements.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, provider: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="提供方，例如 淘宝 / Gmail / OpenAI"
                  />
                </div>

                <Input
                  value={credential.description ?? ""}
                  onChange={(event) =>
                    onCredentialRequirementsChange(
                      credentialRequirements.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, description: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder="凭据用途说明"
                />

                <label className="flex items-center gap-3 text-sm text-zinc-300">
                  <Switch
                    checked={Boolean(credential.required)}
                    onCheckedChange={(checked) =>
                      onCredentialRequirementsChange(
                        credentialRequirements.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, required: checked } : item,
                        ),
                      )
                    }
                  />
                  必填凭据
                </label>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
