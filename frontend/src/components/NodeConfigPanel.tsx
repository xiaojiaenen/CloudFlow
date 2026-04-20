import { useEffect, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { ArrowRight, KeyRound, Plus, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { WorkflowCredentialRequirement, WorkflowInputField } from "@/src/lib/cloudflow";
import {
  formatNodeParams,
  sanitizeNodeFieldValues,
  shouldShowNodeField,
} from "@/src/lib/cloudflow/canvas";
import { cn } from "@/src/lib/utils";
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

type SaveDataMappingSourceType =
  | "item"
  | "input"
  | "variable"
  | "credential"
  | "text"
  | "number"
  | "boolean"
  | "null"
  | "index"
  | "template";

interface SaveDataMappingRow {
  id: string;
  field: string;
  sourceType: SaveDataMappingSourceType;
  value: string;
}

interface ParsedSaveDataMappings {
  rows: SaveDataMappingRow[];
  hasUnsupportedEntries: boolean;
}

function appendTemplate(currentValue: string, template: string) {
  if (!currentValue.trim()) {
    return template;
  }

  if (currentValue.includes(template)) {
    return currentValue;
  }

  return `${currentValue}${currentValue.endsWith(" ") ? "" : " "}${template}`;
}

function supportsTemplateReference(fieldType: "text" | "number" | "select" | "textarea") {
  return fieldType === "text" || fieldType === "number" || fieldType === "textarea";
}

function mergeTemplateValue(
  currentValue: string,
  template: string,
  fieldType: "text" | "number" | "select" | "textarea",
) {
  if (fieldType === "number") {
    return template;
  }

  return appendTemplate(currentValue, template);
}

function getExtractSaveTargetDescription(value: string) {
  switch (value) {
    case "variable":
      return "结果写入变量，适合给后续节点继续引用。";
    case "task_output":
      return "结果只保存在任务快照里，方便监控和复盘。";
    default:
      return "既写入变量，也保存在任务快照里，兼顾复用和复盘。";
  }
}

function getSaveDataFieldOptionDescription(fieldName: string, value: string) {
  if (fieldName === "recordMode") {
    return value === "array"
      ? "把来源变量中的 JSON 数组拆成多条记录写入，适合批量提取结果入库。"
      : "只写入一条记录，适合保存当前对象、汇总结果或单次计算输出。";
  }

  if (fieldName === "writeMode") {
    switch (value) {
      case "insert":
        return "只新增，不覆盖旧记录；如果记录键重复，会记为失败。";
      case "skip_duplicates":
        return "遇到重复记录键时直接跳过，常用于增量采集去重。";
      default:
        return "推荐默认方案：存在则更新，不存在则新增，最适合持续同步数据。";
    }
  }

  return "";
}

function createSaveDataMappingRow(
  sourceType: SaveDataMappingSourceType = "item",
  value = "",
  field = "",
): SaveDataMappingRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    field,
    sourceType,
    value,
  };
}

function parseTemplateValueToMappingRow(
  field: string,
  rawValue: string,
): SaveDataMappingRow {
  const normalized = rawValue.trim();
  const exactTemplate = normalized.match(/^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/);

  if (exactTemplate) {
    const expression = exactTemplate[1];

    if (expression === "index") {
      return createSaveDataMappingRow("index", "", field);
    }

    if (expression === "item") {
      return createSaveDataMappingRow("item", "", field);
    }

    if (expression.startsWith("item.")) {
      return createSaveDataMappingRow("item", expression.slice("item.".length), field);
    }

    if (expression.startsWith("inputs.")) {
      return createSaveDataMappingRow("input", expression.slice("inputs.".length), field);
    }

    if (expression.startsWith("variables.")) {
      return createSaveDataMappingRow("variable", expression.slice("variables.".length), field);
    }

    if (expression.startsWith("credentials.")) {
      return createSaveDataMappingRow("credential", expression.slice("credentials.".length), field);
    }
  }

  if (normalized.includes("{{") && normalized.includes("}}")) {
    return createSaveDataMappingRow("template", rawValue, field);
  }

  return createSaveDataMappingRow("text", rawValue, field);
}

