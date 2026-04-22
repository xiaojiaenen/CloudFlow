import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Select, type SelectOption } from "@/src/components/ui/Select";
import { cn } from "@/src/lib/utils";
import type { WorkflowInputField } from "@/src/lib/cloudflow";

type SaveDataBindingType = "variable" | "input" | "inline" | "template";
type SaveDataFieldSourceType =
  | "item"
  | "variable"
  | "input"
  | "text"
  | "template"
  | "current_datetime"
  | "current_date";

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

function createRow(
  sourceType: SaveDataFieldSourceType = "item",
  value = "",
  key = "",
  comment = "",
): SaveDataSimpleRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key,
    sourceType,
    value,
    comment,
  };
}

function tryParseJson(raw: string) {
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

function collectObjectPaths(
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
      objectItems.slice(0, 5).forEach((item) => collectObjectPaths(item, prefix, collector));
      return collector;
    }

    if (prefix) {
      collector.add(prefix);
    }
    return collector;
  }

  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;

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

function inferBindingType(
  sourceValue: string,
  variableKeys: string[],
  inputKeys: string[],
): SaveDataBindingType {
  const trimmed = sourceValue.trim();

  if (!trimmed) {
    return "variable";
  }

  const directTemplate = trimmed.match(/^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/)?.[1] ?? "";
  if (directTemplate.startsWith("variables.")) {
    return "variable";
  }

  if (directTemplate.startsWith("inputs.")) {
    return "input";
  }

  if (trimmed.includes("{{") && trimmed.includes("}}")) {
    return "template";
  }

  const parsed = tryParseJson(trimmed);
  if (parsed !== undefined && parsed !== null) {
    return "inline";
  }

  if (variableKeys.includes(trimmed)) {
    return "variable";
  }

  if (inputKeys.includes(trimmed)) {
    return "input";
  }

  return "inline";
}

function parseRows(raw: string): SaveDataSimpleRow[] {
  const normalized = raw.trim();
  if (!normalized) {
    return [createRow()];
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;

    if (Array.isArray(parsed)) {
      const rows = parsed
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return null;
          }

          const record = item as Record<string, unknown>;
          const key = String(record.key ?? record.field ?? "").trim();
          if (!key) {
            return null;
          }

          return createRow(
            String(record.sourceType ?? "item") as SaveDataFieldSourceType,
            String(record.value ?? ""),
            key,
            String(record.comment ?? ""),
          );
        })
        .filter((item): item is SaveDataSimpleRow => Boolean(item));

      return rows.length > 0 ? rows : [createRow()];
    }

    if (parsed && typeof parsed === "object") {
      const rows = Object.entries(parsed as Record<string, unknown>).map(([key, value]) => {
        if (typeof value === "string") {
          const itemField = value.match(/^\{\{\s*item\.([a-zA-Z0-9_.-]+)\s*\}\}$/)?.[1];
          const variableField = value.match(/^\{\{\s*variables\.([a-zA-Z0-9_.-]+)\s*\}\}$/)?.[1];
          const inputField = value.match(/^\{\{\s*inputs\.([a-zA-Z0-9_.-]+)\s*\}\}$/)?.[1];

          if (itemField) {
            return createRow("item", itemField, key, "");
          }

          if (variableField) {
            return createRow("variable", variableField, key, "");
          }

          if (inputField) {
            return createRow("input", inputField, key, "");
          }

          if (value.includes("{{") && value.includes("}}")) {
            return createRow("template", value, key, "");
          }

          return createRow("text", value, key, "");
        }

        return createRow("text", String(value ?? ""), key, "");
      });

      return rows.length > 0 ? rows : [createRow()];
    }
  } catch {
    return [createRow("text", raw, "value", "")];
  }

  return [createRow()];
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

