import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus, TaskTriggerSource } from '@prisma/client';
import {
  buildWorkflowExecutionSnapshot,
  resolveWorkflowRuntimeInputs,
} from 'src/common/utils/workflow-runtime';
import { WorkflowDefinition } from 'src/common/types/workflow.types';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueueService } from 'src/queue/queue.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { RunTaskDto } from './dto/run-task.dto';

@Injectable()
export class TaskService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly queueService: QueueService,
  ) {}

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
    const executionSnapshot = buildWorkflowExecutionSnapshot(
      workflowDefinition,
      runtimeContext.inputs,
    );
    const priority = await this.queueService.resolveTaskPriority('manual');

    const task = await this.prismaService.task.create({
      data: {
        workflowId: workflow.id,
        ownerId: workflow.ownerId ?? currentUser.id,
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
            errorMessage: 'Task cancelled by user.',
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
      '已发送停止请求，正在等待 Worker 安全终止任务...',
      'warn',
    );

    return updatedTask;
  }

  async retry(id: string, currentUser: AuthenticatedUser) {
    const task = await this.getTaskOrThrow(id, currentUser);
    const priority = await this.queueService.resolveTaskPriority('manual');

    const retriedTask = await this.prismaService.task.create({
      data: {
        workflowId: task.workflowId,
        ownerId: task.ownerId,
        status: 'pending',
        triggerSource: 'manual',
        queuePriority: priority,
        workflowSnapshot: task.workflowSnapshot as Prisma.InputJsonValue,
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
      workflow: task.workflowSnapshot as unknown as WorkflowDefinition,
      inputs:
        (
          task.workflowSnapshot as Record<string, unknown> | null
        )?.runtime &&
        typeof (task.workflowSnapshot as Record<string, unknown>).runtime === 'object'
          ? (((task.workflowSnapshot as Record<string, unknown>).runtime as Record<
              string,
              unknown
            >).inputs as Record<string, string> | undefined) ?? {}
          : {},
    });

    return retriedTask;
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
}
