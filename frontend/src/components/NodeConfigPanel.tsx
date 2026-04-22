import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { ArrowRight, KeyRound, MousePointerClick, Plus, Trash2, Wand2, X } from "lucide-react";
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
import { Select, type SelectOption } from "@/src/components/ui/Select";
import { SaveDataNodeConfig } from "@/src/components/SaveDataNodeConfig";
import {
  pickTaskElement,
  TaskElementPickerResult,
  WorkflowCredentialRequirement,
  WorkflowInputField,
} from "@/src/lib/cloudflow";
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
  taskId?: string | null;
  isTaskRunning?: boolean;
  screenshot?: string | null;
  pageUrl?: string;
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

type SaveDataSourceMode = "single_object" | "array_list" | "plain_text";
type SaveDataSourceBindingType = "variable" | "input" | "inline" | "template";

interface SaveDataSourceFieldInfo {
  options: SelectOption[];
  recommendedRecordKeyOptions: SelectOption[];
  canAutoInfer: boolean;
  hint: string;
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

function normalizeScreenshotSrc(screenshot?: string | null) {
  if (!screenshot) {
    return null;
  }

  if (
    screenshot.startsWith("data:") ||
    screenshot.startsWith("blob:") ||
    screenshot.startsWith("http")
  ) {
    return screenshot;
  }

  return `data:image/jpeg;base64,${screenshot}`;
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

function tryParseJsonValue(raw: string) {
  const normalized = raw.trim();
  if (!normalized) {
    return null;
  }

  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    return undefined;
  }
}

function inferSaveDataSourceMode(recordModeValue: string, sourceValue: string): SaveDataSourceMode {
  if (recordModeValue === "array") {
    return "array_list";
  }

  const parsed = tryParseJsonValue(sourceValue);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return "single_object";
  }

  return "plain_text";
}

function inferSaveDataSourceBindingType(
  sourceValue: string,
  mode: SaveDataSourceMode,
  knownVariableKeys: string[],
  knownInputKeys: string[],
): SaveDataSourceBindingType {
  const trimmed = sourceValue.trim();

  if (!trimmed) {
    return mode === "plain_text" ? "inline" : "variable";
  }

  const directTemplate = trimmed.match(/^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/);
  if (directTemplate) {
    const expression = directTemplate[1];

    if (expression.startsWith("inputs.")) {
      return "input";
    }

    if (expression.startsWith("variables.")) {
      return "variable";
    }

    return "template";
  }

  if (trimmed.includes("{{") && trimmed.includes("}}")) {
    return "template";
  }

  const parsed = tryParseJsonValue(trimmed);
  if (parsed !== undefined && parsed !== null) {
    return "inline";
  }

  if (knownVariableKeys.includes(trimmed)) {
    return "variable";
  }

  if (knownInputKeys.includes(trimmed)) {
    return "input";
  }

  return mode === "plain_text" ? "inline" : "variable";
}

function getSaveDataSourceBindingLabel(type: SaveDataSourceBindingType) {
  switch (type) {
    case "variable":
      return "流程变量";
    case "input":
      return "运行参数";
    case "template":
      return "高级模板";
    default:
      return "直接填写";
  }
}

function getSaveDataModeTitle(mode: SaveDataSourceMode) {
  switch (mode) {
    case "array_list":
      return "数组列表";
    case "plain_text":
      return "普通文本";
    default:
      return "单条对象";
  }
}

function getSaveDataModeDescription(mode: SaveDataSourceMode) {
  switch (mode) {
    case "array_list":
      return "把一个数组拆成多条记录写入数据中心，适合表格、列表、批量提取结果。";
    case "plain_text":
      return "保存一段文本、编号、消息或摘要，系统会自动包装成一条结构化记录。";
    default:
      return "保存一条对象记录，适合详情页结果、汇总信息或单次计算输出。";
  }
}

function getDefaultSaveDataSourceValue(
  mode: SaveDataSourceMode,
  bindingType: SaveDataSourceBindingType,
) {
  if (bindingType === "variable") {
    return mode === "array_list" ? "{{variables.listData}}" : mode === "plain_text" ? "{{variables.textValue}}" : "{{variables.recordData}}";
  }

  if (bindingType === "input") {
    return mode === "array_list" ? "{{inputs.items}}" : mode === "plain_text" ? "{{inputs.message}}" : "{{inputs.payload}}";
  }

  if (bindingType === "template") {
    return mode === "array_list"
      ? "{{variables.listData}}"
      : mode === "plain_text"
        ? "{{inputs.message}}"
        : "{{variables.recordData}}";
  }

  if (mode === "array_list") {
    return '[\n  {\n    "id": "row-1",\n    "name": "示例 1"\n  },\n  {\n    "id": "row-2",\n    "name": "示例 2"\n  }\n]';
  }

  if (mode === "single_object") {
    return '{\n  "id": "record-1",\n  "name": "示例对象"\n}';
  }

  return "这里是一段要保存的文本";
}

function getFriendlySaveDataModeTitle(mode: SaveDataSourceMode) {
  switch (mode) {
    case "array_list":
      return "数组列表";
    case "plain_text":
      return "普通文本";
    default:
      return "单条对象";
  }
}

function getFriendlySaveDataBindingLabel(type: SaveDataSourceBindingType) {
  switch (type) {
    case "variable":
      return "流程变量";
    case "input":
      return "运行参数";
    case "template":
      return "高级模板";
    default:
      return "直接填写";
  }
}

