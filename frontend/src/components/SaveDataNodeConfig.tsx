import { useCallback, useEffect, useMemo, useState } from "react";
import { GripVertical, Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Select, type SelectOption } from "@/src/components/ui/Select";
import { cn } from "@/src/lib/utils";
import type { WorkflowInputField } from "@/src/lib/cloudflow";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SaveDataFieldSourceType =
  | "item"
  | "variable"
  | "input"
  | "text"
  | "template"
  | "current_datetime"
  | "current_date"
  | "number"
  | "boolean"
  | "null";

interface SaveDataSimpleRow {
  id: string;
  key: string;
  sourceType: SaveDataFieldSourceType;
  value: string;
  comment: string;
}

interface SaveDataNodeConfigProps {
  localData: Record<string, unknown>;
  inputSchema: WorkflowInputField[];
  variableOptions: SelectOption[];
  onPatch: (patch: Record<string, unknown>) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function createRow(
  sourceType: SaveDataFieldSourceType = "item",
  value = "",
  key = "",
  comment = "",
  id?: string,
): SaveDataSimpleRow {
  return {
    id: id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key,
    sourceType,
    value,
    comment,
  };
}

function tryParseJson(raw: string) {
  const normalized = raw.trim();
  if (!normalized) return null;
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    return undefined;
  }
}

function collectObjectPaths(
  value: unknown,
  prefix = "",
  collector: Set<string> = new Set<string>(),
): Set<string> {
  if (value === null || value === undefined) return collector;

  if (Array.isArray(value)) {
    const objectItems = value.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object" && !Array.isArray(item),
    );
    if (objectItems.length > 0) {
      objectItems.slice(0, 5).forEach((item) => collectObjectPaths(item, prefix, collector));
      return collector;
    }
    if (prefix) collector.add(prefix);
    return collector;
  }

  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([k, child]) => {
      const nextPrefix = prefix ? `${prefix}.${k}` : k;
      if (child !== null && typeof child === "object") {
        collectObjectPaths(child, nextPrefix, collector);
        return;
      }
      collector.add(nextPrefix);
    });
  }

  return collector;
}

function getLeafName(path: string) {
  const parts = path.split(".").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function createUniqueKey(baseKey: string, used: Set<string>) {
  const normalized = baseKey.trim() || "field";
  if (!used.has(normalized)) {
    used.add(normalized);
    return normalized;
  }
  let index = 2;
  let candidate = `${normalized}_${index}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${normalized}_${index}`;
  }
  used.add(candidate);
  return candidate;
}

/* ------------------------------------------------------------------ */
/*  Parse / Serialize field mappings (backward compatible)              */
/* ------------------------------------------------------------------ */

function parseRows(raw: string, previousRows: SaveDataSimpleRow[] = []): SaveDataSimpleRow[] {
  const normalized = raw.trim();
  if (!normalized) {
    return [createRow("item", "", "", "", previousRows[0]?.id)];
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;

    if (Array.isArray(parsed)) {
      const rows = parsed
        .map((item, index) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const record = item as Record<string, unknown>;
          const key = String(record.key ?? record.field ?? "").trim();
          if (!key) return null;
          return createRow(
            String(record.sourceType ?? "item") as SaveDataFieldSourceType,
            String(record.value ?? ""),
            key,
            String(record.comment ?? ""),
            previousRows[index]?.id,
          );
        })
        .filter((item): item is SaveDataSimpleRow => Boolean(item));

      return rows.length > 0 ? rows : [createRow("item", "", "", "", previousRows[0]?.id)];
    }

    if (parsed && typeof parsed === "object") {
      const rows = Object.entries(parsed as Record<string, unknown>).map(([key, value], index) => {
        if (typeof value === "string") {
          const itemField = value.match(/^\{\{\s*item\.([a-zA-Z0-9_.-]+)\s*\}\}$/)?.[1];
          const variableField = value.match(/^\{\{\s*variables\.([a-zA-Z0-9_.-]+)\s*\}\}$/)?.[1];
          const inputField = value.match(/^\{\{\s*inputs\.([a-zA-Z0-9_.-]+)\s*\}\}$/)?.[1];

          if (itemField) return createRow("item", itemField, key, "", previousRows[index]?.id);
          if (variableField) return createRow("variable", variableField, key, "", previousRows[index]?.id);
          if (inputField) return createRow("input", inputField, key, "", previousRows[index]?.id);
          if (value.includes("{{") && value.includes("}}")) return createRow("template", value, key, "", previousRows[index]?.id);
          return createRow("text", value, key, "", previousRows[index]?.id);
        }
        return createRow("text", String(value ?? ""), key, "", previousRows[index]?.id);
      });

      return rows.length > 0 ? rows : [createRow("item", "", "", "", previousRows[0]?.id)];
    }
  } catch {
    return [createRow("text", raw, "value", "", previousRows[0]?.id)];
  }

  return [createRow("item", "", "", "", previousRows[0]?.id)];
}

