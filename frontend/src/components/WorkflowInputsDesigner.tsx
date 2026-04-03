import { KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
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
                  <select
                    value={field.type}
                    onChange={(event) =>
                      onInputSchemaChange(
                        inputSchema.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                type: event.target.value as WorkflowInputField["type"],
                                options: event.target.value === "select" ? item.options ?? [] : [],
                              }
                            : item,
                        ),
                      )
                    }
                    className="flex h-10 rounded-md border border-white/[0.06] bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200"
                  >
                    <option value="text">单行文本</option>
                    <option value="textarea">多行文本</option>
                    <option value="password">密码</option>
                    <option value="number">数字</option>
                    <option value="select">下拉选择</option>
                    <option value="date">日期</option>
                    <option value="email">邮箱</option>
                  </select>
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

                {field.type === "select" && (
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
                )}

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
                  <select
                    value={credential.type}
                    onChange={(event) =>
                      onCredentialRequirementsChange(
                        credentialRequirements.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, type: event.target.value as WorkflowCredentialRequirement["type"] }
                            : item,
                        ),
                      )
                    }
                    className="flex h-10 rounded-md border border-white/[0.06] bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200"
                  >
                    <option value="account">账号密码</option>
                    <option value="api_key">API Key</option>
                    <option value="cookie">Cookie</option>
                    <option value="smtp">SMTP</option>
                    <option value="custom">自定义</option>
                  </select>
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