function parseSaveDataMappings(rawValue: string): ParsedSaveDataMappings {
  const normalized = rawValue.trim();
  if (!normalized) {
    return {
      rows: [],
      hasUnsupportedEntries: false,
    };
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        rows: [],
        hasUnsupportedEntries: true,
      };
    }

    const rows: SaveDataMappingRow[] = [];
    let hasUnsupportedEntries = false;

    for (const [field, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === null) {
        rows.push(createSaveDataMappingRow("null", "", field));
        continue;
      }

      if (typeof value === "string") {
        rows.push(parseTemplateValueToMappingRow(field, value));
        continue;
      }

      if (typeof value === "number") {
        rows.push(createSaveDataMappingRow("number", String(value), field));
        continue;
      }

      if (typeof value === "boolean") {
        rows.push(createSaveDataMappingRow("boolean", value ? "true" : "false", field));
        continue;
      }

      hasUnsupportedEntries = true;
    }

    return {
      rows,
      hasUnsupportedEntries,
    };
  } catch {
    return {
      rows: [],
      hasUnsupportedEntries: true,
    };
  }
}

function serializeSaveDataMappings(rows: SaveDataMappingRow[]) {
  const payload = rows.reduce<Record<string, unknown>>((acc, row) => {
    const field = row.field.trim();
    if (!field) {
      return acc;
    }

    switch (row.sourceType) {
      case "item":
        acc[field] = row.value.trim() ? `{{item.${row.value.trim()}}}` : "{{item}}";
        break;
      case "input":
        if (row.value.trim()) {
          acc[field] = `{{inputs.${row.value.trim()}}}`;
        }
        break;
      case "variable":
        if (row.value.trim()) {
          acc[field] = `{{variables.${row.value.trim()}}}`;
        }
        break;
      case "credential":
        if (row.value.trim()) {
          acc[field] = `{{credentials.${row.value.trim()}}}`;
        }
        break;
      case "number": {
        const parsed = Number(row.value.trim());
        acc[field] = Number.isFinite(parsed) ? parsed : row.value.trim();
        break;
      }
      case "boolean":
        acc[field] = row.value === "true";
        break;
      case "null":
        acc[field] = null;
        break;
      case "index":
        acc[field] = "{{index}}";
        break;
      case "template":
        acc[field] = row.value;
        break;
      case "text":
      default:
        acc[field] = row.value;
        break;
    }

    return acc;
  }, {});

  return Object.keys(payload).length > 0 ? JSON.stringify(payload, null, 2) : "";
}

function getSaveDataSourceOptions() {
  return [
    { value: "item", label: "来源字段", description: "从当前记录对象读取字段，如 item.orderNo" },
    { value: "input", label: "运行参数", description: "引用启动工作流时输入的参数" },
    { value: "variable", label: "流程变量", description: "引用前面节点产出的变量" },
    { value: "credential", label: "凭据字段", description: "从绑定凭据中读取字段" },
    { value: "text", label: "固定文本", description: "写入一个固定字符串" },
    { value: "number", label: "数字", description: "写入数值类型" },
    { value: "boolean", label: "布尔值", description: "写入 true / false" },
    { value: "null", label: "空值", description: "明确写入 null" },
    { value: "index", label: "当前序号", description: "数组模式下写入当前项序号" },
    { value: "template", label: "高级模板", description: "需要组合模板时使用，如 {{item.id}}-{{index}}" },
  ] as const;
}

