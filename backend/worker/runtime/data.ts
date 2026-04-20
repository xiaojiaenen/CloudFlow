import { randomUUID } from 'crypto';
import {
  DataRecordMode,
  DataWriteMode,
  Prisma,
  PrismaClient,
} from '@prisma/client';
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

type FieldMappingValue = string | number | boolean | null | FieldMappingRecord | FieldMappingValue[];

interface FieldMappingRecord {
  [key: string]: FieldMappingValue;
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

function resolveScopedValue(
  expression: string,
  runtime: {
    runtimeInputs: Record<string, string>;
    variables: Record<string, string>;
    credentials: Record<string, Record<string, string>>;
    item?: unknown;
    index?: number;
  },
) {
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

function resolveTemplateString(
  value: string,
  runtime: {
    runtimeInputs: Record<string, string>;
    variables: Record<string, string>;
    credentials: Record<string, Record<string, string>>;
    item?: unknown;
    index?: number;
  },
) {
  const directMatch = value.match(/^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/);
  if (directMatch) {
    return resolveScopedValue(directMatch[1], runtime);
  }

  return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, expression: string) =>
    stringifyTemplateValue(resolveScopedValue(expression, runtime)),
  );
}

function resolveFieldMappingValue(
  value: FieldMappingValue,
  runtime: {
    runtimeInputs: Record<string, string>;
    variables: Record<string, string>;
    credentials: Record<string, Record<string, string>>;
    item?: unknown;
    index?: number;
  },
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveFieldMappingValue(item, runtime));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, item]) => {
      acc[key] = resolveFieldMappingValue(item, runtime);
      return acc;
    }, {});
  }

  if (typeof value === 'string') {
    return resolveTemplateString(value, runtime);
  }

  return value;
}

function parseFieldMappings(raw: string | undefined) {
  const text = String(raw ?? '').trim();
  if (!text) {
    return null;
  }

  const parsed = JSON.parse(text) as unknown;

  if (Array.isArray(parsed)) {
    return parsed.reduce<FieldMappingRecord>((acc, item) => {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).field === 'string'
      ) {
        acc[String((item as Record<string, unknown>).field)] = (item as Record<string, unknown>)
          .value as FieldMappingValue;
      }
      return acc;
    }, {});
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as FieldMappingRecord;
  }

  throw new Error('保存数据节点的字段映射必须是 JSON 对象，或包含 field/value 的数组。');
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

function normalizeSourceItems(raw: string, recordMode: DataRecordMode) {
  const parsed = tryParseJson(raw);
  const source = parsed === undefined ? raw : parsed;

  if (recordMode === 'array') {
    if (Array.isArray(source)) {
      return source;
    }

    if (source === null || source === '') {
      return [];
    }

    throw new Error('保存数据节点在数组模式下，来源变量必须是 JSON 数组。');
  }

  if (Array.isArray(source)) {
    throw new Error('保存数据节点在单条模式下，来源变量不能是 JSON 数组。');
  }

  if (source === null || source === '') {
    return [];
  }

  return [source];
}

function inferRecordKey(item: unknown, writeMode: DataWriteMode) {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const record = item as Record<string, unknown>;
    if (record.id !== undefined && record.id !== null && String(record.id).trim()) {
      return String(record.id).trim();
    }

    if (record.key !== undefined && record.key !== null && String(record.key).trim()) {
      return String(record.key).trim();
    }
  }

  if (writeMode === 'insert') {
    return randomUUID();
  }

  return '';
}

function buildSchemaFields(
  existingFields: string[],
  values: Array<Record<string, unknown>>,
) {
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

function asJsonInput(value: unknown) {
  return value as Prisma.InputJsonValue;
}

export async function executeSaveDataNode(
  node: SaveDataNode,
  context: SaveDataRuntimeContext,
) {
  const collectionKey = String(node.collectionKey ?? '').trim();
  if (!collectionKey) {
    throw new Error('保存数据节点必须填写数据集标识。');
  }

  const collectionName = String(node.collectionName ?? '').trim() || collectionKey;
  const recordMode = (node.recordMode ?? 'single') as DataRecordMode;
  const writeMode = (node.writeMode ?? 'upsert') as DataWriteMode;
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
  const sourceItems = normalizeSourceItems(sourceValue, recordMode);
  const fieldMappings = parseFieldMappings(node.fieldMappings);

  await context.publishLog(
    context.taskId,
    `开始写入数据集 ${collectionName}（${sourceItems.length} 条）`,
    'info',
    nodeId,
  );

  const preparedRows = sourceItems.map((item, index) => {
    const runtime = {
      runtimeInputs: context.runtimeInputs,
      variables: context.variables,
      credentials: context.credentials,
      item,
      index,
    };
    const resolvedRecordKey =
      stringifyTemplateValue(
        resolveTemplateString(String(node.recordKeyTemplate ?? '').trim(), runtime),
      ).trim() || inferRecordKey(item, writeMode);

    if (!resolvedRecordKey && writeMode !== 'insert') {
      throw new Error('upsert/跳过重复 模式下必须提供记录键模板，或让来源数据中包含 id/key 字段。');
    }

    const mappedValue = fieldMappings
      ? resolveFieldMappingValue(fieldMappings, runtime)
      : toStructuredRecord(item);

    return {
      recordKey: resolvedRecordKey || randomUUID(),
      data: toStructuredRecord(mappedValue),
    };
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
    const initialSchemaFields = existingCollection
      ? ((existingCollection.schemaJson as { fields?: string[] } | null)?.fields ?? []).filter(
          (item): item is string => typeof item === 'string' && Boolean(item.trim()),
        )
      : [];
    const mergedSchemaFields = buildSchemaFields(
      initialSchemaFields,
      preparedRows.map((item) => item.data),
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
        }),
      },
      update: {
        name: collectionName,
        schemaJson: asJsonInput({
          fields: mergedSchemaFields,
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
        writeMode,
        recordMode,
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

        if (existingRecord && writeMode === 'skip_duplicates') {
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

        if (existingRecord && writeMode === 'insert') {
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
              errorMessage: `记录键 ${row.recordKey} 已存在，insert 模式不会覆盖旧数据。`,
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
    writeMode,
    recordMode,
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
