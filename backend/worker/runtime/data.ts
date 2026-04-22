import { randomUUID } from 'crypto';
import {
  DataRecordMode,
  DataWriteMode,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { pinyin } from 'pinyin-pro';
import { TaskDataWritePayload } from '../../src/common/types/execution-event.types';
import { SaveDataNode } from '../../src/common/types/workflow.types';

interface SaveDataRuntimeContext {
  prisma: PrismaClient;
  taskId: string;
  workflowId: string;
  ownerId: string;
  runtimeInputs: Record<string, string>;
  variables: Record<string, string>;
  credentials: Record<string, Record<string, string>>;
  publishLog: (
    taskId: string,
    message: string,
    level?: 'info' | 'warn' | 'error' | 'success',
    nodeId?: string,
  ) => Promise<unknown>;
  publishDataWrite: (
    taskId: string,
    payload: TaskDataWritePayload,
  ) => Promise<unknown>;
}

type LegacyFieldMappingValue =
  | string
  | number
  | boolean
  | null
  | LegacyFieldMappingRecord
  | LegacyFieldMappingValue[];

interface LegacyFieldMappingRecord {
  [key: string]: LegacyFieldMappingValue;
}

type SaveDataFieldSourceType =
  | 'item'
  | 'input'
  | 'variable'
  | 'credential'
  | 'text'
  | 'number'
  | 'boolean'
  | 'null'
  | 'index'
  | 'template'
  | 'current_datetime'
  | 'current_date';

interface SaveDataFieldRow {
  key: string;
  sourceType: SaveDataFieldSourceType;
  value: string;
  comment?: string;
}

interface ParsedFieldMappings {
  rows: SaveDataFieldRow[] | null;
  legacy: LegacyFieldMappingRecord | null;
}

interface SaveDataExecutionRuntime {
  runtimeInputs: Record<string, string>;
  variables: Record<string, string>;
  credentials: Record<string, Record<string, string>>;
  item?: unknown;
  index?: number;
}

interface PreparedDataRow {
  recordKey: string;
  data: Record<string, unknown>;
  writeMode: DataWriteMode;
}

function resolvePathValue(source: unknown, path: string) {
  if (!path.trim()) {
    return source;
  }

  return path
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((current, key) => {
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        return (current as Record<string, unknown>)[key];
      }

      if (Array.isArray(current)) {
        const index = Number(key);
        return Number.isInteger(index) ? current[index] : undefined;
      }

      return undefined;
    }, source);
}

function stringifyTemplateValue(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

function resolveScopedValue(expression: string, runtime: SaveDataExecutionRuntime) {
  const [scope, key, ...rest] = expression.split('.');

  if (scope === 'inputs' && key) {
    return runtime.runtimeInputs[key];
  }

  if (scope === 'variables' && key) {
    return runtime.variables[key];
  }

  if (scope === 'credentials' && key && rest.length > 0) {
    return resolvePathValue(runtime.credentials[key], rest.join('.'));
  }

  if (scope === 'item') {
    return key ? resolvePathValue(runtime.item, [key, ...rest].join('.')) : runtime.item;
  }

  if (scope === 'index') {
    return runtime.index;
  }

  return undefined;
}

function resolveTemplateString(value: string, runtime: SaveDataExecutionRuntime) {
  const directMatch = value.match(/^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/);
  if (directMatch) {
    return resolveScopedValue(directMatch[1], runtime);
  }

  return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, expression: string) =>
    stringifyTemplateValue(resolveScopedValue(expression, runtime)),
  );
}

function resolveLegacyFieldMappingValue(
  value: LegacyFieldMappingValue,
  runtime: SaveDataExecutionRuntime,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveLegacyFieldMappingValue(item, runtime));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, item]) => {
      acc[key] = resolveLegacyFieldMappingValue(item, runtime);
      return acc;
    }, {});
  }

  if (typeof value === 'string') {
    return resolveTemplateString(value, runtime);
  }

  return value;
}