function getFriendlySaveDataWriteModeTitle(writeMode: string) {
  switch (writeMode) {
    case "insert":
      return "每次都新增";
    case "skip_duplicates":
      return "重复时跳过";
    default:
      return "重复时更新";
  }
}

function getFriendlySaveDataWriteModeDescription(writeMode: string) {
  switch (writeMode) {
    case "insert":
      return "不判断重复，适合每次执行都想追加新记录的场景。";
    case "skip_duplicates":
      return "遇到相同唯一标识时不再写入，适合增量采集去重。";
    default:
      return "遇到相同唯一标识时更新旧记录，没有则新增，最适合同步数据。";
  }
}

function isFriendlySaveDataRecordKeyRequired(writeMode: string) {
  return writeMode === "upsert" || writeMode === "skip_duplicates";
}

function getFriendlySaveDataRecordKeyHelp(writeMode: string) {
  if (!isFriendlySaveDataRecordKeyRequired(writeMode)) {
    return "当前是“每次都新增”，这里可以留空。系统会自动生成内部记录号。";
  }

  return "当前是“更新/去重”模式，需要告诉系统“哪一个字段代表同一条数据”。如果来源对象本身就带 id 或 key，也可以留空让系统自动识别。";
}

function collectSaveDataLeafPaths(
  value: unknown,
  prefix = "",
  collector: Set<string> = new Set<string>(),
): Set<string> {
  if (value === null || value === undefined) {
    return collector;
  }

  if (Array.isArray(value)) {
    const objectItems = value.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object" && !Array.isArray(item),
    );

    if (objectItems.length > 0) {
      objectItems.slice(0, 5).forEach((item) => {
        collectSaveDataLeafPaths(item, prefix, collector);
      });
      return collector;
    }

    if (prefix) {
      collector.add(prefix);
    }
    return collector;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);

    if (entries.length === 0) {
      if (prefix) {
        collector.add(prefix);
      }
      return collector;
    }

    entries.forEach(([key, child]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;

      if (child !== null && typeof child === "object") {
        collectSaveDataLeafPaths(child, nextPrefix, collector);
        return;
      }

      collector.add(nextPrefix);
    });

    return collector;
  }

  if (prefix) {
    collector.add(prefix);
  }

  return collector;
}

function getSaveDataFieldLeafName(path: string) {
  const parts = path.split(".").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function createUniqueSaveDataFieldName(baseName: string, usedNames: Set<string>) {
  const normalized = baseName.trim() || "field";
  if (!usedNames.has(normalized)) {
    usedNames.add(normalized);
    return normalized;
  }

  let index = 2;
  let candidate = `${normalized}_${index}`;
  while (usedNames.has(candidate)) {
    index += 1;
    candidate = `${normalized}_${index}`;
  }

  usedNames.add(candidate);
  return candidate;
}

function scoreSaveDataRecordKeyPath(path: string) {
  const normalized = getSaveDataFieldLeafName(path).toLowerCase();

  if (normalized === "id" || normalized.endsWith("id")) {
    return 100;
  }

  if (normalized === "key" || normalized.endsWith("key")) {
    return 90;
  }

  if (normalized.includes("orderno") || normalized.includes("order_no")) {
    return 80;
  }

  if (normalized.includes("sku") || normalized.includes("code")) {
    return 70;
  }

  if (normalized.endsWith("no") || normalized.includes("number")) {
    return 60;
  }

  return 0;
}

function buildSaveDataFieldOption(path: string): SelectOption {
  return {
    value: path,
    label: path,
    description: `{{item.${path}}}`,
    keywords: [getSaveDataFieldLeafName(path)],
  };
}

function appendCurrentFieldOption(
  options: SelectOption[],
  currentValue: string,
  descriptionPrefix = "{{item.",
) {
  const normalized = currentValue.trim();
  if (!normalized || options.some((option) => option.value === normalized)) {
    return options;
  }

  return [
    {
      value: normalized,
      label: normalized,
      description: `${descriptionPrefix}${normalized}}}`,
      group: "当前值",
    },
    ...options,
  ];
}

function inferSaveDataSourceFieldInfo(
  sourceValue: string,
  mode: SaveDataSourceMode,
  bindingType: SaveDataSourceBindingType,
): SaveDataSourceFieldInfo {
  if (mode === "plain_text") {
    return {
      options: [],
      recommendedRecordKeyOptions: [],
      canAutoInfer: false,
      hint: "当前是普通文本模式，没有可识别的来源字段。",
    };
  }

  if (bindingType !== "inline") {
    return {
      options: [],
      recommendedRecordKeyOptions: [],
      canAutoInfer: false,
      hint: "当前来源是变量、参数或模板，设计器阶段拿不到真实数据结构。若想自动识别字段，请先填一段示例 JSON。",
    };
  }

  const parsed = tryParseJsonValue(sourceValue);

  if (parsed === null) {
    return {
      options: [],
      recommendedRecordKeyOptions: [],
      canAutoInfer: false,
      hint: "请先提供一段示例 JSON，系统才能自动识别来源字段。",
    };
  }

  if (parsed === undefined) {
    return {
      options: [],
      recommendedRecordKeyOptions: [],
      canAutoInfer: false,
      hint: "当前内容不是合法 JSON，暂时无法识别来源字段。",
    };
  }

  let rawPaths: string[] = [];

  if (mode === "array_list") {
    if (!Array.isArray(parsed)) {
      return {
        options: [],
        recommendedRecordKeyOptions: [],
        canAutoInfer: false,
        hint: "数组列表模式下，来源需要是 JSON 数组，系统才能识别每一项的字段。",
      };
    }

    rawPaths = Array.from(collectSaveDataLeafPaths(parsed)).sort((left, right) =>
      left.localeCompare(right),
    );
  } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    rawPaths = Array.from(collectSaveDataLeafPaths(parsed)).sort((left, right) =>
      left.localeCompare(right),
    );
  } else {
    return {
      options: [],
      recommendedRecordKeyOptions: [],
      canAutoInfer: false,
      hint: "单条对象模式下，来源需要是 JSON 对象，系统才能识别字段。",
    };
  }

  if (rawPaths.length === 0) {
    return {
      options: [],
      recommendedRecordKeyOptions: [],
      canAutoInfer: false,
      hint: "当前示例里没有可直接映射的对象字段。",
    };
  }

  const options = rawPaths.map(buildSaveDataFieldOption);
  const recommendedRecordKeyOptions = [...options].sort((left, right) => {
    const scoreDiff =
      scoreSaveDataRecordKeyPath(right.value) - scoreSaveDataRecordKeyPath(left.value);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return left.label.localeCompare(right.label);
  });

  return {
    options,
    recommendedRecordKeyOptions,
    canAutoInfer: true,
    hint:
      mode === "array_list"
        ? `已根据列表示例识别出 ${options.length} 个字段，可直接下拉选择。`
        : `已根据对象示例识别出 ${options.length} 个字段，可直接下拉选择。`,
  };
}

