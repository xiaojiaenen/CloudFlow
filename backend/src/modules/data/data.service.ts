import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DataWriteOperation, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';

function parsePositiveInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(max, Math.floor(parsed));
}

function toObjectRecord(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function normalizeSchemaFields(value: Prisma.JsonValue | null | undefined) {
  const schema = toObjectRecord(value);
  const fields = schema.fields;

  if (!Array.isArray(fields)) {
    return [] as string[];
  }

  return fields
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

function normalizeSchemaFieldComments(value: Prisma.JsonValue | null | undefined) {
  const schema = toObjectRecord(value);
  const fieldComments = schema.fieldComments;

  if (!fieldComments || typeof fieldComments !== 'object' || Array.isArray(fieldComments)) {
    return {} as Record<string, string>;
  }

  return Object.entries(fieldComments as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [key, item]) => {
      const normalizedKey = String(key ?? '').trim();
      const normalizedValue = String(item ?? '').trim();

      if (normalizedKey && normalizedValue) {
        acc[normalizedKey] = normalizedValue;
      }

      return acc;
    },
    {},
  );
}

function normalizePrimaryKeyField(value: Prisma.JsonValue | null | undefined) {
  const schema = toObjectRecord(value);
  const primaryKeyField = String(schema.primaryKeyField ?? '').trim();
  return primaryKeyField || null;
}

function collectJsonKeys(values: Array<Prisma.JsonValue | null | undefined>) {
  const keys = new Set<string>();

  for (const value of values) {
    const record = toObjectRecord(value);
    for (const key of Object.keys(record)) {
      if (key.trim()) {
        keys.add(key);
      }
    }
  }

  return Array.from(keys);
}

@Injectable()
export class DataService {
  constructor(private readonly prismaService: PrismaService) {}

  async listCollections(
    filters: {
      page?: string;
      pageSize?: string;
      search?: string;
      workflowId?: string;
    },
    currentUser?: AuthenticatedUser,
  ) {
    const page = parsePositiveInt(filters.page, 1, 10_000);
    const pageSize = parsePositiveInt(filters.pageSize, 12, 100);
    const search = filters.search?.trim();
    const where: Prisma.DataCollectionWhereInput = {
      ...this.buildAccessWhere(currentUser),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { key: { contains: search } },
              { description: { contains: search } },
            ],
          }
        : {}),
      ...(filters.workflowId
        ? {
            batches: {
              some: {
                workflowId: filters.workflowId,
              },
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prismaService.dataCollection.findMany({
        where,
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              records: true,
              batches: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prismaService.dataCollection.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        schemaFields: normalizeSchemaFields(item.schemaJson),
        schemaFieldComments: normalizeSchemaFieldComments(item.schemaJson),
        primaryKeyField: normalizePrimaryKeyField(item.schemaJson),
        recordCount: item._count.records,
        batchCount: item._count.batches,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getCollection(id: string, currentUser?: AuthenticatedUser) {
    const collection = await this.prismaService.dataCollection.findFirst({
      where: {
        id,
        ...this.buildAccessWhere(currentUser),
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            records: true,
            batches: true,
          },
        },
      },
    });

    if (!collection) {
      throw new NotFoundException(`Data collection ${id} not found`);
    }

    return {
      ...collection,
      schemaFields: normalizeSchemaFields(collection.schemaJson),
      schemaFieldComments: normalizeSchemaFieldComments(collection.schemaJson),
      primaryKeyField: normalizePrimaryKeyField(collection.schemaJson),
      recordCount: collection._count.records,
      batchCount: collection._count.batches,
    };
  }

  async listCollectionRecords(
    collectionId: string,
    filters: {
      page?: string;
      pageSize?: string;
      search?: string;
      workflowId?: string;
      taskId?: string;
      sortBy?: string;
      sortOrder?: string;
      fieldFilters?: string;
    },
    currentUser?: AuthenticatedUser,
  ) {
    const collection = await this.getCollection(collectionId, currentUser);
    const page = parsePositiveInt(filters.page, 1, 10_000);
    const pageSize = parsePositiveInt(filters.pageSize, 20, 500);
    const search = filters.search?.trim();

    // Parse field-level filters
    let fieldFilterEntries: Array<[string, string]> = [];
    if (filters.fieldFilters?.trim()) {
      try {
        const parsed = JSON.parse(filters.fieldFilters.trim()) as Record<string, unknown>;
        fieldFilterEntries = Object.entries(parsed)
          .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
          .map(([k, v]) => [k, String(v).trim()]);
      } catch {
        // ignore invalid JSON
      }
    }

    const hasFieldFilters = fieldFilterEntries.length > 0;
    const sortBy = filters.sortBy?.trim();
    const sortOrder = filters.sortOrder === 'asc' ? 'asc' as const : 'desc' as const;
    const isJsonSort = sortBy && sortBy !== 'recordKey' && sortBy !== 'updatedAt' && sortBy !== 'createdAt';

    // Database-level WHERE (recordKey search, workflowId, taskId)
    const where: Prisma.DataRecordWhereInput = {
      collectionId,
      ...(search ? { recordKey: { contains: search } } : {}),
      ...(filters.workflowId ? { sourceWorkflowId: filters.workflowId } : {}),
      ...(filters.taskId ? { lastTaskId: filters.taskId } : {}),
    };

    // Database-level ORDER BY (only for non-JSON fields)
    let orderBy: Prisma.DataRecordOrderByWithRelationInput[];
    if (sortBy === 'recordKey') {
      orderBy = [{ recordKey: sortOrder }, { updatedAt: 'desc' }];
    } else if (sortBy === 'updatedAt' || sortBy === 'createdAt') {
      orderBy = [{ [sortBy]: sortOrder }];
    } else {
      orderBy = [{ updatedAt: 'desc' }, { createdAt: 'desc' }];
    }

    if (hasFieldFilters || isJsonSort) {
      // Fetch ALL matching records (without field filters / JSON sort), then filter + sort + paginate in memory
      const allItems = await this.prismaService.dataRecord.findMany({
        where,
        orderBy: isJsonSort ? [{ updatedAt: 'desc' }] : orderBy,
      });

      // Apply field-level filters in memory
      let filtered = allItems;
      if (hasFieldFilters) {
        filtered = allItems.filter((record) => {
          const data = (record.dataJson ?? {}) as Record<string, unknown>;
          return fieldFilterEntries.every(([field, text]) => {
            const value = data[field];
            if (value === null || value === undefined) return false;
            return String(value).toLowerCase().includes(text.toLowerCase());
          });
        });
      }

      // Apply JSON field sort in memory
      if (isJsonSort && sortBy) {
        filtered.sort((a, b) => {
          const aVal = String(((a.dataJson ?? {}) as Record<string, unknown>)[sortBy] ?? '');
          const bVal = String(((b.dataJson ?? {}) as Record<string, unknown>)[sortBy] ?? '');
          return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        });
      }

      const total = filtered.length;
      const items = filtered.slice((page - 1) * pageSize, page * pageSize);

      const columns = this.buildColumns(
        collection.schemaFields,
        allItems.map((item) => item.dataJson),
      );

      return {
        collection,
        columns,
        items,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    }

    // Simple path: no field filters, no JSON sort — use database pagination
    const [items, total] = await Promise.all([
      this.prismaService.dataRecord.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prismaService.dataRecord.count({ where }),
    ]);

    const columns = this.buildColumns(
      collection.schemaFields,
      items.map((item) => item.dataJson),
    );

    return {
      collection,
      columns,
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listTaskBatches(taskId: string, currentUser?: AuthenticatedUser) {
    await this.getTaskOrThrow(taskId, currentUser);

    const batches = await this.prismaService.dataWriteBatch.findMany({
      where: {
        taskId,
        ...this.buildAccessWhere(currentUser),
      },
      include: {
        collection: {
          select: {
            id: true,
            key: true,
            name: true,
          },
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    return batches.map((batch) => ({
      ...batch,
      totalCount:
        batch.insertedCount + batch.updatedCount + batch.skippedCount + batch.failedCount,
    }));
  }

  async listBatchRows(
    batchId: string,
    filters: {
      page?: string;
      pageSize?: string;
      operation?: string;
    },
    currentUser?: AuthenticatedUser,
  ) {
    const batch = await this.prismaService.dataWriteBatch.findFirst({
      where: {
        id: batchId,
        ...this.buildAccessWhere(currentUser),
      },
      include: {
        collection: {
          select: {
            id: true,
            key: true,
            name: true,
            schemaJson: true,
          },
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException(`Data write batch ${batchId} not found`);
    }

    const page = parsePositiveInt(filters.page, 1, 10_000);
    const pageSize = parsePositiveInt(filters.pageSize, 20, 500);
    const where: Prisma.DataWriteBatchRowWhereInput = {
      batchId,
      ...(this.isDataWriteOperation(filters.operation)
        ? {
            operation: filters.operation,
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prismaService.dataWriteBatchRow.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prismaService.dataWriteBatchRow.count({ where }),
    ]);

    const columns = this.buildColumns(
      normalizeSchemaFields(batch.collection.schemaJson),
      items.map((item) => item.dataJson),
    );

    return {
      batch: {
        ...batch,
        collection: {
          ...batch.collection,
          schemaFields: normalizeSchemaFields(batch.collection.schemaJson),
          schemaFieldComments: normalizeSchemaFieldComments(batch.collection.schemaJson),
          primaryKeyField: normalizePrimaryKeyField(batch.collection.schemaJson),
        },
        totalCount:
          batch.insertedCount + batch.updatedCount + batch.skippedCount + batch.failedCount,
      },
      columns,
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async deleteCollection(id: string, currentUser?: AuthenticatedUser) {
    const collection = await this.prismaService.dataCollection.findFirst({
      where: { id, ...this.buildAccessWhere(currentUser) },
      select: { id: true },
    });

    if (!collection) {
      throw new NotFoundException(`Data collection ${id} not found`);
    }

    // Cascade delete: records, batch rows, batches, then collection
    await this.prismaService.$transaction([
      this.prismaService.dataWriteBatchRow.deleteMany({ where: { collectionId: id } }),
      this.prismaService.dataRecord.deleteMany({ where: { collectionId: id } }),
      this.prismaService.dataWriteBatch.deleteMany({ where: { collectionId: id } }),
      this.prismaService.dataCollection.delete({ where: { id } }),
    ]);

    return { success: true };
  }

  async deleteRecord(recordId: string, currentUser?: AuthenticatedUser) {
    const record = await this.prismaService.dataRecord.findFirst({
      where: { id: recordId, ...this.buildAccessWhere(currentUser) },
      select: { id: true, collectionId: true },
    });

    if (!record) {
      throw new NotFoundException(`Data record ${recordId} not found`);
    }

    await this.prismaService.dataRecord.delete({ where: { id: recordId } });
    return { success: true };
  }

  async updateRecord(
    recordId: string,
    dataJson: Record<string, unknown>,
    currentUser?: AuthenticatedUser,
  ) {
    const record = await this.prismaService.dataRecord.findFirst({
      where: { id: recordId, ...this.buildAccessWhere(currentUser) },
      select: { id: true, collectionId: true },
    });

    if (!record) {
      throw new NotFoundException(`Data record ${recordId} not found`);
    }

    const updated = await this.prismaService.dataRecord.update({
      where: { id: recordId },
      data: { dataJson: dataJson as Prisma.InputJsonValue },
    });

    return updated;
  }

  async batchDeleteRecords(
    collectionId: string,
    recordIds: string[],
    currentUser?: AuthenticatedUser,
  ) {
    if (!recordIds || recordIds.length === 0) {
      return { deletedCount: 0 };
    }

    // Verify access to the collection
    const collection = await this.prismaService.dataCollection.findFirst({
      where: { id: collectionId, ...this.buildAccessWhere(currentUser) },
      select: { id: true },
    });

    if (!collection) {
      throw new NotFoundException(`Data collection ${collectionId} not found`);
    }

    const result = await this.prismaService.dataRecord.deleteMany({
      where: {
        id: { in: recordIds },
        collectionId,
      },
    });

    return { deletedCount: result.count };
  }

  async exportAllRecords(collectionId: string, currentUser?: AuthenticatedUser) {
    const collection = await this.getCollection(collectionId, currentUser);

    const allRecords = await this.prismaService.dataRecord.findMany({
      where: { collectionId },
      orderBy: [{ updatedAt: 'desc' }],
    });

    const columns = this.buildColumns(collection.schemaFields, allRecords.map((r) => r.dataJson));

    return {
      collection,
      columns,
      items: allRecords,
      total: allRecords.length,
    };
  }

  private buildColumns(schemaFields: string[], values: Array<Prisma.JsonValue | null | undefined>) {
    const ordered = [...schemaFields];
    const existing = new Set(ordered);

    for (const key of collectJsonKeys(values)) {
      if (!existing.has(key)) {
        ordered.push(key);
        existing.add(key);
      }
    }

    return ordered;
  }

  private async getTaskOrThrow(taskId: string, currentUser?: AuthenticatedUser) {
    const task = await this.prismaService.task.findFirst({
      where: {
        id: taskId,
        ...this.buildAccessWhere(currentUser),
      },
      select: {
        id: true,
      },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    return task;
  }

  private isDataWriteOperation(value?: string): value is DataWriteOperation {
    return ['insert', 'update', 'skip', 'error'].includes(value ?? '');
  }

  private buildAccessWhere(currentUser?: AuthenticatedUser) {
    if (!currentUser || currentUser.role === 'admin') {
      return {};
    }

    return {
      ownerId: currentUser.id,
    };
  }
}