function normalizeFieldSourceType(value: string): SaveDataFieldSourceType {
  switch (value) {
    case 'input':
    case 'variable':
    case 'credential':
    case 'text':
    case 'number':
    case 'boolean':
    case 'null':
    case 'index':
    case 'template':
    case 'current_datetime':
    case 'current_date':
      return value;
    default:
      return 'item';
  }
}

function parseFieldMappings(raw: string | undefined): ParsedFieldMappings {
  const text = String(raw ?? '').trim();
  if (!text) {
    return {
      rows: null,
      legacy: null,
    };
  }

  const parsed = JSON.parse(text) as unknown;

  if (Array.isArray(parsed)) {
    const rows = parsed.reduce<SaveDataFieldRow[]>((acc, item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return acc;
      }

      const record = item as Record<string, unknown>;
      const key = String(record.key ?? record.field ?? '').trim();
      if (!key) {
        return acc;
      }

      acc.push({
        key,
        sourceType: normalizeFieldSourceType(String(record.sourceType ?? 'item')),
        value: String(record.value ?? ''),
        comment: String(record.comment ?? '').trim() || undefined,
      });
      return acc;
    }, []);

    return {
      rows,
      legacy: null,
    };
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return {
      rows: null,
      legacy: parsed as LegacyFieldMappingRecord,
    };
  }

  throw new Error('保存数据节点的字段配置必须是 JSON 对象或字段数组。');
}

function toStructuredRecord(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {
    value,
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

function normalizeSourceItems(raw: string) {
  const parsed = tryParseJson(raw);
  const source = parsed === undefined ? raw : parsed;

  if (Array.isArray(source)) {
    return {
      items: source,
      recordMode: 'array' as DataRecordMode,
    };
  }

  if (source === null || source === '') {
    return {
      items: [] as unknown[],
      recordMode: 'single' as DataRecordMode,
    };
  }

  return {
    items: [source],
    recordMode: 'single' as DataRecordMode,
  };
}

function getScalarString(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  return '';
}

function inferLegacyRecordKey(item: unknown) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return '';
  }

  const record = item as Record<string, unknown>;
  const idValue = getScalarString(record.id);
  if (idValue) {
    return idValue;
  }

  const keyValue = getScalarString(record.key);
  if (keyValue) {
    return keyValue;
  }

  return '';
}