export function NodeConfigPanel({
  nodeId,
  inputSchema,
  credentialRequirements,
  onClose,
}: NodeConfigPanelProps) {
  const { getNode, getNodes, updateNodeData } = useReactFlow();
  const node = getNode(nodeId);
  const [localData, setLocalData] = useState<Record<string, unknown>>({});
  const [inputSelections, setInputSelections] = useState<Record<string, string>>({});
  const [credentialSelections, setCredentialSelections] = useState<Record<string, string>>({});
  const [saveDataMappings, setSaveDataMappings] = useState<SaveDataMappingRow[]>([]);
  const [saveDataMappingsMode, setSaveDataMappingsMode] = useState<"visual" | "raw">("visual");
  const [saveDataMappingsRaw, setSaveDataMappingsRaw] = useState("");

  useEffect(() => {
    if (node) {
      const sanitized = sanitizeNodeFieldValues(
        node.data.type as string | undefined,
        (node.data || {}) as Record<string, unknown>,
      );
      setLocalData(
        sanitized,
      );
      setInputSelections({});
      setCredentialSelections({});

      if (node.data.type === "save_data") {
        const rawMappings = String(sanitized.fieldMappings ?? "");
        const parsedMappings = parseSaveDataMappings(rawMappings);
        setSaveDataMappings(parsedMappings.rows.length > 0 ? parsedMappings.rows : [createSaveDataMappingRow()]);
        setSaveDataMappingsRaw(rawMappings);
        setSaveDataMappingsMode(parsedMappings.hasUnsupportedEntries ? "raw" : "visual");
      } else {
        setSaveDataMappings([]);
        setSaveDataMappingsRaw("");
        setSaveDataMappingsMode("visual");
      }
    }
  }, [node, nodeId]);

  const nodeType = node?.data.type as string | undefined;
  const definition = useMemo(() => getNodeDefinition(nodeType ?? ""), [nodeType]);

  const credentialVariableOptions = useMemo(
    () =>
      credentialRequirements.flatMap((requirement) =>
        (CREDENTIAL_FIELD_OPTIONS[requirement.type] ?? CREDENTIAL_FIELD_OPTIONS.custom).map((fieldName) => ({
          value: `{{credentials.${requirement.key}.${fieldName}}}`,
          label: `${requirement.label || requirement.key} / ${fieldName}`,
          description: requirement.provider
            ? `${requirement.provider} / ${requirement.type}`
            : requirement.type,
          group: requirement.label || requirement.key || "凭据变量",
        })),
      ),
    [credentialRequirements],
  );

  const credentialMappingOptions = useMemo(
    () =>
      credentialRequirements.flatMap((requirement) =>
        (CREDENTIAL_FIELD_OPTIONS[requirement.type] ?? CREDENTIAL_FIELD_OPTIONS.custom).map((fieldName) => ({
          value: `${requirement.key}.${fieldName}`,
          label: `${requirement.label || requirement.key} / ${fieldName}`,
          description: `{{credentials.${requirement.key}.${fieldName}}}`,
          group: requirement.label || requirement.key || "凭据字段",
        })),
      ),
    [credentialRequirements],
  );

  const saveDataSourceOptions = useMemo(() => getSaveDataSourceOptions(), []);

  const variableOptions = useMemo(() => {
    const values = new Set<string>();

    getNodes().forEach((canvasNode) => {
      const data = (canvasNode.data || {}) as Record<string, unknown>;
      const nodeType = String(data.type ?? "");

      if (nodeType === "set_variable" && String(data.key ?? "").trim()) {
        values.add(String(data.key).trim());
      }

      if (nodeType === "extract" && String(data.saveKey ?? "").trim()) {
        values.add(String(data.saveKey).trim());
      }

      if (nodeType === "save_data" && String(data.resultVariable ?? "").trim()) {
        values.add(String(data.resultVariable).trim());
      }
    });

    return Array.from(values)
      .sort((left, right) => left.localeCompare(right))
      .map((value) => ({
        value,
        label: value,
        description: `{{variables.${value}}}`,
        group: "流程变量",
      }));
  }, [getNodes, localData, nodeId]);

  if (!node || !definition) {
    return null;
  }

  const commitNodeData = (nextData: Record<string, unknown>) => {
    const sanitizedData = sanitizeNodeFieldValues(nodeType, nextData);
    const nextPayload = {
      ...sanitizedData,
      params: formatNodeParams(sanitizedData),
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

  const commitSaveDataMappings = (nextRows: SaveDataMappingRow[]) => {
    const nextRaw = serializeSaveDataMappings(nextRows);
    setSaveDataMappings(nextRows);
    setSaveDataMappingsRaw(nextRaw);
    commitNodeData({
      ...localData,
      fieldMappings: nextRaw,
    });
  };

  const updateSaveDataMapping = (
    rowId: string,
    updater: (row: SaveDataMappingRow) => SaveDataMappingRow,
  ) => {
    commitSaveDataMappings(
      saveDataMappings.map((row) => (row.id === rowId ? updater(row) : row)),
    );
  };

  const addSaveDataMapping = () => {
    commitSaveDataMappings([...saveDataMappings, createSaveDataMappingRow()]);
  };

  const removeSaveDataMapping = (rowId: string) => {
    const nextRows = saveDataMappings.filter((row) => row.id !== rowId);
    commitSaveDataMappings(nextRows.length > 0 ? nextRows : [createSaveDataMappingRow()]);
  };

  const insertInputTemplate = (
    fieldName: string,
    fieldType: "text" | "number" | "select" | "textarea",
  ) => {
    const selectedKey = inputSelections[fieldName];
    if (!selectedKey) {
      return;
    }

    handleChange(
      fieldName,
      mergeTemplateValue(
        String(localData[fieldName] ?? ""),
        `{{inputs.${selectedKey}}}`,
        fieldType,
      ),
    );
  };

  const insertCredentialTemplate = (
    fieldName: string,
    fieldType: "text" | "number" | "select" | "textarea",
  ) => {
    const template = credentialSelections[fieldName];
    if (!template) {
      return;
    }

    handleChange(
      fieldName,
      mergeTemplateValue(String(localData[fieldName] ?? ""), template, fieldType),
    );
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
          <div className="font-medium">
            {definition.description ?? "配置这个节点的执行参数。"}
          </div>
          <div className="mt-2">
            支持引用
            <code className="mx-1 rounded bg-black/20 px-1.5 py-0.5">{`{{inputs.xxx}}`}</code>
            <code className="mr-1 rounded bg-black/20 px-1.5 py-0.5">{`{{variables.xxx}}`}</code>
            和
            <code className="ml-1 rounded bg-black/20 px-1.5 py-0.5">{`{{credentials.xxx.field}}`}</code>
            。
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-zinc-400">节点名称</label>
            <Input
              value={String(localData.label || "")}
              onChange={(event) => handleChange("label", event.target.value)}
              placeholder="给这个节点起一个更容易识别的名字"
            />
          </div>

          {definition.fields.map((field) => {
            if (!shouldShowNodeField(nodeType, field.name, localData)) {
              return null;
            }

            const currentValue = String(localData[field.name] ?? field.defaultValue ?? "");
            const canUseTemplate = supportsTemplateReference(field.type);

            if (nodeType === "save_data" && field.name === "fieldMappings") {
              return (
                <div
                  key={field.name}
                  className="space-y-4 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4"
                >
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-zinc-200">{field.label}</label>
                    {field.description ? (
                      <div className="text-xs leading-5 text-zinc-500">{field.description}</div>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="rounded-xl border border-cyan-500/10 bg-cyan-500/5 px-3 py-2 text-[11px] leading-5 text-cyan-100">
                      常用映射已经可视化，不需要再手写 JSON。右侧高级模式仅用于兼容复杂历史映射。
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant={saveDataMappingsMode === "visual" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSaveDataMappingsMode("visual")}
                      >
                        可视化
                      </Button>
                      <Button
                        type="button"
                        variant={saveDataMappingsMode === "raw" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSaveDataMappingsMode("raw")}
                      >
                        高级 JSON
                      </Button>
                    </div>
                  </div>

                  {saveDataMappingsMode === "visual" ? (
                    <div className="space-y-3">
                      {saveDataMappings.map((row, index) => (
                        <div
                          key={row.id}
                          className="space-y-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                              映射 {String(index + 1).padStart(2, "0")}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeSaveDataMapping(row.id)}
                              className="rounded-full p-1 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
                              title="删除映射"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                                目标字段
                              </label>
                              <Input
                                value={row.field}
                                onChange={(event) =>
                                  updateSaveDataMapping(row.id, (current) => ({
                                    ...current,
                                    field: event.target.value,
                                  }))
                                }
                                placeholder="如 orderNo / amount / status"
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                                值来源
                              </label>
                              <Select
                                value={row.sourceType}
                                onChange={(value) =>
                                  updateSaveDataMapping(row.id, (current) => ({
                                    ...current,
                                    sourceType: value as SaveDataMappingSourceType,
                                    value:
                                      value === "null" || value === "index"
                                        ? ""
                                        : current.value,
                                  }))
                                }
                                options={saveDataSourceOptions.map((option) => ({
                                  value: option.value,
                                  label: option.label,
                                  description: option.description,
                                }))}
                              />
                            </div>
                          </div>

                          {row.sourceType === "input" ? (
                            <div className="space-y-2">
                              <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                                运行参数
                              </label>
                              <Select
                                value={row.value}
                                onChange={(value) =>
                                  updateSaveDataMapping(row.id, (current) => ({
                                    ...current,
                                    value,
                                  }))
                                }
                                placeholder="选择一个运行参数"
                                options={inputSchema.map((item) => ({
                                  value: item.key,
                                  label: item.label || item.key,
                                  description: `{{inputs.${item.key}}}`,
                                  group: "运行参数",
                                }))}
                              />
                            </div>
                          ) : null}

                          {row.sourceType === "credential" ? (
                            <div className="space-y-2">
                              <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                                凭据字段
                              </label>
                              <Select
                                value={row.value}
                                onChange={(value) =>
                                  updateSaveDataMapping(row.id, (current) => ({
                                    ...current,
                                    value,
                                  }))
                                }
                                placeholder="选择一个凭据字段"
                                searchable
                                options={credentialMappingOptions}
                              />
                            </div>
                          ) : null}

                          {row.sourceType === "boolean" ? (
                            <div className="space-y-2">
                              <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                                布尔值
                              </label>
                              <Select
                                value={row.value || "true"}
                                onChange={(value) =>
                                  updateSaveDataMapping(row.id, (current) => ({
                                    ...current,
                                    value,
                                  }))
                                }
                                options={[
                                  { value: "true", label: "true", description: "写入布尔真值" },
                                  { value: "false", label: "false", description: "写入布尔假值" },
                                ]}
                              />
                            </div>
                          ) : null}

                          {row.sourceType !== "input" &&
                          row.sourceType !== "credential" &&
                          row.sourceType !== "boolean" &&
                          row.sourceType !== "null" &&
                          row.sourceType !== "index" ? (
                            <div className="space-y-2">
                              <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                                {row.sourceType === "item"
                                  ? "来源路径"
                                  : row.sourceType === "variable"
                                    ? "变量名"
                                    : row.sourceType === "number"
                                      ? "数字值"
                                      : row.sourceType === "template"
                                        ? "模板表达式"
                                        : "固定值"}
                              </label>
                              <Input
                                type="text"
                                inputMode={row.sourceType === "number" ? "decimal" : undefined}
                                value={row.value}
                                onChange={(event) =>
                                  updateSaveDataMapping(row.id, (current) => ({
                                    ...current,
                                    value: event.target.value,
                                  }))
                                }
                                placeholder={
                                  row.sourceType === "item"
                                    ? "如 orderNo / data.amount"
                                    : row.sourceType === "variable"
                                      ? "如 currentShopName"
                                      : row.sourceType === "number"
                                        ? "如 100"
                                        : row.sourceType === "template"
                                          ? "{{item.id}}-{{index}}"
                                          : "如 已完成"
                                }
                              />
                              {row.sourceType === "variable" && variableOptions.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {variableOptions.slice(0, 8).map((option) => (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() =>
                                        updateSaveDataMapping(row.id, (current) => ({
                                          ...current,
                                          value: option.value,
                                        }))
                                      }
                                      className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:border-sky-400/30 hover:text-sky-200"
                                    >
                                      {option.label}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="outline"
                        className="w-full gap-2 rounded-2xl"
                        onClick={addSaveDataMapping}
                      >
                        <Plus className="h-4 w-4" />
                        添加字段映射
                      </Button>

                      <div className="rounded-xl border border-white/[0.05] bg-black/10 px-3 py-3 text-xs leading-6 text-zinc-500">
                        当前会自动保存成兼容 JSON：
                        <pre className="mt-2 overflow-auto rounded-lg bg-black/30 p-3 font-mono text-[11px] leading-5 text-zinc-300">
                          {serializeSaveDataMappings(saveDataMappings) || "{ }"}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        value={saveDataMappingsRaw}
                        onChange={(event) => {
                          const nextRaw = event.target.value;
                          setSaveDataMappingsRaw(nextRaw);
                          commitNodeData({
                            ...localData,
                            fieldMappings: nextRaw,
                          });
                        }}
                        placeholder={field.placeholder}
                        spellCheck={false}
                        className="min-h-[220px] w-full rounded-2xl border border-white/[0.08] bg-black/20 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-sky-400/40 focus:bg-black/30"
                      />
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/10 bg-amber-500/5 px-3 py-3 text-xs leading-5 text-amber-100">
                        <div>
                          高级模式保留给复杂历史映射。若这里是简单对象，可以随时切回可视化继续编辑。
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const parsedMappings = parseSaveDataMappings(saveDataMappingsRaw);
                            if (parsedMappings.hasUnsupportedEntries) {
                              return;
                            }

                            setSaveDataMappings(
                              parsedMappings.rows.length > 0
                                ? parsedMappings.rows
                                : [createSaveDataMappingRow()],
                            );
                            setSaveDataMappingsMode("visual");
                          }}
                        >
                          尝试转为可视化
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div
                key={field.name}
                className="space-y-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4"
              >
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-200">{field.label}</label>
                  {field.description ? (
                    <div className="text-xs leading-5 text-zinc-500">{field.description}</div>
                  ) : null}
                </div>

                {field.type === "select" &&
                ((nodeType === "extract" && field.name === "saveTarget") ||
                  (nodeType === "save_data" &&
                    (field.name === "recordMode" || field.name === "writeMode"))) ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    {(field.options ?? []).map((option) => {
                      const active = currentValue === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleChange(field.name, option.value)}
                          className={cn(
                            "rounded-2xl border p-4 text-left transition-all",
                            active
                              ? "border-sky-400/50 bg-sky-500/12 shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
                              : "border-white/[0.06] bg-black/20 hover:border-white/[0.16] hover:bg-white/[0.03]",
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-zinc-100">{option.label}</div>
                            <div
                              className={cn(
                                "h-3 w-3 rounded-full border",
                                active
                                  ? "border-sky-300 bg-sky-300 shadow-[0_0_14px_rgba(125,211,252,0.45)]"
                                  : "border-white/20 bg-transparent",
                              )}
                            />
                          </div>
                          <div className="mt-2 text-xs leading-5 text-zinc-400">
                            {nodeType === "extract"
                              ? getExtractSaveTargetDescription(option.value)
                              : getSaveDataFieldOptionDescription(field.name, option.value)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : field.type === "select" ? (
                  <Select
                    value={currentValue}
                    onChange={(value) => handleChange(field.name, value)}
                    options={(field.options ?? []).map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                  />
                ) : field.type === "textarea" ? (
                  <textarea
                    value={currentValue}
                    onChange={(event) => handleChange(field.name, event.target.value)}
                    placeholder={field.placeholder}
                    spellCheck={false}
                    className="min-h-[132px] w-full rounded-2xl border border-white/[0.08] bg-black/20 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-sky-400/40 focus:bg-black/30"
                  />
                ) : (
                  <Input
                    type="text"
                    inputMode={field.type === "number" ? "decimal" : undefined}
                    value={currentValue}
                    onChange={(event) => handleChange(field.name, event.target.value)}
                    placeholder={field.placeholder}
                  />
                )}

                {canUseTemplate && inputSchema.length > 0 ? (
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
                        onClick={() => insertInputTemplate(field.name, field.type)}
                        className="inline-flex items-center gap-1 rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 text-xs text-sky-200 transition-colors hover:bg-sky-500/20"
                      >
                        插入
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : null}

                {canUseTemplate && credentialVariableOptions.length > 0 ? (
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
                        onClick={() => insertCredentialTemplate(field.name, field.type)}
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