function serializeRows(rows: SaveDataSimpleRow[]) {
  const payload = rows
    .map((row) => ({
      key: row.key.trim(),
      sourceType: row.sourceType,
      value: row.value,
      comment: row.comment.trim(),
    }))
    .filter((row) => row.key);

  return payload.length > 0 ? JSON.stringify(payload, null, 2) : "";
}

/* ------------------------------------------------------------------ */
/*  Infer binding type from sourceVariable                             */
/* ------------------------------------------------------------------ */

type BindingType = "variable" | "input" | "inline" | "template";

function inferBindingType(
  sourceValue: string,
  variableKeys: string[],
  inputKeys: string[],
): BindingType {
  const trimmed = sourceValue.trim();
  if (!trimmed) return "variable";

  const directTemplate = trimmed.match(/^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/)?.[1] ?? "";
  if (directTemplate.startsWith("variables.")) return "variable";
  if (directTemplate.startsWith("inputs.")) return "input";
  if (trimmed.includes("{{") && trimmed.includes("}}")) return "template";

  const parsed = tryParseJson(trimmed);
  if (parsed !== undefined && parsed !== null) return "inline";
  if (variableKeys.includes(trimmed)) return "variable";
  if (inputKeys.includes(trimmed)) return "input";
  return "inline";
}

function getDefaultSourceValue(bindingType: BindingType) {
  switch (bindingType) {
    case "variable":
      return "{{variables.data}}";
    case "input":
      return "{{inputs.payload}}";
    case "template":
      return "{{variables.data}}";
    default:
      return '{\n  "id": "demo-1",\n  "name": "示例记录"\n}';
  }
}

/* ------------------------------------------------------------------ */
/*  Value source options (grouped for Select)                          */
/* ------------------------------------------------------------------ */

function buildValueOptions(
  itemPaths: string[],
  variableOptions: SelectOption[],
  inputSchema: WorkflowInputField[],
): SelectOption[] {
  const options: SelectOption[] = [];

  // Item fields (from data source)
  if (itemPaths.length > 0) {
    for (const path of itemPaths) {
      options.push({
        value: `__item__${path}`,
        label: path,
        description: `从数据的 ${path} 读取`,
        group: "从数据取值",
        keywords: [getLeafName(path)],
      });
    }
  } else {
    options.push({
      value: "__item__",
      label: "当前条目",
      description: "整个数据条目作为值",
      group: "从数据取值",
    });
  }

  // Workflow variables
  for (const v of variableOptions) {
    options.push({
      value: `__variable__${v.value}`,
      label: v.label || v.value,
      description: v.description || `变量 ${v.value}`,
      group: "流程变量",
      keywords: [v.value],
    });
  }

  // Runtime inputs
  for (const inp of inputSchema) {
    options.push({
      value: `__input__${inp.key}`,
      label: inp.label || inp.key,
      description: `运行参数 ${inp.key}`,
      group: "运行参数",
      keywords: [inp.key],
    });
  }

  // Built-in functions
  options.push(
    {
      value: "__func__current_datetime",
      label: "当前时间",
      description: "自动写入当前日期时间 (YYYY-MM-DD HH:mm:ss)",
      group: "内置函数",
    },
    {
      value: "__func__current_date",
      label: "当前日期",
      description: "自动写入当前日期 (YYYY-MM-DD)",
      group: "内置函数",
    },
  );

  // Fixed value options
  options.push(
    {
      value: "__text__",
      label: "固定文本",
      description: "直接输入一段固定文本",
      group: "固定值",
    },
    {
      value: "__template__",
      label: "模板拼接",
      description: "用 {{}} 语法拼接多个值",
      group: "固定值",
    },
  );

  return options;
}

