import { Injectable, NotFoundException } from '@nestjs/common';
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
    },
    currentUser?: AuthenticatedUser,
  ) {
    const collection = await this.getCollection(collectionId, currentUser);
    const page = parsePositiveInt(filters.page, 1, 10_000);
    const pageSize = parsePositiveInt(filters.pageSize, 20, 500);
    const search = filters.search?.trim();
    const where: Prisma.DataRecordWhereInput = {
      collectionId,
      ...(search
        ? {
            recordKey: {
              contains: search,
            },
          }
        : {}),
      ...(filters.workflowId ? { sourceWorkflowId: filters.workflowId } : {}),
      ...(filters.taskId ? { lastTaskId: filters.taskId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prismaService.dataRecord.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prismaService.dataRecord.count({ where }),
    ]);

    const columns = this.buildColumns(collection.schemaFields, items.map((item) => item.dataJson));

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
