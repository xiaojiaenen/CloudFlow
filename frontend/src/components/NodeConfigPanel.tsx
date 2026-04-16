import { useEffect, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { ArrowRight, KeyRound, Wand2, X } from "lucide-react";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { WorkflowCredentialRequirement, WorkflowInputField } from "@/src/lib/cloudflow";
import { getNodeDefinition } from "@/src/registry/nodes";

interface NodeConfigPanelProps {
  nodeId: string;
  inputSchema: WorkflowInputField[];
  credentialRequirements: WorkflowCredentialRequirement[];
  onClose: () => void;
}

const CREDENTIAL_FIELD_OPTIONS: Record<WorkflowCredentialRequirement["type"], string[]> = {
  account: ["username", "password"],
  api_key: ["apiKey"],
  cookie: ["cookie"],
  smtp: ["host", "port", "user", "pass", "from", "secure"],
  custom: ["token", "secret", "value"],
};

function appendTemplate(currentValue: string, template: string) {
  if (!currentValue.trim()) {
    return template;
  }

  if (currentValue.includes(template)) {
    return currentValue;
  }

  return `${currentValue}${currentValue.endsWith(" ") ? "" : " "}${template}`;
}

function buildNodeParamsPreview(definitionFields: NonNullable<ReturnType<typeof getNodeDefinition>>["fields"], data: Record<string, unknown>) {
  const fieldMap = new Map(definitionFields.map((field) => [field.name, field]));

  return Object.entries(data)
    .filter(
      ([key, value]) =>
        !["label", "type", "status", "params", "clientNodeId"].includes(key) &&
        value !== undefined &&
        value !== "",
    )
    .map(([key, value]) => {
      const field = fieldMap.get(key);
      const displayValue =
        field?.options?.find((option) => option.value === String(value))?.label ?? String(value);
      return `${field?.label ?? key}: ${displayValue}`;
    })
    .join("，");
}

export function NodeConfigPanel({
  nodeId,
  inputSchema,
  credentialRequirements,
  onClose,
}: NodeConfigPanelProps) {
  const { getNode, updateNodeData } = useReactFlow();
  const node = getNode(nodeId);
  const [localData, setLocalData] = useState<Record<string, unknown>>({});
  const [inputSelections, setInputSelections] = useState<Record<string, string>>({});
  const [credentialSelections, setCredentialSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    if (node) {
      setLocalData(node.data || {});
      setInputSelections({});
      setCredentialSelections({});
    }
  }, [node, nodeId]);

  const nodeType = node?.data.type as string | undefined;
  const definition = useMemo(() => getNodeDefinition(nodeType ?? ""), [nodeType]);

  const credentialVariableOptions = useMemo(
    () =>
      credentialRequirements.flatMap((requirement) =>
        (CREDENTIAL_FIELD_OPTIONS[requirement.type] ?? CREDENTIAL_FIELD_OPTIONS.custom).map((fieldName) => ({
          value: `{{credentials.${requirement.key}.${fieldName}}}`,
          label: `${requirement.label || requirement.key} · ${fieldName}`,
          description: requirement.provider
            ? `${requirement.provider} / ${requirement.type}`
            : requirement.type,
          group: requirement.label || requirement.key || "凭据变量",
        })),
      ),
    [credentialRequirements],
  );

  if (!node || !definition) {
    return null;
  }

  const commitNodeData = (nextData: Record<string, unknown>) => {
    const nextPayload = {
      ...nextData,
      params: buildNodeParamsPreview(definition.fields, nextData),
    };
    setLocalData(nextPayload);
    updateNodeData(nodeId, nextPayload);
  };

  const handleChange = (key: string, value: string) => {
    commitNodeData({
      ...localData,
      [key]: value,
    });
  };

  const insertInputTemplate = (fieldName: string) => {
    const selectedKey = inputSelections[fieldName];
    if (!selectedKey) {
      return;
    }

    handleChange(
      fieldName,
      appendTemplate(String(localData[fieldName] ?? ""), `{{inputs.${selectedKey}}}`),
    );
  };

  const insertCredentialTemplate = (fieldName: string) => {
    const template = credentialSelections[fieldName];
    if (!template) {
      return;
    }

    handleChange(fieldName, appendTemplate(String(localData[fieldName] ?? ""), template));
  };

  return (
    <div className="flex h-full w-[420px] flex-col bg-[#0A0A0A] shadow-2xl">
      <div className="flex h-14 items-center justify-between border-b border-white/[0.08] px-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-zinc-200">
            配置节点：{String(localData.label || definition.label)}
          </h3>
          <div className="mt-1 truncate text-[11px] text-zinc-500">{definition.category}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="rounded-2xl border border-sky-500/10 bg-sky-500/5 px-3 py-3 text-xs leading-6 text-sky-100">
          <div className="font-medium">{definition.description ?? "配置这个节点的执行参数。"}</div>
          <div className="mt-2">
            支持引用
            <code className="mx-1 rounded bg-black/20 px-1.5 py-0.5">{`{{inputs.xxx}}`}</code>
            <code className="mr-1 rounded bg-black/20 px-1.5 py-0.5">{`{{variables.xxx}}`}</code>
            和
            <code className="ml-1 rounded bg-black/20 px-1.5 py-0.5">{`{{credentials.xxx.field}}`}</code>。
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-zinc-400">节点名称</label>
            <Input
              value={String(localData.label || "")}
              onChange={(event) => handleChange("label", event.target.value)}
              placeholder="给这个节点起个更容易识别的名字"
            />
          </div>

          {definition.fields.map((field) => {
            const currentValue = String(localData[field.name] ?? field.defaultValue ?? "");
            const isTextField = field.type === "text";

            return (
              <div key={field.name} className="space-y-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-200">{field.label}</label>
                  {field.description ? (
                    <div className="text-xs leading-5 text-zinc-500">{field.description}</div>
                  ) : null}
                </div>

                {field.type === "select" ? (
                  <Select
                    value={currentValue}
                    onChange={(value) => handleChange(field.name, value)}
                    options={(field.options ?? []).map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                  />
                ) : (
                  <Input
                    type={field.type === "number" ? "number" : "text"}
                    value={currentValue}
                    onChange={(event) => handleChange(field.name, event.target.value)}
                    placeholder={field.placeholder}
                  />
                )}

                {isTextField && inputSchema.length > 0 ? (
                  <div className="rounded-xl border border-white/[0.05] bg-black/10 p-3">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                      <Wand2 className="h-3.5 w-3.5" />
                      运行参数
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Select
                        value={inputSelections[field.name] ?? ""}
                        onChange={(value) =>
                          setInputSelections((current) => ({
                            ...current,
                            [field.name]: value,
                          }))
                        }
                        placeholder="选择一个运行参数"
                        options={inputSchema.map((item) => ({
                          value: item.key,
                          label: item.label || item.key,
                          description: item.description || item.key,
                        }))}
                      />
                      <button
                        type="button"
                        onClick={() => insertInputTemplate(field.name)}
                        className="inline-flex items-center gap-1 rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 text-xs text-sky-200 transition-colors hover:bg-sky-500/20"
                      >
                        插入
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : null}

                {isTextField && credentialVariableOptions.length > 0 ? (
                  <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 p-3">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-amber-200/80">
                      <KeyRound className="h-3.5 w-3.5" />
                      凭据变量
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Select
                        value={credentialSelections[field.name] ?? ""}
                        onChange={(value) =>
                          setCredentialSelections((current) => ({
                            ...current,
                            [field.name]: value,
                          }))
                        }
                        placeholder="选择一个凭据字段"
                        searchable
                        options={credentialVariableOptions}
                      />
                      <button
                        type="button"
                        onClick={() => insertCredentialTemplate(field.name)}
                        className="inline-flex items-center gap-1 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 text-xs text-amber-100 transition-colors hover:bg-amber-500/20"
                      >
                        插入
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          {definition.fields.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-3 text-xs text-zinc-500">
              这个节点没有额外配置项，执行时会直接作用于当前页面上下文。
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
