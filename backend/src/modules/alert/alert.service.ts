import { Injectable } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

type AlertLevel = 'error' | 'warning' | 'success';

@Injectable()
export class AlertService {
  constructor(private readonly prismaService: PrismaService) {}

  async findAll(filters?: {
    page?: string;
    pageSize?: string;
    level?: string;
  }) {
    const page = Math.max(1, Number(filters?.page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(filters?.pageSize ?? 10) || 10));
    const level = this.isAlertLevel(filters?.level) ? filters?.level : undefined;
    const where = this.buildAlertWhere(level);

    const [events, total] = await Promise.all([
      this.prismaService.taskExecutionEvent.findMany({
        where,
        select: {
          id: true,
          taskId: true,
          message: true,
          status: true,
          level: true,
          createdAt: true,
          task: {
            select: {
              workflowId: true,
              triggerSource: true,
              status: true,
              workflow: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { sequence: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prismaService.taskExecutionEvent.count({
        where,
      }),
    ]);

    return {
      items: events.map((event) => {
        const levelMeta = this.mapAlertLevel(event.status, event.level);
        return {
          id: event.id,
          level: levelMeta.level,
          title: levelMeta.title,
          message: event.message || this.buildStatusMessage(event.status),
          createdAt: event.createdAt,
          taskId: event.taskId,
          workflowId: event.task.workflowId,
          workflowName: event.task.workflow?.name ?? '未命名工作流',
          triggerSource: event.task.triggerSource,
          taskStatus: event.task.status,
        };
      }),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  private mapAlertLevel(status?: TaskStatus | null, level?: string | null) {
    if (status === 'success') {
      return {
        level: 'success' as const,
        title: '任务执行成功',
      };
    }

    if (status === 'cancelled' || level === 'warn') {
      return {
        level: 'warning' as const,
        title: '任务执行告警',
      };
    }

    return {
      level: 'error' as const,
      title: '任务执行失败',
    };
  }

  private buildStatusMessage(status?: TaskStatus | null) {
    if (status === 'success') {
      return '工作流已执行完成。';
    }

    if (status === 'cancelled') {
      return '任务已被取消。';
    }

    if (status === 'failed') {
      return '任务执行失败。';
    }

    return '任务产生了一条新的系统告警。';
  }

  private isAlertLevel(value?: string): value is AlertLevel {
    return ['error', 'warning', 'success'].includes(value ?? '');
  }

  private buildAlertWhere(level?: AlertLevel): Prisma.TaskExecutionEventWhereInput {
    if (level === 'success') {
      return {
        OR: [
          {
            type: 'status',
            status: 'success',
          },
        ],
      };
    }

    if (level === 'warning') {
      return {
        OR: [
          {
            type: 'status',
            status: 'cancelled',
          },
          {
            type: 'log',
            level: 'warn',
          },
        ],
      };
    }

    if (level === 'error') {
      return {
        OR: [
          {
            type: 'status',
            status: 'failed',
          },
          {
            type: 'log',
            level: 'error',
          },
        ],
      };
    }

    return {
      OR: [
        {
          type: 'status',
          status: {
            in: ['failed', 'cancelled', 'success'],
          },
        },
        {
          type: 'log',
          level: {
            in: ['warn', 'error'],
          },
        },
      ],
    };
  }
}