function formatDateByParts(parts: {
  year: number;
  month: number;
  day: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}) {
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;

  if (parts.hours === undefined || parts.minutes === undefined || parts.seconds === undefined) {
    return date;
  }

  return `${date} ${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
}

function getCurrentDateTimeStrings() {
  const now = new Date();

  return {
    currentDate: formatDateByParts({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    }),
    currentDateTime: formatDateByParts({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hours: now.getHours(),
      minutes: now.getMinutes(),
      seconds: now.getSeconds(),
    }),
  };
}

function resolveConfiguredVariableValue(rawValue: string, runtime: SaveDataExecutionRuntime) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.includes('{{') && trimmed.includes('}}')) {
    return resolveTemplateString(trimmed, runtime);
  }

  return runtime.variables[trimmed] ?? '';
}

function resolveConfiguredInputValue(rawValue: string, runtime: SaveDataExecutionRuntime) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.includes('{{') && trimmed.includes('}}')) {
    return resolveTemplateString(trimmed, runtime);
  }

  return runtime.runtimeInputs[trimmed] ?? '';
}

function resolveFieldRowValue(row: SaveDataFieldRow, runtime: SaveDataExecutionRuntime): unknown {
  const trimmedValue = row.value.trim();
  const { currentDate, currentDateTime } = getCurrentDateTimeStrings();

  switch (row.sourceType) {
    case 'item':
      return trimmedValue ? resolvePathValue(runtime.item, trimmedValue) : runtime.item;
    case 'variable':
      return resolveConfiguredVariableValue(trimmedValue, runtime);
    case 'input':
      return resolveConfiguredInputValue(trimmedValue, runtime);
    case 'credential':
      return trimmedValue
        ? resolveScopedValue(`credentials.${trimmedValue}`, runtime)
        : undefined;
    case 'number': {
      const parsed = Number(trimmedValue);
      return Number.isFinite(parsed) ? parsed : trimmedValue;
    }
    case 'boolean':
      return trimmedValue === 'true';
    case 'null':
      return null;
    case 'index':
      return runtime.index ?? 0;
    case 'template':
      return resolveTemplateString(row.value, runtime);
    case 'current_datetime':
      return currentDateTime;
    case 'current_date':
      return currentDate;
    case 'text':
    default:
      return row.value;
  }
}

function buildRecordFromFieldRows(rows: SaveDataFieldRow[], runtime: SaveDataExecutionRuntime) {
  return rows.reduce<Record<string, unknown>>((acc, row) => {
    if (!row.key.trim()) {
      return acc;
    }

    acc[row.key.trim()] = resolveFieldRowValue(row, runtime);
    return acc;
  }, {});
}

function buildSchemaFields(existingFields: string[], values: Array<Record<string, unknown>>) {
  const keys = new Set(existingFields);

  for (const value of values) {
    for (const key of Object.keys(value)) {
      if (key.trim()) {
        keys.add(key);
      }
    }
  }

  return Array.from(keys);
}

function buildFieldComments(
  existingComments: Record<string, string>,
  rows: SaveDataFieldRow[] | null,
) {
  if (!rows || rows.length === 0) {
    return existingComments;
  }

  return rows.reduce<Record<string, string>>((acc, row) => {
    if (row.key.trim() && row.comment?.trim()) {
      acc[row.key.trim()] = row.comment.trim();
    }
    return acc;
  }, { ...existingComments });
}

function normalizeCollectionKey(rawValue: string) {
  const trimmed = rawValue.trim();
  const normalized = pinyin(trimmed, { toneType: 'none' })
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  return normalized || `dataset_${randomUUID().slice(0, 8)}`;
}

function asJsonInput(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function resolveRecordIdentity(params: {
  primaryKeyField: string;
  legacyRecordKeyTemplate: string;
  requestedWriteMode: DataWriteMode;
  mappedData: Record<string, unknown>;
  item: unknown;
  runtime: SaveDataExecutionRuntime;
}) {
  const primaryKeyField = params.primaryKeyField.trim();
  if (primaryKeyField) {
    const primaryKeyValue = getScalarString(params.mappedData[primaryKeyField]);
    if (primaryKeyValue) {
      return {
        recordKey: primaryKeyValue,
        writeMode: 'upsert' as DataWriteMode,
      };
    }

    return {
      recordKey: randomUUID(),
      writeMode: 'insert' as DataWriteMode,
    };
  }

  const legacyRecordKey =
    getScalarString(resolveTemplateString(params.legacyRecordKeyTemplate, params.runtime)) ||
    inferLegacyRecordKey(params.item);

  if (legacyRecordKey) {
    return {
      recordKey: legacyRecordKey,
      writeMode:
        params.requestedWriteMode === 'skip_duplicates'
          ? ('skip_duplicates' as DataWriteMode)
          : params.requestedWriteMode === 'insert'
            ? ('insert' as DataWriteMode)
            : ('upsert' as DataWriteMode),
    };
  }

  return {
    recordKey: randomUUID(),
    writeMode: 'insert' as DataWriteMode,
  };
}

export async function executeSaveDataNode(
  node: SaveDataNode,
  context: SaveDataRuntimeContext,
) {
  const rawCollectionKey = String(node.collectionKey ?? '').trim();
  if (!rawCollectionKey) {
    throw new Error('保存数据节点必须填写数据集标识。');
  }

  const collectionKey = normalizeCollectionKey(rawCollectionKey);
  const collectionName = String(node.collectionName ?? '').trim() || rawCollectionKey;
  const requestedWriteMode = (node.writeMode ?? 'upsert') as DataWriteMode;
  const primaryKeyField = String(node.primaryKeyField ?? '').trim();
  const legacyRecordKeyTemplate = String(node.recordKeyTemplate ?? '').trim();
  const nodeId = node.clientNodeId;
  const sourceReference = String(node.sourceVariable ?? '').trim();
  const sourceValue =
    context.variables[sourceReference] ??
    stringifyTemplateValue(
      resolveTemplateString(sourceReference, {
        runtimeInputs: context.runtimeInputs,
        variables: context.variables,
        credentials: context.credentials,
      }),
    );
  const normalizedSource = normalizeSourceItems(sourceValue);
  const parsedFieldMappings = parseFieldMappings(node.fieldMappings);
  const batchWriteMode = primaryKeyField
    ? ('upsert' as DataWriteMode)
    : requestedWriteMode;

  await context.publishLog(
    context.taskId,
    `开始写入数据集 ${collectionName}（${normalizedSource.items.length} 条）`,
    'info',
    nodeId,
  );

  const preparedRows = normalizedSource.items.map((item, index) => {
    const runtime: SaveDataExecutionRuntime = {
      runtimeInputs: context.runtimeInputs,
      variables: context.variables,
      credentials: context.credentials,
      item,
      index,
    };

    const mappedValue = parsedFieldMappings.rows
      ? buildRecordFromFieldRows(parsedFieldMappings.rows, runtime)
      : parsedFieldMappings.legacy
        ? resolveLegacyFieldMappingValue(parsedFieldMappings.legacy, runtime)
        : toStructuredRecord(item);
    const structuredData = toStructuredRecord(mappedValue);
    const recordIdentity = resolveRecordIdentity({
      primaryKeyField,
      legacyRecordKeyTemplate,
      requestedWriteMode,
      mappedData: structuredData,
      item,
      runtime,
    });

    return {
      recordKey: recordIdentity.recordKey,
      data: structuredData,
      writeMode: recordIdentity.writeMode,
    } satisfies PreparedDataRow;
  });

  const result = await context.prisma.$transaction(async (tx) => {
    const existingCollection = await tx.dataCollection.findUnique({
      where: {
        ownerId_key: {
          ownerId: context.ownerId,
          key: collectionKey,
        },
      },
      select: {
        id: true,
        schemaJson: true,
      },
    });

    const initialSchema = (existingCollection?.schemaJson ?? null) as
      | {
          fields?: string[];
          fieldComments?: Record<string, string>;
          primaryKeyField?: string | null;
        }
      | null;
    const initialSchemaFields = (initialSchema?.fields ?? []).filter(
      (item): item is string => typeof item === 'string' && Boolean(item.trim()),
    );
    const mergedSchemaFields = buildSchemaFields(
      initialSchemaFields,
      preparedRows.map((item) => item.data),
    );
    const mergedFieldComments = buildFieldComments(
      initialSchema?.fieldComments ?? {},
      parsedFieldMappings.rows,
    );

    const collection = await tx.dataCollection.upsert({
      where: {
        ownerId_key: {
          ownerId: context.ownerId,
          key: collectionKey,
        },
      },
      create: {
        ownerId: context.ownerId,
        key: collectionKey,
        name: collectionName,
        schemaJson: asJsonInput({
          fields: mergedSchemaFields,
          fieldComments: mergedFieldComments,
          primaryKeyField: primaryKeyField || null,
        }),
      },
      update: {
        name: collectionName,
        schemaJson: asJsonInput({
          fields: mergedSchemaFields,
          fieldComments: mergedFieldComments,
          primaryKeyField: primaryKeyField || null,
        }),
      },
    });

    const batch = await tx.dataWriteBatch.create({
      data: {
        collectionId: collection.id,
        taskId: context.taskId,
        workflowId: context.workflowId,
        ownerId: context.ownerId,
        nodeId: nodeId ?? null,
        writeMode: batchWriteMode,
        recordMode: normalizedSource.recordMode,
      },
    });

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const row of preparedRows) {
      try {
        const existingRecord = await tx.dataRecord.findUnique({
          where: {
            collectionId_recordKey: {
              collectionId: collection.id,
              recordKey: row.recordKey,
            },
          },
          select: {
            id: true,
          },
        });

        if (existingRecord && row.writeMode === 'skip_duplicates') {
          skippedCount += 1;
          await tx.dataWriteBatchRow.create({
            data: {
              batchId: batch.id,
              collectionId: collection.id,
              taskId: context.taskId,
              workflowId: context.workflowId,
              ownerId: context.ownerId,
              recordKey: row.recordKey,
              operation: 'skip',
              dataJson: asJsonInput(row.data),
            },
          });
          continue;
        }

        if (existingRecord && row.writeMode === 'insert') {
          failedCount += 1;
          await tx.dataWriteBatchRow.create({
            data: {
              batchId: batch.id,
              collectionId: collection.id,
              taskId: context.taskId,
              workflowId: context.workflowId,
              ownerId: context.ownerId,
              recordKey: row.recordKey,
              operation: 'error',
              dataJson: asJsonInput(row.data),
              errorMessage: `主键 ${row.recordKey} 已存在，当前记录已按新增模式跳过。`,
            },
          });
          continue;
        }

        if (existingRecord) {
          updatedCount += 1;
          await tx.dataRecord.update({
            where: {
              collectionId_recordKey: {
                collectionId: collection.id,
                recordKey: row.recordKey,
              },
            },
            data: {
              dataJson: asJsonInput(row.data),
              sourceWorkflowId: context.workflowId,
              lastTaskId: context.taskId,
              lastBatchId: batch.id,
            },
          });
          await tx.dataWriteBatchRow.create({
            data: {
              batchId: batch.id,
              collectionId: collection.id,
              taskId: context.taskId,
              workflowId: context.workflowId,
              ownerId: context.ownerId,
              recordKey: row.recordKey,
              operation: 'update',
              dataJson: asJsonInput(row.data),
            },
          });
          continue;
        }

        insertedCount += 1;
        await tx.dataRecord.create({
          data: {
            collectionId: collection.id,
            ownerId: context.ownerId,
            recordKey: row.recordKey,
            dataJson: asJsonInput(row.data),
            sourceWorkflowId: context.workflowId,
            lastTaskId: context.taskId,
            lastBatchId: batch.id,
          },
        });
        await tx.dataWriteBatchRow.create({
          data: {
            batchId: batch.id,
            collectionId: collection.id,
            taskId: context.taskId,
            workflowId: context.workflowId,
            ownerId: context.ownerId,
            recordKey: row.recordKey,
            operation: 'insert',
            dataJson: asJsonInput(row.data),
          },
        });
      } catch (error) {
        failedCount += 1;
        await tx.dataWriteBatchRow.create({
          data: {
            batchId: batch.id,
            collectionId: collection.id,
            taskId: context.taskId,
            workflowId: context.workflowId,
            ownerId: context.ownerId,
            recordKey: row.recordKey,
            operation: 'error',
            dataJson: asJsonInput(row.data),
            errorMessage: error instanceof Error ? error.message : '未知写入错误',
          },
        });
      }
    }

    const updatedBatch = await tx.dataWriteBatch.update({
      where: {
        id: batch.id,
      },
      data: {
        insertedCount,
        updatedCount,
        skippedCount,
        failedCount,
      },
    });

    return {
      batch: updatedBatch,
      collection,
      summary: {
        totalCount: preparedRows.length,
        insertedCount,
        updatedCount,
        skippedCount,
        failedCount,
      },
    };
  });

  const payload: TaskDataWritePayload = {
    batchId: result.batch.id,
    collectionId: result.collection.id,
    collectionKey: result.collection.key,
    collectionName: result.collection.name,
    nodeId,
    writeMode: batchWriteMode,
    recordMode: normalizedSource.recordMode,
    totalCount: result.summary.totalCount,
    insertedCount: result.summary.insertedCount,
    updatedCount: result.summary.updatedCount,
    skippedCount: result.summary.skippedCount,
    failedCount: result.summary.failedCount,
    timestamp: new Date().toISOString(),
  };

  if (String(node.resultVariable ?? '').trim()) {
    context.variables[String(node.resultVariable).trim()] = JSON.stringify(payload);
  }

  await context.publishDataWrite(context.taskId, payload);
  await context.publishLog(
    context.taskId,
    `数据写入完成：${collectionName}，新增 ${payload.insertedCount}，更新 ${payload.updatedCount}，跳过 ${payload.skippedCount}，失败 ${payload.failedCount}`,
    payload.failedCount > 0 ? 'warn' : 'success',
    nodeId,
  );

  return payload;
}