/** Decode a Select option value back to (sourceType, actualValue) */
function decodeOptionValue(
  optionValue: string,
): { sourceType: SaveDataFieldSourceType; value: string } {
  if (optionValue.startsWith("__item__")) {
    const path = optionValue.slice(8);
    return { sourceType: "item", value: path };
  }
  if (optionValue.startsWith("__variable__")) {
    return { sourceType: "variable", value: optionValue.slice(12) };
  }
  if (optionValue.startsWith("__input__")) {
    return { sourceType: "input", value: optionValue.slice(9) };
  }
  if (optionValue.startsWith("__func__")) {
    const funcName = optionValue.slice(8) as SaveDataFieldSourceType;
    return { sourceType: funcName, value: "" };
  }
  if (optionValue === "__text__") {
    return { sourceType: "text", value: "" };
  }
  if (optionValue === "__template__") {
    return { sourceType: "template", value: "" };
  }
  return { sourceType: "text", value: optionValue };
}

/** Encode a row's (sourceType, value) into a Select option value */
function encodeOptionValue(row: SaveDataSimpleRow): string {
  switch (row.sourceType) {
    case "item":
      return `__item__${row.value}`;
    case "variable":
      return `__variable__${row.value}`;
    case "input":
      return `__input__${row.value}`;
    case "current_datetime":
      return "__func__current_datetime";
    case "current_date":
      return "__func__current_date";
    case "text":
      return "__text__";
    case "template":
      return "__template__";
    default:
      return "__text__";
  }
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ValueCell({
  row,
  valueOptions,
  onChange,
}: {
  row: SaveDataSimpleRow;
  valueOptions: SelectOption[];
  onChange: (sourceType: SaveDataFieldSourceType, value: string) => void;
}) {
  const currentOptionValue = encodeOptionValue(row);
  const needsTextInput =
    row.sourceType === "text" ||
    row.sourceType === "template" ||
    row.sourceType === "number" ||
    row.sourceType === "boolean";

  return (
    <div className="space-y-1.5">
      <Select
        value={currentOptionValue}
        onChange={(val) => {
          const decoded = decodeOptionValue(val);
          onChange(decoded.sourceType, decoded.value);
        }}
        options={valueOptions}
        placeholder="选择值来源"
        searchable
        searchPlaceholder="搜索字段、变量、参数..."
        className="min-w-[200px]"
      />
      {needsTextInput ? (
        <Input
          value={row.value}
          onChange={(e) => onChange(row.sourceType, e.target.value)}
          placeholder={
            row.sourceType === "template"
              ? "{{item.id}}-{{variables.suffix}}"
              : row.sourceType === "text"
                ? "输入固定文本"
                : "输入值"
          }
          className="font-mono text-xs"
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function SaveDataNodeConfig({
  localData,
  inputSchema,
  variableOptions,
  onPatch,
}: SaveDataNodeConfigProps) {
  const sourceValue = String(localData.sourceVariable ?? "");
  const currentRowsRaw = String(localData.fieldMappings ?? "");
  const [rows, setRows] = useState<SaveDataSimpleRow[]>(() => parseRows(currentRowsRaw));
  const [primaryKeyField, setPrimaryKeyField] = useState(String(localData.primaryKeyField ?? ""));

  useEffect(() => {
    setRows((prev) => parseRows(String(localData.fieldMappings ?? ""), prev));
  }, [localData.fieldMappings]);

  useEffect(() => {
    setPrimaryKeyField(String(localData.primaryKeyField ?? ""));
  }, [localData.primaryKeyField]);

  const bindingType = useMemo(
    () =>
      inferBindingType(
        sourceValue,
        variableOptions.map((item) => item.value),
        inputSchema.map((item) => item.key),
      ),
    [inputSchema, sourceValue, variableOptions],
  );

  // Collect item paths from inline JSON
  const itemPaths = useMemo(() => {
    if (bindingType !== "inline") return [] as string[];
    const parsed = tryParseJson(sourceValue);
    if (parsed === undefined || parsed === null) return [] as string[];
    return Array.from(collectObjectPaths(parsed)).sort((a, b) => a.localeCompare(b));
  }, [bindingType, sourceValue]);

  // Build the grouped value options for the table Select
  const valueOptions = useMemo(
    () => buildValueOptions(itemPaths, variableOptions, inputSchema),
    [itemPaths, variableOptions, inputSchema],
  );

  // Primary key options from current row keys
  const rowKeyOptions = useMemo(
    () => [
      { value: "", label: "不使用主键", description: "每次默认新增记录" },
      ...rows
        .map((r) => r.key.trim())
        .filter(Boolean)
        .map((key) => ({
          value: key,
          label: key,
          description: `按字段 ${key} 判断是否更新`,
        })),
    ],
    [rows],
  );

  const selectedVariableKey =
    sourceValue.match(/^\{\{\s*variables\.([a-zA-Z0-9_.-]+)\s*\}\}$/)?.[1] ??
    (variableOptions.some((item) => item.value === sourceValue) ? sourceValue : "");
  const selectedInputKey =
    sourceValue.match(/^\{\{\s*inputs\.([a-zA-Z0-9_.-]+)\s*\}\}$/)?.[1] ??
    (inputSchema.some((item) => item.key === sourceValue) ? sourceValue : "");

  /* ---- mutations ---- */

  const pushPatch = useCallback(
    (nextRows: SaveDataSimpleRow[], nextPrimaryKeyField = primaryKeyField) => {
      setRows(nextRows);
      setPrimaryKeyField(nextPrimaryKeyField);
      onPatch({
        fieldMappings: serializeRows(nextRows),
        primaryKeyField: nextPrimaryKeyField,
        recordMode: undefined,
        writeMode: undefined,
        recordKeyTemplate: "",
      });
    },
    [onPatch, primaryKeyField],
  );

  const updateRow = useCallback(
    (rowId: string, updater: (row: SaveDataSimpleRow) => SaveDataSimpleRow) => {
      pushPatch(rows.map((r) => (r.id === rowId ? updater(r) : r)));
    },
    [pushPatch, rows],
  );

  const addRow = useCallback(() => {
    pushPatch([...rows, createRow()]);
  }, [pushPatch, rows]);

  const removeRow = useCallback(
    (rowId: string) => {
      const nextRows = rows.filter((r) => r.id !== rowId);
      const nextPK = nextRows.some((r) => r.key.trim() === primaryKeyField) ? primaryKeyField : "";
      pushPatch(nextRows.length > 0 ? nextRows : [createRow()], nextPK);
    },
    [pushPatch, rows, primaryKeyField],
  );

  const generateFromSource = useCallback(() => {
    if (itemPaths.length === 0) return;
    const usedKeys = new Set<string>();
    const nextRows = itemPaths.map((path) =>
      createRow("item", path, createUniqueKey(getLeafName(path), usedKeys), ""),
    );
    pushPatch(nextRows);
  }, [itemPaths, pushPatch]);

  // Move row (drag reorder)
  const moveRow = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const next = [...rows];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      pushPatch(next);
    },
    [pushPatch, rows],
  );

  /* ---- preview ---- */

  const preview = useMemo(() => {
    if (rows.every((r) => !r.key.trim())) return {};
    return rows.reduce<Record<string, unknown>>((acc, r) => {
      if (!r.key.trim()) return acc;
      switch (r.sourceType) {
        case "item":
          acc[r.key.trim()] = r.value ? `{{item.${r.value}}}` : "{{item}}";
          break;
        case "variable":
          acc[r.key.trim()] = `{{variables.${r.value}}}`;
          break;
        case "input":
          acc[r.key.trim()] = `{{inputs.${r.value}}}`;
          break;
        case "current_datetime":
          acc[r.key.trim()] = "[当前时间]";
          break;
        case "current_date":
          acc[r.key.trim()] = "[当前日期]";
          break;
        default:
          acc[r.key.trim()] = r.value;
      }
      return acc;
    }, {});
  }, [rows]);

  /* ---- render ---- */

  return (
    <div className="space-y-6">
      {/* Section 1: Data Collection */}
      <div className="space-y-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-200">1. 数据集</label>
          <div className="text-xs leading-5 text-zinc-500">
            数据集标识可以直接写中文，系统自动生成内部 key。
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              数据集标识
            </label>
            <Input
              value={String(localData.collectionKey ?? "")}
              onChange={(e) => onPatch({ collectionKey: e.target.value })}
              placeholder="如 每日订单 / 用户资料"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              显示名称
            </label>
            <Input
              value={String(localData.collectionName ?? "")}
              onChange={(e) => onPatch({ collectionName: e.target.value })}
              placeholder="可选，不填时默认与上面一致"
            />
          </div>
        </div>
      </div>

      {/* Section 2: Data Source */}
      <div className="space-y-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-200">2. 数据来源</label>
          <div className="text-xs leading-5 text-zinc-500">
            选择数据从哪里来。如果来源是数组，系统自动拆成多条记录。
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { value: "variable", title: "流程变量", desc: "从前面节点产出的变量" },
            { value: "input", title: "运行参数", desc: "启动工作流时传入的参数" },
            { value: "inline", title: "直接填写", desc: "贴 JSON 或文本示例" },
            { value: "template", title: "模板", desc: "用 {{}} 拼接复杂值" },
          ].map((opt) => {
            const active = bindingType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onPatch({ sourceVariable: getDefaultSourceValue(opt.value as BindingType) })}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all",
                  active
                    ? "border-cyan-400/50 bg-cyan-500/12 shadow-[0_0_0_1px_rgba(34,211,238,0.16)]"
                    : "border-white/[0.06] bg-black/20 hover:border-white/[0.16] hover:bg-white/[0.03]",
                )}
              >
                <div className="text-sm font-medium text-zinc-100">{opt.title}</div>
                <div className="mt-1 text-xs text-zinc-500">{opt.desc}</div>
              </button>
            );
          })}
        </div>

        {bindingType === "variable" ? (
          <div className="space-y-2">
            <Select
              value={selectedVariableKey}
              onChange={(v) => onPatch({ sourceVariable: `{{variables.${v}}}` })}
              placeholder="选择一个流程变量"
              searchable
              options={variableOptions}
            />
            <Input
              value={sourceValue}
              onChange={(e) => onPatch({ sourceVariable: e.target.value })}
              placeholder="{{variables.data}}"
              className="font-mono text-xs"
            />
          </div>
        ) : null}

        {bindingType === "input" ? (
          <div className="space-y-2">
            <Select
              value={selectedInputKey}
              onChange={(v) => onPatch({ sourceVariable: `{{inputs.${v}}}` })}
              placeholder="选择一个运行参数"
              options={inputSchema.map((i) => ({
                value: i.key,
                label: i.label || i.key,
                description: `{{inputs.${i.key}}}`,
              }))}
            />
            <Input
              value={sourceValue}
              onChange={(e) => onPatch({ sourceVariable: e.target.value })}
              placeholder="{{inputs.payload}}"
              className="font-mono text-xs"
            />
          </div>
        ) : null}

        {bindingType === "inline" || bindingType === "template" ? (
          <textarea
            value={sourceValue}
            onChange={(e) => onPatch({ sourceVariable: e.target.value })}
            placeholder={getDefaultSourceValue(bindingType)}
            spellCheck={false}
            className="min-h-[120px] w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3 font-mono text-sm leading-6 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-sky-400/40 focus:bg-black/30"
          />
        ) : null}
      </div>

      {/* Section 3: Field Table (Excel-like) */}
      <div className="space-y-4 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-200">3. 保存字段</label>
            <div className="text-xs leading-5 text-zinc-500">
              像填表格一样配置每个字段的名称和值来源。
            </div>
          </div>
          <div className="flex items-center gap-2">
            {itemPaths.length > 0 ? (
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={generateFromSource}>
                <Wand2 className="h-3.5 w-3.5" />
                从数据自动生成
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" />
              添加字段
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="w-8 px-2 py-2.5" />
                <th className="min-w-[140px] px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  字段名
                </th>
                <th className="min-w-[240px] px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  值来源
                </th>
                <th className="min-w-[140px] px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  备注
                </th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.id}
                  className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(index));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    if (!Number.isNaN(from)) moveRow(from, index);
                  }}
                >
                  {/* Drag handle */}
                  <td className="px-2 py-2 text-center">
                    <GripVertical className="inline h-4 w-4 cursor-grab text-zinc-600" />
                  </td>

                  {/* Field name */}
                  <td className="px-3 py-2">
                    <Input
                      value={row.key}
                      onChange={(e) =>
                        updateRow(row.id, (r) => ({ ...r, key: e.target.value }))
                      }
                      placeholder="如 orderNo / amount"
                      className="h-8 text-xs"
                    />
                  </td>

                  {/* Value source */}
                  <td className="px-3 py-2">
                    <ValueCell
                      row={row}
                      valueOptions={valueOptions}
                      onChange={(sourceType, value) =>
                        updateRow(row.id, (r) => ({ ...r, sourceType, value }))
                      }
                    />
                  </td>

                  {/* Comment */}
                  <td className="px-3 py-2">
                    <Input
                      value={row.comment}
                      onChange={(e) =>
                        updateRow(row.id, (r) => ({ ...r, comment: e.target.value }))
                      }
                      placeholder="如 订单号 / 金额"
                      className="h-8 text-xs"
                    />
                  </td>

                  {/* Delete */}
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      title="删除字段"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}

              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-zinc-600">
                    还没有字段，点击上方“添加字段”或“从数据自动生成”。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 4: Primary Key & Result */}
      <div className="space-y-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-200">4. 主键与结果</label>
          <div className="text-xs leading-5 text-zinc-500">
            选了主键就按该字段更新，没选就默认新增。
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              主键字段
            </label>
            <Select
              value={primaryKeyField}
              onChange={(v) => pushPatch(rows, v)}
              placeholder="不选则默认新增"
              options={rowKeyOptions}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              结果变量
            </label>
            <Input
              value={String(localData.resultVariable ?? "")}
              onChange={(e) => onPatch({ resultVariable: e.target.value })}
              placeholder="可选，如 saveSummary"
            />
          </div>
        </div>

        {/* Preview */}
        {Object.keys(preview).length > 0 ? (
          <div className="rounded-xl border border-white/[0.05] bg-black/10 px-3 py-3 text-xs leading-6 text-zinc-500">
            最终保存为：
            <pre className="mt-2 overflow-auto rounded-lg bg-black/30 p-3 font-mono text-[11px] leading-5 text-zinc-300">
              {JSON.stringify(preview, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
