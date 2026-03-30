import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkflowLifecycleStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueueService } from 'src/queue/queue.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';

type ScheduleListItem = {
  id: string;
  name: string;
  description: string | null;
  scheduleCron: string | null;
  scheduleTimezone: string | null;
  nextRunAt: string | null;
  lastScheduledTask: {
    id: string;
    status: string;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
  } | null;
  alertEmail: string | null;
  alertOnFailure: boolean;
  alertOnSuccess: boolean;
  updatedAt: Date;
};

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async create(createWorkflowDto: CreateWorkflowDto) {
    const nextStatus = this.normalizeWorkflowStatus(createWorkflowDto.status);
    const normalizedSchedule = this.normalizeSchedulePayload(
      createWorkflowDto.schedule,
      nextStatus,
    );

    await this.validateSchedule(normalizedSchedule);
    this.validateAlerts(createWorkflowDto.alerts);

    const workflow = await this.prismaService.workflow.create({
      data: {
        name: createWorkflowDto.name,
        description: createWorkflowDto.description,
        definition: createWorkflowDto.definition as unknown as Prisma.InputJsonValue,
        status: nextStatus,
        scheduleEnabled: normalizedSchedule.enabled,
        scheduleCron: normalizedSchedule.cron,
        scheduleTimezone: normalizedSchedule.timezone,
        alertEmail: createWorkflowDto.alerts?.email?.trim() || null,
        alertOnFailure: createWorkflowDto.alerts?.onFailure ?? false,
        alertOnSuccess: createWorkflowDto.alerts?.onSuccess ?? false,
      },
    });

    await this.queueService.syncWorkflowSchedule(workflow);
    return workflow;
  }

  async findAll(filters?: {
    includeArchived?: string;
    status?: string;
    search?: string;
  }) {
    const where: Prisma.WorkflowWhereInput = {
      deletedAt: null,
      ...(this.isWorkflowStatus(filters?.status)
        ? { status: filters?.status }
        : filters?.includeArchived === 'true'
          ? {}
          : {
              status: {
                in: ['draft', 'active'],
              },
            }),
      ...(filters?.search?.trim()
        ? {
            OR: [
              {
                name: {
                  contains: filters.search.trim(),
                },
              },
              {
                description: {
                  contains: filters.search.trim(),
                },
              },
            ],
          }
        : {}),
    };

    return this.prismaService.workflow.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findSchedules(filters?: {
    page?: string;
    pageSize?: string;
    search?: string;
    lastStatus?: string;
  }): Promise<{
    items: ScheduleListItem[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    const page = Math.max(1, Number(filters?.page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(filters?.pageSize ?? 8) || 8));

    const workflows = await this.prismaService.workflow.findMany({
      where: {
        deletedAt: null,
        scheduleEnabled: true,
        status: {
          not: 'archived',
        },
        ...(filters?.search?.trim()
          ? {
              OR: [
                {
                  name: {
                    contains: filters.search.trim(),
                  },
                },
                {
                  description: {
                    contains: filters.search.trim(),
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        tasks: {
          where: {
            triggerSource: 'schedule',
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    const enrichedItems = await Promise.all(
      workflows.map(async (workflow) => {
        const scheduler = await this.queueService.getWorkflowScheduler(workflow.id);
        const latestScheduledTask = workflow.tasks[0] ?? null;

        return {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          scheduleCron: workflow.scheduleCron,
          scheduleTimezone: workflow.scheduleTimezone,
          nextRunAt: scheduler?.next ? new Date(scheduler.next).toISOString() : null,
          lastScheduledTask: latestScheduledTask
            ? {
                id: latestScheduledTask.id,
                status: latestScheduledTask.status,
                createdAt: latestScheduledTask.createdAt,
                startedAt: latestScheduledTask.startedAt,
                completedAt: latestScheduledTask.completedAt,
              }
            : null,
          alertEmail: workflow.alertEmail,
          alertOnFailure: workflow.alertOnFailure,
          alertOnSuccess: workflow.alertOnSuccess,
          updatedAt: workflow.updatedAt,
        };
      }),
    );

    const filteredItems = enrichedItems.filter((item) => {
      if (!filters?.lastStatus || filters.lastStatus === 'all') {
        return true;
      }

      if (filters.lastStatus === 'never') {
        return !item.lastScheduledTask;
      }

      return item.lastScheduledTask?.status === filters.lastStatus;
    });

    const total = filteredItems.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);

    if (safePage !== page) {
      return this.findSchedules({
        page: String(safePage),
        pageSize: String(pageSize),
        search: filters?.search,
        lastStatus: filters?.lastStatus,
      });
    }

    const start = (safePage - 1) * pageSize;
    const items = filteredItems.slice(start, start + pageSize);

    return {
      items,
      page: safePage,
      pageSize,
      total,
      totalPages,
    };
  }

  async findOne(id: string) {
    const workflow = await this.prismaService.workflow.findUnique({
      where: { id },
    });

    if (!workflow || workflow.deletedAt) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    return workflow;
  }

  async duplicate(id: string) {
    const existingWorkflow = await this.findOne(id);

    const duplicatedWorkflow = await this.prismaService.workflow.create({
      data: {
        name: `${existingWorkflow.name} 副本`,
        description: existingWorkflow.description,
        definition: existingWorkflow.definition as Prisma.InputJsonValue,
        status: 'draft',
        scheduleEnabled: false,
        scheduleCron: null,
        scheduleTimezone: null,
        alertEmail: existingWorkflow.alertEmail,
        alertOnFailure: existingWorkflow.alertOnFailure,
        alertOnSuccess: existingWorkflow.alertOnSuccess,
      },
    });

    await this.queueService.syncWorkflowSchedule(duplicatedWorkflow);
    return duplicatedWorkflow;
  }

  async update(id: string, updateWorkflowDto: UpdateWorkflowDto) {
    const existingWorkflow = await this.findOne(id);
    const nextStatus = this.normalizeWorkflowStatus(
      updateWorkflowDto.status ?? existingWorkflow.status,
    );
    const nextSchedule = this.normalizeSchedulePayload(
      updateWorkflowDto.schedule
        ? {
            enabled: updateWorkflowDto.schedule.enabled,
            cron: updateWorkflowDto.schedule.cron,
            timezone: updateWorkflowDto.schedule.timezone,
          }
        : {
            enabled: existingWorkflow.scheduleEnabled,
            cron: existingWorkflow.scheduleCron,
            timezone: existingWorkflow.scheduleTimezone,
          },
      nextStatus,
    );

    const nextAlerts = updateWorkflowDto.alerts
      ? {
          email: updateWorkflowDto.alerts.email,
          onFailure: updateWorkflowDto.alerts.onFailure,
          onSuccess: updateWorkflowDto.alerts.onSuccess,
        }
      : {
          email: existingWorkflow.alertEmail,
          onFailure: existingWorkflow.alertOnFailure,
          onSuccess: existingWorkflow.alertOnSuccess,
        };

    await this.validateSchedule(nextSchedule);
    this.validateAlerts(nextAlerts, Boolean(updateWorkflowDto.alerts));

    const workflow = await this.prismaService.workflow.update({
      where: { id },
      data: {
        ...(updateWorkflowDto.name ? { name: updateWorkflowDto.name } : {}),
        ...(updateWorkflowDto.description !== undefined
          ? { description: updateWorkflowDto.description }
          : {}),
        ...(updateWorkflowDto.definition
          ? {
              definition: updateWorkflowDto.definition as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(updateWorkflowDto.status ? { status: nextStatus } : {}),
        ...(updateWorkflowDto.schedule || nextStatus === 'archived'
          ? {
              scheduleEnabled: nextSchedule.enabled,
              scheduleCron: nextSchedule.cron,
              scheduleTimezone: nextSchedule.timezone,
            }
          : {}),
        ...(updateWorkflowDto.alerts
          ? {
              alertEmail: updateWorkflowDto.alerts.email?.trim() || null,
              alertOnFailure: updateWorkflowDto.alerts.onFailure,
              alertOnSuccess: updateWorkflowDto.alerts.onSuccess,
            }
          : {}),
      },
    });

    await this.queueService.syncWorkflowSchedule(workflow);
    return workflow;
  }

  async remove(id: string) {
    const workflow = await this.findOne(id);

    const deletedWorkflow = await this.prismaService.workflow.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        scheduleEnabled: false,
        scheduleCron: null,
        scheduleTimezone: null,
      },
    });

    await this.queueService.syncWorkflowSchedule({
      id: deletedWorkflow.id,
      scheduleEnabled: false,
      scheduleCron: null,
      scheduleTimezone: null,
    });

    return {
      id: workflow.id,
      deletedAt: deletedWorkflow.deletedAt,
    };
  }

  private async validateSchedule(schedule?: {
    enabled?: boolean;
    cron?: string | null;
    timezone?: string | null;
  }) {
    try {
      await this.queueService.validateWorkflowSchedule(schedule);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : '工作流调度配置无效。',
      );
    }
  }

  private validateAlerts(
    alerts?: {
      email?: string | null;
      onFailure?: boolean;
      onSuccess?: boolean;
    },
    strict = true,
  ) {
    const shouldNotify = alerts?.onFailure || alerts?.onSuccess;

    if (!strict && !alerts?.email?.trim()) {
      return;
    }

    if (shouldNotify && !alerts?.email?.trim()) {
      throw new BadRequestException('启用邮件告警时必须填写通知邮箱。');
    }
  }

  private normalizeWorkflowStatus(
    status?: string | null,
  ): WorkflowLifecycleStatus {
    return this.isWorkflowStatus(status) ? status : 'active';
  }

  private normalizeSchedulePayload(
    schedule:
      | {
          enabled?: boolean;
          cron?: string | null;
          timezone?: string | null;
        }
      | undefined,
    status: WorkflowLifecycleStatus,
  ) {
    if (status === 'archived') {
      return {
        enabled: false,
        cron: null,
        timezone: null,
      };
    }

    return {
      enabled: schedule?.enabled ?? false,
      cron: schedule?.enabled ? schedule.cron?.trim() ?? null : null,
      timezone: schedule?.enabled
        ? schedule.timezone?.trim() || 'Asia/Shanghai'
        : null,
    };
  }

  private isWorkflowStatus(value?: string | null): value is WorkflowLifecycleStatus {
    return ['draft', 'active', 'archived'].includes(value ?? '');
  }
}