function createSaveDataMappingsFromSourceFields(fieldOptions: SelectOption[]) {
  const usedFieldNames = new Set<string>();

  return fieldOptions.map((option) =>
    createSaveDataMappingRow(
      "item",
      option.value,
      createUniqueSaveDataFieldName(getSaveDataFieldLeafName(option.value), usedFieldNames),
    ),
  );
}

function extractExactItemTemplateField(template: string) {
  return template.match(/^\{\{\s*item\.([a-zA-Z0-9_.-]+)\s*\}\}$/)?.[1] ?? "";
}

function normalizeSaveDataPreviewRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  return {
    value,
  };
}

function buildSaveDataPreview(params: {
  mode: SaveDataSourceMode;
  bindingType: SaveDataSourceBindingType;
  sourceValue: string;
  fieldMappingsRaw: string;
}) {
  const sourceValue = params.sourceValue.trim();
  const hasMappings = params.fieldMappingsRaw.trim().length > 0;

  let preview: unknown;
  let note = "";

  if (hasMappings) {
    const parsedMappings = tryParseJsonValue(params.fieldMappingsRaw);
    preview = parsedMappings === undefined ? params.fieldMappingsRaw : parsedMappings;
    note = "已配置字段映射，写入前会先按映射结果组装记录。";
  } else if (params.mode === "plain_text") {
    preview = {
      value: sourceValue || "示例文本",
    };
    note = "普通文本模式下，未配置字段映射时会自动包装成 { value: ... }。";
  } else if (params.mode === "array_list") {
    if (params.bindingType === "inline") {
      const parsed = tryParseJsonValue(sourceValue);
      if (Array.isArray(parsed)) {
        preview = parsed.slice(0, 2).map((item) => normalizeSaveDataPreviewRecord(item));
        note = `会把数组中的每一项拆成独立记录，当前预览前 ${Math.min(parsed.length, 2)} 条。`;
      } else {
        preview = [
          { id: "row-1", name: "示例 1" },
          { id: "row-2", name: "示例 2" },
        ];
        note = "数组列表模式要求来源是 JSON 数组；当前展示的是示例写入效果。";
      }
    } else {
      preview = [
        { "...": "第 1 项会原样写入" },
        { "...": "第 2 项会原样写入" },
      ];
      note = `运行时会先解析 ${getFriendlySaveDataBindingLabel(params.bindingType)}，再把数组中的每一项拆开写入。`;
    }
  } else if (params.bindingType === "inline") {
    const parsed = tryParseJsonValue(sourceValue);
    preview =
      parsed === undefined || parsed === null
        ? normalizeSaveDataPreviewRecord(sourceValue || "示例对象")
        : normalizeSaveDataPreviewRecord(parsed);
    note = "单条对象模式下，未配置字段映射时会原样保存当前对象。";
  } else {
    preview = {
      "...": "运行时会把解析后的对象原样写入",
    };
    note = `运行时会先解析 ${getFriendlySaveDataBindingLabel(params.bindingType)}，再原样保存为一条对象记录。`;
  }

  return {
    preview,
    note,
  };
}