function getDefaultSourceValue(bindingType: SaveDataBindingType) {
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

function getSourceTypeOptions(): SelectOption[] {
  return [
    { value: "item", label: "来源字段", description: "从当前对象读取字段值" },
    { value: "variable", label: "流程变量", description: "从前面节点保存的变量取值" },
    { value: "input", label: "运行参数", description: "从启动工作流时传入的参数取值" },
    { value: "text", label: "固定文本", description: "直接写入一段固定文本" },
    { value: "current_datetime", label: "当前时间", description: "自动写入当前时间" },
    { value: "current_date", label: "当前日期", description: "自动写入当前日期" },
    { value: "template", label: "高级模板", description: "少数复杂场景再用模板拼值" },
  ];
}

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
    setRows(parseRows(String(localData.fieldMappings ?? "")));
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

  const inlineFieldOptions = useMemo(() => {
    if (bindingType !== "inline") {
      return [] as SelectOption[];
    }

    const parsed = tryParseJson(sourceValue);
    if (parsed === undefined || parsed === null) {
      return [] as SelectOption[];
    }

    const paths = Array.from(collectObjectPaths(parsed)).sort((left, right) =>
      left.localeCompare(right),
    );

    return paths.map((path) => ({
      value: path,
      label: path,
      description: `从 ${path} 读取`,
      keywords: [getLeafName(path)],
    }));
  }, [bindingType, sourceValue]);

  const rowKeyOptions = useMemo(
    () => [
      {
        value: "",
        label: "不使用主键",
        description: "不选主键时，每次默认新增",
      },
      ...rows
        .map((row) => row.key.trim())
        .filter(Boolean)
        .map((key) => ({
          value: key,
          label: key,
          description: `按字段 ${key} 判断是否更新`,
        })),
    ],
    [rows],
  );

  const sourceTypeOptions = useMemo(() => getSourceTypeOptions(), []);

  const pushPatch = (nextRows: SaveDataSimpleRow[], nextPrimaryKeyField = primaryKeyField) => {
    setRows(nextRows);
    setPrimaryKeyField(nextPrimaryKeyField);
    onPatch({
      fieldMappings: serializeRows(nextRows),
      primaryKeyField: nextPrimaryKeyField,
      writeMode: nextPrimaryKeyField ? "upsert" : "insert",
      recordKeyTemplate: "",
    });
  };

  const updateRow = (rowId: string, updater: (row: SaveDataSimpleRow) => SaveDataSimpleRow) => {
    pushPatch(rows.map((row) => (row.id === rowId ? updater(row) : row)));
  };

  const addRow = () => {
    pushPatch([...rows, createRow()]);
  };

  const removeRow = (rowId: string) => {
    const nextRows = rows.filter((row) => row.id !== rowId);
    const nextPrimaryKeyField = nextRows.some((row) => row.key.trim() === primaryKeyField)
      ? primaryKeyField
      : "";

    pushPatch(nextRows.length > 0 ? nextRows : [createRow()], nextPrimaryKeyField);
  };

  const generateRowsFromSourceFields = () => {
    if (inlineFieldOptions.length === 0) {
      return;
    }

    const usedKeys = new Set<string>();
    const nextRows = inlineFieldOptions.map((option) =>
      createRow("item", option.value, createUniqueKey(getLeafName(option.value), usedKeys), ""),
    );

    pushPatch(nextRows);
  };

  const selectedVariableKey =
    sourceValue.match(/^\{\{\s*variables\.([a-zA-Z0-9_.-]+)\s*\}\}$/)?.[1] ??
    (variableOptions.some((item) => item.value === sourceValue) ? sourceValue : "");
  const selectedInputKey =
    sourceValue.match(/^\{\{\s*inputs\.([a-zA-Z0-9_.-]+)\s*\}\}$/)?.[1] ??
    (inputSchema.some((item) => item.key === sourceValue) ? sourceValue : "");

  const preview = useMemo(() => {
    if (rows.every((row) => !row.key.trim())) {
      return {};
    }

    return rows.reduce<Record<string, unknown>>((acc, row) => {
      if (!row.key.trim()) {
        return acc;
      }

      if (row.sourceType === "item") {
        acc[row.key.trim()] = row.value ? `{{item.${row.value}}}` : "{{item}}";
        return acc;
      }

      if (row.sourceType === "variable") {
        acc[row.key.trim()] = `{{variables.${row.value}}}`;
        return acc;
      }

      if (row.sourceType === "input") {
        acc[row.key.trim()] = `{{inputs.${row.value}}}`;
        return acc;
      }

      if (row.sourceType === "current_datetime") {
        acc[row.key.trim()] = "[当前时间]";
        return acc;
      }

      if (row.sourceType === "current_date") {
        acc[row.key.trim()] = "[当前日期]";
        return acc;
      }

      acc[row.key.trim()] = row.value;
      return acc;
    }, {});
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-200">1. 数据集</label>
          <div className="text-xs leading-5 text-zinc-500">
            数据集标识可以直接写中文。系统会自动生成稳定的内部 key，不再要求你先想英文名。
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              数据集标识
            </label>
            <Input
              value={String(localData.collectionKey ?? "")}
              onChange={(event) => onPatch({ collectionKey: event.target.value })}
              placeholder="如 每日订单 / 用户资料"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              显示名称
            </label>
            <Input
              value={String(localData.collectionName ?? "")}
              onChange={(event) => onPatch({ collectionName: event.target.value })}
              placeholder="可选，不填时默认与上面一致"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-200">2. 数据来源</label>
          <div className="text-xs leading-5 text-zinc-500">
            如果来源最终是数组，系统会自动拆成多条；如果是对象或文本，就按单条保存。
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {[
            { value: "variable", title: "流程变量", description: "从前面节点产出的变量里取值" },
            { value: "input", title: "运行参数", description: "从启动工作流时传入的参数里取值" },
            { value: "inline", title: "直接填写", description: "直接贴 JSON 或文本示例" },
            { value: "template", title: "高级模板", description: "少数复杂场景再拼模板" },
          ].map((option) => {
            const active = bindingType === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onPatch({ sourceVariable: getDefaultSourceValue(option.value as SaveDataBindingType) })}
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

        {bindingType === "variable" ? (
          <div className="space-y-3">
            <Select
              value={selectedVariableKey}
              onChange={(value) => onPatch({ sourceVariable: `{{variables.${value}}}` })}
              placeholder="选择一个流程变量"
              searchable
              options={variableOptions}
            />
            <Input
              value={sourceValue}
              onChange={(event) => onPatch({ sourceVariable: event.target.value })}
              placeholder="{{variables.data}}"
            />
          </div>
        ) : null}

        {bindingType === "input" ? (
          <div className="space-y-3">
            <Select
              value={selectedInputKey}
              onChange={(value) => onPatch({ sourceVariable: `{{inputs.${value}}}` })}
              placeholder="选择一个运行参数"
              options={inputSchema.map((item) => ({
                value: item.key,
                label: item.label || item.key,
                description: `{{inputs.${item.key}}}`,
              }))}
            />
            <Input
              value={sourceValue}
              onChange={(event) => onPatch({ sourceVariable: event.target.value })}
              placeholder="{{inputs.payload}}"
            />
          </div>
        ) : null}

        {bindingType === "inline" || bindingType === "template" ? (
          <textarea
            value={sourceValue}
            onChange={(event) => onPatch({ sourceVariable: event.target.value })}
            placeholder={getDefaultSourceValue(bindingType)}
            spellCheck={false}
            className="min-h-[150px] w-full rounded-2xl border border-white/[0.08] bg-black/20 px-3 py-3 font-mono text-sm leading-6 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-sky-400/40 focus:bg-black/30"
          />
        ) : null}
      </div>

      <div className="space-y-4 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-200">3. 保存字段</label>
          <div className="text-xs leading-5 text-zinc-500">
            只需要配置字段名、值和中文注释。值可以来自来源字段、变量、运行参数、固定文本或常用内置时间函数。
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className={cn(
              "rounded-xl px-3 py-3 text-xs leading-6",
              inlineFieldOptions.length > 0
                ? "border border-emerald-500/15 bg-emerald-500/10 text-emerald-100"
                : "border border-amber-500/15 bg-amber-500/10 text-amber-100",
            )}
          >
            {inlineFieldOptions.length > 0
              ? `已从示例 JSON 识别出 ${inlineFieldOptions.length} 个来源字段，可以直接下拉选。`
              : "如果想自动识别来源字段，请在“直接填写”里先提供一段示例 JSON。"}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={inlineFieldOptions.length === 0}
            onClick={generateRowsFromSourceFields}
          >
            一键从来源生成字段
          </Button>
        </div>

        <div className="space-y-3">
          {rows.map((row, index) => (
            <div
              key={row.id}
              className="space-y-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                  字段 {String(index + 1).padStart(2, "0")}
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  className="rounded-full p-1 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
                  title="删除字段"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                    字段名
                  </label>
                  <Input
                    value={row.key}
                    onChange={(event) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        key: event.target.value,
                      }))
                    }
                    placeholder="如 orderNo / amount"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                    值类型
                  </label>
                  <Select
                    value={row.sourceType}
                    onChange={(value) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        sourceType: value as SaveDataFieldSourceType,
                        value:
                          value === "current_datetime" || value === "current_date"
                            ? ""
                            : current.value,
                      }))
                    }
                    options={sourceTypeOptions}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                    中文注释
                  </label>
                  <Input
                    value={row.comment}
                    onChange={(event) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        comment: event.target.value,
                      }))
                    }
                    placeholder="如 订单号 / 更新时间"
                  />
                </div>
              </div>

              {row.sourceType === "item" ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                    来源字段
                  </label>
                  {inlineFieldOptions.length > 0 ? (
                    <Select
                      value={row.value}
                      onChange={(value) =>
                        updateRow(row.id, (current) => ({
                          ...current,
                          value,
                        }))
                      }
                      placeholder="选择来源字段"
                      searchable
                      options={inlineFieldOptions}
                    />
                  ) : (
                    <Input
                      value={row.value}
                      onChange={(event) =>
                        updateRow(row.id, (current) => ({
                          ...current,
                          value: event.target.value,
                        }))
                      }
                      placeholder="如 orderNo / data.amount"
                    />
                  )}
                </div>
              ) : null}

              {row.sourceType === "variable" ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                    变量
                  </label>
                  <Select
                    value={row.value}
                    onChange={(value) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        value,
                      }))
                    }
                    placeholder="选择一个变量"
                    searchable
                    options={variableOptions.map((item) => ({
                      ...item,
                      value: item.value,
                    }))}
                  />
                </div>
              ) : null}

              {row.sourceType === "input" ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                    运行参数
                  </label>
                  <Select
                    value={row.value}
                    onChange={(value) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        value,
                      }))
                    }
                    placeholder="选择一个运行参数"
                    options={inputSchema.map((item) => ({
                      value: item.key,
                      label: item.label || item.key,
                      description: `{{inputs.${item.key}}}`,
                    }))}
                  />
                </div>
              ) : null}

              {row.sourceType === "text" || row.sourceType === "template" ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                    {row.sourceType === "text" ? "固定文本" : "模板内容"}
                  </label>
                  <Input
                    value={row.value}
                    onChange={(event) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        value: event.target.value,
                      }))
                    }
                    placeholder={row.sourceType === "text" ? "如 已完成" : "{{item.id}}-{{variables.shop}}"}
                  />
                </div>
              ) : null}

              {row.sourceType === "current_datetime" || row.sourceType === "current_date" ? (
                <div className="rounded-xl border border-cyan-500/10 bg-cyan-500/5 px-3 py-3 text-xs leading-6 text-cyan-100">
                  {row.sourceType === "current_datetime"
                    ? "写入时会自动填入当前时间。"
                    : "写入时会自动填入当前日期。"}
                </div>
              ) : null}
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 rounded-2xl"
            onClick={addRow}
          >
            <Plus className="h-4 w-4" />
            添加字段
          </Button>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-200">4. 主键与结果</label>
          <div className="text-xs leading-5 text-zinc-500">
            选了主键就按该字段更新，没选主键就默认新增，不再让你自己判断更新模式。
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              主键字段
            </label>
            <Select
              value={primaryKeyField}
              onChange={(value) => pushPatch(rows, value)}
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
              onChange={(event) => onPatch({ resultVariable: event.target.value })}
              placeholder="可选，如 saveSummary"
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.05] bg-black/10 px-3 py-3 text-xs leading-6 text-zinc-500">
          最终会保存为：
          <pre className="mt-2 overflow-auto rounded-lg bg-black/30 p-3 font-mono text-[11px] leading-5 text-zinc-300">
            {JSON.stringify(preview, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
