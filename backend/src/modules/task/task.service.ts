import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus, TaskTriggerSource } from '@prisma/client';
import { WorkflowDefinition } from 'src/common/types/workflow.types';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueueService } from 'src/queue/queue.service';
import { RunTaskDto } from './dto/run-task.dto';

@Injectable()
export class TaskService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async run(runTaskDto: RunTaskDto) {
    const workflow = await this.prismaService.workflow.findUnique({
      where: {
        id: runTaskDto.workflowId,
      },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${runTaskDto.workflowId} not found`);
    }

    if (workflow.deletedAt) {
      throw new NotFoundException(`Workflow ${runTaskDto.workflowId} not found`);
    }

    const task = await this.prismaService.task.create({
      data: {
        workflowId: workflow.id,
        status: 'pending',
        triggerSource: 'manual',
        workflowSnapshot: workflow.definition as Prisma.InputJsonValue,
      },
      include: {
        workflow: true,
      },
    });

    await this.queueService.enqueueTask({
      taskId: task.id,
      workflow: workflow.definition as unknown as WorkflowDefinition,
    });

    return task;
  }

  async findOne(id: string) {
    return this.getTaskOrThrow(id, true);
  }

  async findAll(filters?: {
    page?: string;
    pageSize?: string;
    status?: string;
    triggerSource?: string;
    workflowId?: string;
    activeOnly?: string;
  }) {
    const page = Math.max(1, Number(filters?.page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(filters?.pageSize ?? 10) || 10));
    const where: Prisma.TaskWhereInput = {
      ...(this.isTaskStatus(filters?.status) ? { status: filters?.status } : {}),
      ...(this.isTriggerSource(filters?.triggerSource)
        ? { triggerSource: filters?.triggerSource }
        : {}),
      ...(filters?.workflowId ? { workflowId: filters.workflowId } : {}),
      ...(filters?.activeOnly === 'true'
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

  async findRecent(limit = 5) {
    return this.prismaService.task.findMany({
      include: {
        workflow: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  async cancel(id: string) {
    const task = await this.getTaskOrThrow(id);

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
    await this.queueService.publishLog(task.id, '已发送停止请求，正在等待 Worker 安全终止任务...', 'warn');

    return updatedTask;
  }

  private async getTaskOrThrow(id: string, includeExecutionEvents = false) {
    const task = await this.prismaService.task.findUnique({
      where: { id },
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
    return ['pending', 'running', 'success', 'failed', 'cancelled'].includes(
      value ?? '',
    );
  }

  private isTriggerSource(value?: string): value is TaskTriggerSource {
    return ['manual', 'schedule'].includes(value ?? '');
  }
}