export function NodeConfigPanel({
  nodeId,
  inputSchema,
  credentialRequirements,
  taskId,
  isTaskRunning = false,
  screenshot,
  pageUrl,
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
  const [pickerDialogOpen, setPickerDialogOpen] = useState(false);
  const [pickerFieldName, setPickerFieldName] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState("");
  const [isPickingElement, setIsPickingElement] = useState(false);
  const skipNextNodeSyncRef = useRef<string | null>(null);
  const [pickedSelectorResults, setPickedSelectorResults] = useState<
    Record<string, TaskElementPickerResult>
  >({});

  useEffect(() => {
    if (node) {
      const sanitized = sanitizeNodeFieldValues(
        node.data.type as string | undefined,
        (node.data || {}) as Record<string, unknown>,
      );
      const syncKey = `${nodeId}:${JSON.stringify(sanitized)}`;
      if (skipNextNodeSyncRef.current === syncKey) {
        skipNextNodeSyncRef.current = null;
        return;
      }
      setLocalData(
        sanitized,
      );
      setInputSelections({});
      setCredentialSelections({});
      setPickerError("");

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

      setPickedSelectorResults({});
    }
  }, [node, nodeId]);

  const nodeType = node?.data.type as string | undefined;
  const definition = useMemo(() => getNodeDefinition(nodeType ?? ""), [nodeType]);
  const screenshotSrc = useMemo(() => normalizeScreenshotSrc(screenshot), [screenshot]);

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

  const saveDataSourceValue = String(localData.sourceVariable ?? "");
  const saveDataSourceMode = useMemo(
    () => inferSaveDataSourceMode(String(localData.recordMode ?? "single"), saveDataSourceValue),
    [localData.recordMode, saveDataSourceValue],
  );
  const saveDataSourceBindingType = useMemo(
    () =>
      inferSaveDataSourceBindingType(
        saveDataSourceValue,
        saveDataSourceMode,
        variableOptions.map((option) => option.value),
        inputSchema.map((item) => item.key),
      ),
    [inputSchema, saveDataSourceMode, saveDataSourceValue, variableOptions],
  );
  const saveDataPreview = useMemo(
    () =>
      buildSaveDataPreview({
        mode: saveDataSourceMode,
        bindingType: saveDataSourceBindingType,
        sourceValue: saveDataSourceValue,
        fieldMappingsRaw: String(localData.fieldMappings ?? ""),
      }),
    [localData.fieldMappings, saveDataSourceBindingType, saveDataSourceMode, saveDataSourceValue],
  );
  const saveDataSourceFieldInfo = useMemo(
    () =>
      inferSaveDataSourceFieldInfo(
        saveDataSourceValue,
        saveDataSourceMode,
        saveDataSourceBindingType,
      ),
    [saveDataSourceBindingType, saveDataSourceMode, saveDataSourceValue],
  );
  const saveDataGeneratedMappingRows = useMemo(
    () => createSaveDataMappingsFromSourceFields(saveDataSourceFieldInfo.options),
    [saveDataSourceFieldInfo.options],
  );

  if (!node || !definition) {
    return null;
  }

  const commitNodeData = (nextData: Record<string, unknown>) => {
    const sanitizedData = sanitizeNodeFieldValues(nodeType, nextData);
    skipNextNodeSyncRef.current = `${nodeId}:${JSON.stringify(sanitizedData)}`;
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

  const applyPickedSelector = (fieldName: string, result: TaskElementPickerResult, selector: string) => {
    setPickedSelectorResults((current) => ({
      ...current,
      [fieldName]: {
        ...result,
        selector,
      },
    }));
    handleChange(fieldName, selector);
  };

  const openSelectorPicker = (fieldName: string) => {
    setPickerFieldName(fieldName);
    setPickerError("");
    setPickerDialogOpen(true);
  };

  const handlePickerImageClick = async (
    event: MouseEvent<HTMLImageElement>,
  ) => {
    if (!pickerFieldName || !taskId || !isTaskRunning) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const xRatio = (event.clientX - rect.left) / rect.width;
    const yRatio = (event.clientY - rect.top) / rect.height;

    if (!Number.isFinite(xRatio) || !Number.isFinite(yRatio)) {
      return;
    }

    try {
      setIsPickingElement(true);
      setPickerError("");
      const result = await pickTaskElement(taskId, {
        xRatio: Math.max(0, Math.min(1, xRatio)),
        yRatio: Math.max(0, Math.min(1, yRatio)),
      });

      applyPickedSelector(pickerFieldName, result, result.selector);
      setPickerDialogOpen(false);
    } catch (error) {
      setPickerError(error instanceof Error ? error.message : "当前页面元素选取失败，请稍后重试。");
    } finally {
      setIsPickingElement(false);
    }
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

  const replaceSaveDataMappingsFromSourceFields = () => {
    if (saveDataGeneratedMappingRows.length === 0) {
      return;
    }

    commitSaveDataMappings(saveDataGeneratedMappingRows);
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

  const setSaveDataSourceMode = (mode: SaveDataSourceMode) => {
    const nextRecordMode = mode === "array_list" ? "array" : "single";
    const nextSourceValue =
      saveDataSourceMode === mode
        ? saveDataSourceValue
        : getDefaultSaveDataSourceValue(mode, saveDataSourceBindingType);

    commitNodeData({
      ...localData,
      recordMode: nextRecordMode,
      sourceVariable: nextSourceValue,
    });
  };

  const setSaveDataSourceBindingType = (bindingType: SaveDataSourceBindingType) => {
    const nextSourceValue =
      saveDataSourceBindingType === bindingType
        ? saveDataSourceValue
        : getDefaultSaveDataSourceValue(saveDataSourceMode, bindingType);

    commitNodeData({
      ...localData,
      sourceVariable: nextSourceValue,
    });
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

          {nodeType === "save_data" ? (
            <SaveDataNodeConfig
              localData={localData}
              inputSchema={inputSchema}
              variableOptions={variableOptions}
              onPatch={(patch) =>
                commitNodeData({
                  ...localData,
                  ...patch,
                })
              }
            />
          ) : definition.fields.map((field) => {
            if (!shouldShowNodeField(nodeType, field.name, localData)) {
              return null;
            }

            const currentValue = String(localData[field.name] ?? field.defaultValue ?? "");
            const canUseTemplate = supportsTemplateReference(field.type);

            if (nodeType === "save_data" && field.name === "recordMode") {
              return null;
            }

            if (nodeType === "save_data" && field.name === "sourceVariable") {
              const modeCards: Array<{
                value: SaveDataSourceMode;
                title: string;
                description: string;
              }> = [
                {
                  value: "single_object",
                  title: "单条对象",
                  description: "适合保存详情对象、汇总结果或单次输出。",
                },
                {
                  value: "array_list",
                  title: "数组列表",
                  description: "适合保存列表、表格或批量提取结果。",
                },
                {
                  value: "plain_text",
                  title: "普通文本",
                  description: "适合保存消息、摘要、编号或其他文本。",
                },
              ];
              const bindingCards: Array<{
                value: SaveDataSourceBindingType;
                title: string;
                description: string;
              }> = [
                {
                  value: "variable",
                  title: "流程变量",
                  description: "引用前面节点产出的变量内容。",
                },
                {
                  value: "input",
                  title: "运行参数",
                  description: "引用启动工作流时传入的参数。",
                },
                {
                  value: "inline",
                  title: saveDataSourceMode === "plain_text" ? "直接填写文本" : "直接填写 JSON",
                  description:
                    saveDataSourceMode === "plain_text"
                      ? "直接输入要保存的文本内容。"
                      : "直接粘贴对象或数组 JSON 内容。",
                },
                {
                  value: "template",
                  title: "高级模板",
                  description: "混合多个变量或参数时使用模板表达式。",
                },
              ];
              const selectedVariableKey = saveDataSourceValue.match(/^\{\{\s*variables\.([a-zA-Z0-9_.-]+)\s*\}\}$/)?.[1]
                ?? (variableOptions.some((option) => option.value === saveDataSourceValue) ? saveDataSourceValue : "");
              const selectedInputKey = saveDataSourceValue.match(/^\{\{\s*inputs\.([a-zA-Z0-9_.-]+)\s*\}\}$/)?.[1]
                ?? (inputSchema.some((item) => item.key === saveDataSourceValue) ? saveDataSourceValue : "");

              return (
                <div
                  key={field.name}
                  className="space-y-4 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4"
                >
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-zinc-200">数据来源</label>
                    <div className="text-xs leading-5 text-zinc-500">
                      先选择你要保存的数据形态，再选择数据来自哪里。系统会按下面的配置写入数据中心。
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                      1. 选择写入形态
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      {modeCards.map((option) => {
                        const active = saveDataSourceMode === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setSaveDataSourceMode(option.value)}
                            className={cn(
                              "rounded-2xl border p-4 text-left transition-all",
                              active
                                ? "border-sky-400/50 bg-sky-500/12 shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
                                : "border-white/[0.06] bg-black/20 hover:border-white/[0.16] hover:bg-white/[0.03]",
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-zinc-100">{option.title}</div>
                              <div
                                className={cn(
                                  "h-3 w-3 rounded-full border",
                                  active
                                    ? "border-sky-300 bg-sky-300 shadow-[0_0_14px_rgba(125,211,252,0.45)]"
                                    : "border-white/20 bg-transparent",
                                )}
                              />
                            </div>
                            <div className="mt-2 text-xs leading-5 text-zinc-400">{option.description}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                      2. 选择数据来自哪里
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {bindingCards.map((option) => {
                        const active = saveDataSourceBindingType === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setSaveDataSourceBindingType(option.value)}
                            className={cn(
                              "rounded-2xl border p-4 text-left transition-all",
                              active
                                ? "border-cyan-400/50 bg-cyan-500/12 shadow-[0_0_0_1px_rgba(34,211,238,0.16)]"
                                : "border-white/[0.06] bg-black/20 hover:border-white/[0.16] hover:bg-white/[0.03]",
                            )}
                          >
                            <div className="text-sm font-medium text-zinc-100">{option.title}</div>
                            <div className="mt-2 text-xs leading-5 text-zinc-400">{option.description}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {saveDataSourceBindingType === "variable" ? (
                    <div className="space-y-3">
                      <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                        变量选择
                      </label>
                      <Select
                        value={selectedVariableKey}
                        onChange={(value) => handleChange("sourceVariable", `{{variables.${value}}}`)}
                        placeholder="选择一个流程变量"
                        searchable
                        options={variableOptions}
                      />
                      <Input
                        value={saveDataSourceValue}
                        onChange={(event) => handleChange("sourceVariable", event.target.value)}
                        placeholder={getDefaultSaveDataSourceValue(saveDataSourceMode, "variable")}
                      />
                    </div>
                  ) : null}

                  {saveDataSourceBindingType === "input" ? (
                    <div className="space-y-3">
                      <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                        参数选择
                      </label>
                      <Select
                        value={selectedInputKey}
                        onChange={(value) => handleChange("sourceVariable", `{{inputs.${value}}}`)}
                        placeholder="选择一个运行参数"
                        options={inputSchema.map((item) => ({
                          value: item.key,
                          label: item.label || item.key,
                          description: `{{inputs.${item.key}}}`,
                          group: "运行参数",
                        }))}
                      />
                      <Input
                        value={saveDataSourceValue}
                        onChange={(event) => handleChange("sourceVariable", event.target.value)}
                        placeholder={getDefaultSaveDataSourceValue(saveDataSourceMode, "input")}
                      />
                    </div>
                  ) : null}

                  {saveDataSourceBindingType === "inline" ? (
                    <div className="space-y-3">
                      <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                        {saveDataSourceMode === "plain_text" ? "直接填写文本" : "直接填写 JSON"}
                      </label>
                      {saveDataSourceMode === "plain_text" ? (
                        <textarea
                          value={saveDataSourceValue}
                          onChange={(event) => handleChange("sourceVariable", event.target.value)}
                          placeholder={getDefaultSaveDataSourceValue(saveDataSourceMode, "inline")}
                          spellCheck={false}
                          className="min-h-[120px] w-full rounded-2xl border border-white/[0.08] bg-black/20 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-sky-400/40 focus:bg-black/30"
                        />
                      ) : (
                        <textarea
                          value={saveDataSourceValue}
                          onChange={(event) => handleChange("sourceVariable", event.target.value)}
                          placeholder={getDefaultSaveDataSourceValue(saveDataSourceMode, "inline")}
                          spellCheck={false}
                          className="min-h-[180px] w-full rounded-2xl border border-white/[0.08] bg-black/20 px-3 py-3 font-mono text-sm leading-6 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-sky-400/40 focus:bg-black/30"
                        />
                      )}
                    </div>
                  ) : null}

                  {saveDataSourceBindingType === "template" ? (
                    <div className="space-y-3">
                      <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                        模板表达式
                      </label>
                      <textarea
                        value={saveDataSourceValue}
                        onChange={(event) => handleChange("sourceVariable", event.target.value)}
                        placeholder={getDefaultSaveDataSourceValue(saveDataSourceMode, "template")}
                        spellCheck={false}
                        className="min-h-[140px] w-full rounded-2xl border border-white/[0.08] bg-black/20 px-3 py-3 font-mono text-sm leading-6 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-sky-400/40 focus:bg-black/30"
                      />
                      <div className="rounded-xl border border-white/[0.05] bg-black/10 px-3 py-3 text-xs leading-6 text-zinc-500">
                        可用示例：
                        <code className="mx-1 rounded bg-black/20 px-1.5 py-0.5">{`{{variables.orders}}`}</code>
                        <code className="mr-1 rounded bg-black/20 px-1.5 py-0.5">{`{{inputs.payload}}`}</code>
                        <code className="rounded bg-black/20 px-1.5 py-0.5">{`{{item.id}}-{{index}}`}</code>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-cyan-500/10 bg-cyan-500/5 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] text-cyan-100">
                        当前形态：{getFriendlySaveDataModeTitle(saveDataSourceMode)}
                      </span>
                      <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-zinc-300">
                        来源方式：{getFriendlySaveDataBindingLabel(saveDataSourceBindingType)}
                      </span>
                    </div>
                    <div className="mt-3 text-xs leading-6 text-zinc-400">
                      {getSaveDataModeDescription(saveDataSourceMode)}
                    </div>
                    <div className="mt-3 rounded-xl border border-white/[0.05] bg-black/20 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                        实时写入预览
                      </div>
                      <div className="mt-2 text-xs leading-6 text-zinc-500">{saveDataPreview.note}</div>
                      <pre className="mt-3 overflow-auto rounded-lg bg-black/30 p-3 font-mono text-[11px] leading-5 text-zinc-300">
                        {JSON.stringify(saveDataPreview.preview, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              );
            }

            if (nodeType === "save_data" && field.name === "fieldMappings") {
              const canAutoGenerateMappings =
                saveDataSourceFieldInfo.canAutoInfer && saveDataGeneratedMappingRows.length > 0;

              return (
                <div
                  key={field.name}
                  className="space-y-4 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4"
                >
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-zinc-200">5. 保存后的字段</label>
                    <div className="text-xs leading-5 text-zinc-500">
                      左边写保存到数据中心后的字段名，右边选择这个字段的值从哪里来。你要的业务字段名可以自己定义。
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl border border-cyan-500/10 bg-cyan-500/5 px-3 py-2 text-[11px] leading-5 text-cyan-100">
                      常用映射已经可视化，不需要再手写 JSON。右侧高级模式仅用于兼容复杂历史映射。
                    </div>
                    <div
                      className={cn(
                        "rounded-xl px-3 py-3 text-xs leading-6",
                        saveDataSourceFieldInfo.canAutoInfer
                          ? "border border-emerald-500/15 bg-emerald-500/10 text-emerald-100"
                          : "border border-amber-500/15 bg-amber-500/10 text-amber-100",
                      )}
                    >
                      {saveDataSourceFieldInfo.hint}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
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
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!canAutoGenerateMappings}
                        onClick={replaceSaveDataMappingsFromSourceFields}
                        title={
                          canAutoGenerateMappings
                            ? "按来源字段自动生成映射"
                            : saveDataSourceFieldInfo.hint
                        }
                      >
                        一键生成映射表
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

                          {row.sourceType === "item" ? (
                            <div className="space-y-2">
                              <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                                来源字段
                              </label>
                              {saveDataSourceFieldInfo.canAutoInfer ? (
                                <Select
                                  value={row.value}
                                  onChange={(value) =>
                                    updateSaveDataMapping(row.id, (current) => ({
                                      ...current,
                                      value,
                                    }))
                                  }
                                  placeholder="选择来源字段"
                                  searchable
                                  options={appendCurrentFieldOption(
                                    saveDataSourceFieldInfo.options,
                                    row.value,
                                  )}
                                />
                              ) : (
                                <Input
                                  type="text"
                                  value={row.value}
                                  onChange={(event) =>
                                    updateSaveDataMapping(row.id, (current) => ({
                                      ...current,
                                      value: event.target.value,
                                    }))
                                  }
                                  placeholder="如 orderNo / data.amount"
                                />
                              )}
                              <div className="text-[11px] leading-5 text-zinc-500">
                                {saveDataSourceFieldInfo.canAutoInfer
                                  ? `最终会读取 {{item.${row.value || "字段名"}}}`
                                  : saveDataSourceFieldInfo.hint}
                              </div>
                            </div>
                          ) : null}

                          {row.sourceType !== "input" &&
                          row.sourceType !== "item" &&
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

            if (nodeType === "save_data" && field.name === "writeMode") {
              const currentWriteMode = String(localData.writeMode ?? "upsert");

              return (
                <div
                  key={field.name}
                  className="space-y-4 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4"
                >
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-zinc-200">3. 重复数据怎么处理</label>
                    <div className="text-xs leading-5 text-zinc-500">
                      这一项决定相同数据再次出现时，是更新旧记录、跳过，还是继续追加一条新记录。
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {(field.options ?? []).map((option) => {
                      const active = currentWriteMode === option.value;

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
                          <div className="text-sm font-medium text-zinc-100">
                            {getFriendlySaveDataWriteModeTitle(option.value)}
                          </div>
                          <div className="mt-2 text-xs leading-5 text-zinc-400">
                            {getFriendlySaveDataWriteModeDescription(option.value)}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-xl border border-sky-500/10 bg-sky-500/5 px-3 py-3 text-xs leading-6 text-sky-100">
                    当前选择：{getFriendlySaveDataWriteModeTitle(currentWriteMode)}。{getFriendlySaveDataWriteModeDescription(currentWriteMode)}
                  </div>
                </div>
              );
            }

            if (nodeType === "save_data" && field.name === "recordKeyTemplate") {
              const currentWriteMode = String(localData.writeMode ?? "upsert");
              const requiresRecordKey = isFriendlySaveDataRecordKeyRequired(currentWriteMode);
              const selectedRecordKeyField = extractExactItemTemplateField(currentValue);
              const recordKeyFieldOptions = appendCurrentFieldOption(
                saveDataSourceFieldInfo.recommendedRecordKeyOptions,
                selectedRecordKeyField,
              );

              return (
                <div
                  key={field.name}
                  className="space-y-4 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4"
                >
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-zinc-200">4. 唯一标识</label>
                    <div className="text-xs leading-5 text-zinc-500">
                      用来判断“这是不是同一条数据”。例如订单号、用户 ID、商品 SKU。只有更新/去重模式才需要它。
                    </div>
                  </div>

                  <div
                    className={cn(
                      "rounded-xl px-3 py-3 text-xs leading-6",
                      requiresRecordKey
                        ? "border border-amber-500/15 bg-amber-500/10 text-amber-100"
                        : "border border-emerald-500/15 bg-emerald-500/10 text-emerald-100",
                    )}
                  >
                    {getFriendlySaveDataRecordKeyHelp(currentWriteMode)}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                      优先选择唯一标识字段
                    </label>
                    {saveDataSourceFieldInfo.canAutoInfer ? (
                      <Select
                        value={selectedRecordKeyField}
                        onChange={(value) =>
                          handleChange(field.name, value ? `{{item.${value}}}` : "")
                        }
                        placeholder="选择唯一标识字段"
                        searchable
                        options={recordKeyFieldOptions}
                      />
                    ) : (
                      <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 px-3 py-3 text-xs leading-6 text-amber-100">
                        {saveDataSourceFieldInfo.hint}
                      </div>
                    )}
                    {saveDataSourceFieldInfo.canAutoInfer ? (
                      <div className="text-xs leading-6 text-zinc-500">
                        推荐优先选择 `id`、`key`、`orderNo`、`sku` 这类天然唯一的字段。
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                      唯一标识模板
                    </label>
                    <Input
                      value={currentValue}
                      onChange={(event) => handleChange(field.name, event.target.value)}
                      placeholder={requiresRecordKey ? "{{item.id}} / {{item.orderNo}} / {{item.shopId}}-{{item.orderNo}}" : "当前模式可留空"}
                    />
                    <div className="flex flex-wrap gap-2">
                      {["{{item.id}}", "{{item.key}}", "{{index}}", "{{item.id}}-{{index}}"].map((template) => (
                        <button
                          key={template}
                          type="button"
                          onClick={() => handleChange(field.name, template)}
                          className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:border-sky-400/30 hover:text-sky-200"
                        >
                          {template}
                        </button>
                      ))}
                    </div>
                    <div className="text-xs leading-6 text-zinc-500">
                      不会写模板也没关系：如果你的来源对象里本身就有 <code className="rounded bg-black/20 px-1.5 py-0.5">id</code> 或 <code className="rounded bg-black/20 px-1.5 py-0.5">key</code> 字段，可以先留空试一下。
                    </div>
                  </div>
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
                ) : field.name === "selector" && field.type === "text" ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Input
                        type="text"
                        value={currentValue}
                        onChange={(event) => handleChange(field.name, event.target.value)}
                        placeholder={field.placeholder}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2 px-3"
                        disabled={!taskId || !isTaskRunning || !screenshotSrc}
                        onClick={() => openSelectorPicker(field.name)}
                        title={
                          !taskId || !isTaskRunning || !screenshotSrc
                            ? "请先运行工作流并停在目标页面，再从当前页面选取元素"
                            : "从当前运行页面选取元素"
                        }
                      >
                        <MousePointerClick className="h-4 w-4" />
                        选取
                      </Button>
                    </div>

                    {!taskId || !isTaskRunning || !screenshotSrc ? (
                      <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-3 text-xs leading-5 text-zinc-500">
                        先运行工作流并停在目标页面，再点击“选取”。系统会根据当前页面截图点击位置自动识别元素并回填推荐定位方式。
                      </div>
                    ) : null}

                    {pickedSelectorResults[field.name] ? (
                      <div className="space-y-3 rounded-2xl border border-sky-500/10 bg-sky-500/5 p-4">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-sky-100">
                          <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1">
                            {pickedSelectorResults[field.name]?.tagName || "element"}
                          </span>
                          {pickedSelectorResults[field.name]?.textPreview ? (
                            <span className="truncate rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-zinc-300">
                              {pickedSelectorResults[field.name]?.textPreview}
                            </span>
                          ) : null}
                        </div>

                        <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3">
                          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                            推荐定位
                          </div>
                          <div className="mt-2 break-all font-mono text-xs leading-6 text-zinc-100">
                            {pickedSelectorResults[field.name]?.selector}
                          </div>
                        </div>

                        {pickedSelectorResults[field.name]?.candidates?.length ? (
                          <div className="space-y-2">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                              其他候选
                            </div>
                            <div className="space-y-2">
                              {pickedSelectorResults[field.name]?.candidates?.map((candidate) => {
                                const active = candidate.selector === String(localData[field.name] ?? "");

                                return (
                                  <button
                                    key={`${field.name}-${candidate.selector}`}
                                    type="button"
                                    onClick={() =>
                                      applyPickedSelector(
                                        field.name,
                                        pickedSelectorResults[field.name] as TaskElementPickerResult,
                                        candidate.selector,
                                      )
                                    }
                                    className={cn(
                                      "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                                      active
                                        ? "border-sky-400/30 bg-sky-500/12"
                                        : "border-white/[0.06] bg-black/20 hover:border-white/[0.14] hover:bg-white/[0.03]",
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="text-xs font-medium text-zinc-100">
                                        {candidate.label}
                                      </div>
                                      <div
                                        className={cn(
                                          "rounded-full px-2 py-0.5 text-[10px]",
                                          candidate.isUnique
                                            ? "bg-emerald-500/15 text-emerald-200"
                                            : "bg-amber-500/15 text-amber-100",
                                        )}
                                      >
                                        {candidate.isUnique ? "唯一匹配" : "可能多项"}
                                      </div>
                                    </div>
                                    <div className="mt-2 break-all font-mono text-[11px] leading-5 text-zinc-400">
                                      {candidate.selector}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
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

      <Dialog open={pickerDialogOpen} onOpenChange={setPickerDialogOpen} className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>从当前页面选取元素</DialogTitle>
          <DialogDescription>
            {pageUrl?.trim()
              ? `当前页面：${pageUrl}`
              : "请直接在下方当前页面截图中点击目标元素，系统会自动生成推荐定位方式。"}
          </DialogDescription>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div className="rounded-2xl border border-white/[0.06] bg-black/30 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-sky-100">
                第一步：把目标元素展示在当前运行页面中
              </span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1">
                第二步：直接点击元素位置
              </span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1">
                第三步：系统自动回填选择器
              </span>
            </div>

            {screenshotSrc ? (
              <div className="overflow-auto rounded-2xl border border-white/[0.08] bg-[#050505] p-2">
                <img
                  src={screenshotSrc}
                  alt="当前运行页面截图"
                  onClick={handlePickerImageClick}
                  className={cn(
                    "mx-auto max-h-[70vh] cursor-crosshair rounded-xl object-contain",
                    isPickingElement ? "pointer-events-none opacity-70" : "hover:ring-2 hover:ring-sky-400/40",
                  )}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-10 text-center text-sm text-zinc-500">
                当前还没有可用页面截图，请先运行工作流并停在目标页面。
              </div>
            )}

            {pickerError ? (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-sm text-red-100">
                {pickerError}
              </div>
            ) : null}
          </div>
        </DialogContent>
        <DialogFooter>
          <div className="mr-auto text-xs text-zinc-500">
            {isPickingElement
              ? "正在识别当前点击位置对应的页面元素..."
              : "如果识别结果不理想，可以换一个更明确的元素区域重新点一次。"}
          </div>
          <Button variant="ghost" onClick={() => setPickerDialogOpen(false)} disabled={isPickingElement}>
            关闭
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
