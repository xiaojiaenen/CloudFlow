import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  RequestTimeoutException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Prisma, TaskStatus, TaskTriggerSource } from '@prisma/client';
import {
  TASK_ELEMENT_PICK_CHANNEL,
  TASK_ELEMENT_PICK_RESPONSE_KEY_PREFIX,
} from 'src/common/constants/redis.constants';
import {
  createRedisConnection,
  resolveRedisConfig,
  type RedisConnection,
} from 'src/common/utils/redis-connection';
import {
  TaskElementPickerRequest,
  TaskElementPickerResult,
} from 'src/common/types/task-picker.types';
import {
  buildWorkflowExecutionSnapshot,
  resolveWorkflowCredentialBindings,
  resolveWorkflowRuntimeInputs,
  type ResolvableCredentialRecord,
} from 'src/common/utils/workflow-runtime';
import { decryptJsonValue } from 'src/common/utils/secret-envelope';
import { WorkflowDefinition } from 'src/common/types/workflow.types';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueueService } from 'src/queue/queue.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { TaskArtifactStorageService } from '../storage/task-artifact-storage.service';
import { PickTaskElementDto } from './dto/pick-task-element.dto';
import { RunTaskDto } from './dto/run-task.dto';

@Injectable()
export class TaskService implements OnModuleDestroy {
  private readonly redisConnection: RedisConnection;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly queueService: QueueService,
    private readonly storageService: TaskArtifactStorageService,
    private readonly configService: ConfigService,
  ) {
    const redisConfig = resolveRedisConfig(this.configService);
    this.redisConnection = createRedisConnection(redisConfig, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectionName: 'cloudflow-task-service',
    });
  }

  async onModuleDestroy() {
    await this.redisConnection.quit();
  }

  async run(runTaskDto: RunTaskDto, currentUser: AuthenticatedUser) {
    const workflow = await this.prismaService.workflow.findFirst({
      where: {
        id: runTaskDto.workflowId,
        deletedAt: null,
        ...this.buildWorkflowAccessWhere(currentUser),
      },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${runTaskDto.workflowId} not found`);
    }

    const workflowDefinition = workflow.definition as unknown as WorkflowDefinition;
    const runtimeContext = resolveWorkflowRuntimeInputs(
      workflowDefinition.inputSchema ?? [],
      runTaskDto.inputs,
    );
    const taskOwnerId = workflow.ownerId ?? currentUser.id;
    const credentialRuntime = await this.resolveCredentialRuntime(
      taskOwnerId,
      workflowDefinition,
      runTaskDto.credentialBindings,
    );
    const executionSnapshot = buildWorkflowExecutionSnapshot(
      workflowDefinition,
      runtimeContext.inputs,
      workflowDefinition.inputSchema ?? [],
      workflowDefinition.credentialRequirements ?? [],
      {
        bindings: credentialRuntime.bindings,
        maskedCredentials: credentialRuntime.maskedCredentials,
        credentialMetadata: credentialRuntime.credentialMetadata,
      },
    );
    const priority = await this.queueService.resolveTaskPriority('manual');

    const task = await this.prismaService.task.create({
      data: {
        workflowId: workflow.id,
        ownerId: taskOwnerId,
        status: 'pending',
        triggerSource: 'manual',
        queuePriority: priority,
        workflowSnapshot: executionSnapshot as unknown as Prisma.InputJsonValue,
      },
      include: {
        workflow: true,
      },
    });

    await this.queueService.enqueueTask({
      taskId: task.id,
      ownerId: task.ownerId,
      triggerSource: 'manual',
      priority,
      workflow: executionSnapshot,
      inputs: runtimeContext.inputs,
      credentials: credentialRuntime.credentials,
      credentialBindings: credentialRuntime.bindings,
    });

    return task;
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    return this.getTaskOrThrow(id, currentUser, true);
  }

  async findAll(
    filters: {
      page?: string;
      pageSize?: string;
      status?: string;
      triggerSource?: string;
      workflowId?: string;
      activeOnly?: string;
      search?: string;
    } = {},
    currentUser?: AuthenticatedUser,
  ) {
    const page = Math.max(1, Number(filters.page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(filters.pageSize ?? 10) || 10));
    const where: Prisma.TaskWhereInput = {
      ...this.buildTaskAccessWhere(currentUser),
      ...(this.isTaskStatus(filters.status) ? { status: filters.status } : {}),
      ...(this.isTriggerSource(filters.triggerSource)
        ? { triggerSource: filters.triggerSource }
        : {}),
      ...(filters.workflowId
        ? {
            workflowId: filters.workflowId,
            workflow: {
              deletedAt: null,
            },
          }
        : {}),
      ...(filters.search?.trim()
        ? {
            OR: [
              {
                id: {
                  contains: filters.search.trim(),
                },
              },
              {
                workflow: {
                  name: {
                    contains: filters.search.trim(),
                  },
                },
              },
            ],
          }
        : {}),
      ...(filters.activeOnly === 'true'
        ? {
            status: {
              in: ['pending', 'running'],
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prismaService.task.findMany({
        where,
        include: {
          workflow: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prismaService.task.count({
        where,
      }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async findRecent(limit = 5, currentUser?: AuthenticatedUser) {
    return this.prismaService.task.findMany({
      where: this.buildTaskAccessWhere(currentUser),
      include: {
        workflow: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  async getSummary(
    filters: {
      status?: string;
      triggerSource?: string;
      workflowId?: string;
      activeOnly?: string;
      search?: string;
    } = {},
    currentUser?: AuthenticatedUser,
  ) {
    const where: Prisma.TaskWhereInput = {
      ...this.buildTaskAccessWhere(currentUser),
      ...(this.isTaskStatus(filters.status) ? { status: filters.status } : {}),
      ...(this.isTriggerSource(filters.triggerSource)
        ? { triggerSource: filters.triggerSource }
        : {}),
      ...(filters.workflowId
        ? {
            workflowId: filters.workflowId,
          }
        : {}),
      ...(filters.search?.trim()
        ? {
            OR: [
              {
                id: {
                  contains: filters.search.trim(),
                },
              },
              {
                workflow: {
                  name: {
                    contains: filters.search.trim(),
                  },
                },
              },
            ],
          }
        : {}),
      ...(filters.activeOnly === 'true'
        ? {
            status: {
              in: ['pending', 'running'],
            },
          }
        : {}),
    };

    const [pending, running, success, failed, cancelled, manual, schedule, total] =
      await Promise.all([
        this.prismaService.task.count({ where: { ...where, status: 'pending' } }),
        this.prismaService.task.count({ where: { ...where, status: 'running' } }),
        this.prismaService.task.count({ where: { ...where, status: 'success' } }),
        this.prismaService.task.count({ where: { ...where, status: 'failed' } }),
        this.prismaService.task.count({ where: { ...where, status: 'cancelled' } }),
        this.prismaService.task.count({ where: { ...where, triggerSource: 'manual' } }),
        this.prismaService.task.count({ where: { ...where, triggerSource: 'schedule' } }),
        this.prismaService.task.count({ where }),
      ]);

    return {
      total,
      byStatus: {
        pending,
        running,
        success,
        failed,
        cancelled,
      },
      byTriggerSource: {
        manual,
        schedule,
      },
    };
  }

  async cancel(id: string, currentUser: AuthenticatedUser) {
    const task = await this.getTaskOrThrow(id, currentUser);

    if (task.status === 'success' || task.status === 'failed' || task.status === 'cancelled') {
      return task;
    }

    if (task.status === 'pending') {
      const removed = await this.queueService.cancelPendingTask(task.id);

      if (removed) {
        const cancelledTask = await this.prismaService.task.update({
          where: { id: task.id },
          data: {
            status: 'cancelled',
            cancelRequestedAt: new Date(),
            completedAt: new Date(),
            errorMessage: '任务已由用户取消。',
          },
          include: {
            workflow: true,
          },
        });

        await this.queueService.publishLog(task.id, '任务已在队列中取消。', 'warn');
        await this.queueService.publishStatus(task.id, 'cancelled');
        await this.queueService.clearTaskCancellation(task.id);

        return cancelledTask;
      }
    }

    const updatedTask = await this.prismaService.task.update({
      where: { id: task.id },
      data: {
        cancelRequestedAt: task.cancelRequestedAt ?? new Date(),
      },
      include: {
        workflow: true,
      },
    });

    await this.queueService.requestTaskCancellation(task.id);
    await this.queueService.publishLog(
      task.id,
      '已发送停止请求，正在等待 Worker 安全结束当前任务。',
      'warn',
    );

    return updatedTask;
  }

  async retry(id: string, currentUser: AuthenticatedUser) {
    const task = await this.getTaskOrThrow(id, currentUser);
    const workflowSnapshot = task.workflowSnapshot as unknown as WorkflowDefinition;
    const runtimeInputs = workflowSnapshot.runtime?.inputs ?? {};
    const credentialBindings = workflowSnapshot.runtime?.credentialBindings ?? {};
    const credentialRuntime = await this.resolveCredentialRuntime(
      task.ownerId,
      workflowSnapshot,
      credentialBindings,
    );
    const priority = await this.queueService.resolveTaskPriority('manual');

    const retriedTask = await this.prismaService.task.create({
      data: {
        workflowId: task.workflowId,
        ownerId: task.ownerId,
        status: 'pending',
        triggerSource: 'manual',
        queuePriority: priority,
        workflowSnapshot: buildWorkflowExecutionSnapshot(
          workflowSnapshot,
          runtimeInputs,
          workflowSnapshot.inputSchema ?? [],
          workflowSnapshot.credentialRequirements ?? [],
          {
            bindings: credentialRuntime.bindings,
            maskedCredentials: credentialRuntime.maskedCredentials,
            credentialMetadata: credentialRuntime.credentialMetadata,
          },
        ) as unknown as Prisma.InputJsonValue,
      },
      include: {
        workflow: true,
      },
    });

    await this.queueService.enqueueTask({
      taskId: retriedTask.id,
      ownerId: retriedTask.ownerId,
      triggerSource: 'manual',
      priority,
      workflow: workflowSnapshot,
      inputs: runtimeInputs,
      credentials: credentialRuntime.credentials,
      credentialBindings: credentialRuntime.bindings,
    });

    return retriedTask;
  }

  async getScreenshotAsset(
    taskId: string,
    eventId: string,
    currentUser?: AuthenticatedUser,
  ) {
    await this.getTaskOrThrow(taskId, currentUser);

    const event = await this.prismaService.taskExecutionEvent.findFirst({
      where: {
        id: eventId,
        taskId,
        type: 'screenshot',
      },
      select: {
        mimeType: true,
        imageBase64: true,
        storageProvider: true,
        storageBucket: true,
        storageKey: true,
      },
    });

    if (!event) {
      throw new NotFoundException(
        `Screenshot event ${eventId} not found for task ${taskId}`,
      );
    }

    const buffer = await this.storageService.readScreenshot(event);
    if (!buffer) {
      throw new NotFoundException(
        `Screenshot content ${eventId} not found for task ${taskId}`,
      );
    }

    return {
      buffer,
      mimeType: event.mimeType || 'image/jpeg',
    };
  }

  async pickElement(
    taskId: string,
    payload: PickTaskElementDto,
    currentUser: AuthenticatedUser,
  ) {
    const task = await this.getTaskOrThrow(taskId, currentUser);

    if (task.status !== 'running') {
      throw new BadRequestException(
        '只有运行中的任务才能从当前页面选取元素。',
      );
    }

    const requestId = randomUUID();
    const requestPayload: TaskElementPickerRequest = {
      requestId,
      taskId,
      xRatio: payload.xRatio,
      yRatio: payload.yRatio,
    };

    await this.redisConnection.publish(
      TASK_ELEMENT_PICK_CHANNEL,
      JSON.stringify(requestPayload),
    );

    const result = await this.waitForElementPickResult(requestId);

    if (result.error) {
      throw new BadRequestException(result.error);
    }

    return result;
  }

  private async getTaskOrThrow(
    id: string,
    currentUser?: AuthenticatedUser,
    includeExecutionEvents = false,
  ) {
    const task = await this.prismaService.task.findFirst({
      where: {
        id,
        ...this.buildTaskAccessWhere(currentUser),
      },
      include: {
        workflow: true,
        executionEvents: includeExecutionEvents
          ? {
              orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
            }
          : false,
      },
    });

    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }

    return task;
  }

  private async resolveCredentialRuntime(
    ownerId: string,
    workflowDefinition: WorkflowDefinition,
    providedBindings?: Record<string, unknown>,
  ) {
    const bindingIds = Array.from(
      new Set(
        Object.values(providedBindings ?? {})
          .map((value) => String(value ?? '').trim())
          .filter(Boolean),
      ),
    );

    const credentials: ResolvableCredentialRecord[] = bindingIds.length
      ? await this.prismaService.credential.findMany({
          where: {
            ownerId,
            id: {
              in: bindingIds,
            },
          },
          select: {
            id: true,
            name: true,
            type: true,
            provider: true,
            payload: true,
            payloadCiphertext: true,
          },
        })
      : [];
    const normalizedCredentials = credentials.map<ResolvableCredentialRecord>((credential) => ({
      ...credential,
      payload: credential.payloadCiphertext?.trim()
        ? decryptJsonValue(credential.payloadCiphertext, this.getSecretEnvelopeKey())
        : credential.payload,
    }));

    return resolveWorkflowCredentialBindings(
      workflowDefinition.credentialRequirements ?? [],
      providedBindings,
      normalizedCredentials,
    );
  }

  private getSecretEnvelopeKey() {
    return this.configService.get<string>(
      'SECRET_ENCRYPTION_KEY',
      'cloudflow-dev-secret-key',
    );
  }

  private isTaskStatus(value?: string): value is TaskStatus {
    return ['pending', 'running', 'success', 'failed', 'cancelled'].includes(value ?? '');
  }

  private isTriggerSource(value?: string): value is TaskTriggerSource {
    return ['manual', 'schedule'].includes(value ?? '');
  }

  private buildTaskAccessWhere(currentUser?: AuthenticatedUser): Prisma.TaskWhereInput {
    if (!currentUser || currentUser.role === 'admin') {
      return {};
    }

    return {
      ownerId: currentUser.id,
    };
  }

  private buildWorkflowAccessWhere(currentUser?: AuthenticatedUser): Prisma.WorkflowWhereInput {
    if (!currentUser || currentUser.role === 'admin') {
      return {};
    }

    return {
      ownerId: currentUser.id,
    };
  }

  private async waitForElementPickResult(
    requestId: string,
    timeoutMs = 6_000,
  ) {
    const responseKey = `${TASK_ELEMENT_PICK_RESPONSE_KEY_PREFIX}${requestId}`;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const raw = await this.redisConnection.get(responseKey);

      if (raw?.trim()) {
        await this.redisConnection.del(responseKey).catch(() => undefined);
        return JSON.parse(raw) as TaskElementPickerResult;
      }

      await sleep(120);
    }

    throw new RequestTimeoutException('当前页面暂时无法完成元素选取，请稍后重试。');
  }
}

function sleep(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
