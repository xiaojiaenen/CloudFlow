import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    const task = await this.prismaService.task.create({
      data: {
        workflowId: workflow.id,
        status: 'pending',
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

  async findAll() {
    return this.prismaService.task.findMany({
      include: {
        workflow: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
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
}
