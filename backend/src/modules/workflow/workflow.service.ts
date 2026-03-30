import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueueService } from 'src/queue/queue.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async create(createWorkflowDto: CreateWorkflowDto) {
    await this.validateSchedule(createWorkflowDto.schedule);
    this.validateAlerts(createWorkflowDto.alerts);

    const workflow = await this.prismaService.workflow.create({
      data: {
        name: createWorkflowDto.name,
        description: createWorkflowDto.description,
        definition: createWorkflowDto.definition as unknown as Prisma.InputJsonValue,
        scheduleEnabled: createWorkflowDto.schedule?.enabled ?? false,
        scheduleCron: createWorkflowDto.schedule?.enabled ? createWorkflowDto.schedule.cron?.trim() ?? null : null,
        scheduleTimezone: createWorkflowDto.schedule?.enabled
          ? createWorkflowDto.schedule.timezone?.trim() || 'Asia/Shanghai'
          : null,
        alertEmail: createWorkflowDto.alerts?.email?.trim() || null,
        alertOnFailure: createWorkflowDto.alerts?.onFailure ?? false,
        alertOnSuccess: createWorkflowDto.alerts?.onSuccess ?? false,
      },
    });

    await this.queueService.syncWorkflowSchedule(workflow);
    return workflow;
  }

  async findAll() {
    return this.prismaService.workflow.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const workflow = await this.prismaService.workflow.findUnique({
      where: { id },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    return workflow;
  }

  async update(id: string, updateWorkflowDto: UpdateWorkflowDto) {
    const existingWorkflow = await this.findOne(id);
    const nextSchedule = updateWorkflowDto.schedule
      ? {
          enabled: updateWorkflowDto.schedule.enabled,
          cron: updateWorkflowDto.schedule.cron,
          timezone: updateWorkflowDto.schedule.timezone,
        }
      : {
          enabled: existingWorkflow.scheduleEnabled,
          cron: existingWorkflow.scheduleCron,
          timezone: existingWorkflow.scheduleTimezone,
        };

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
        ...(updateWorkflowDto.schedule
          ? {
              scheduleEnabled: updateWorkflowDto.schedule.enabled,
              scheduleCron: updateWorkflowDto.schedule.enabled
                ? updateWorkflowDto.schedule.cron?.trim() ?? null
                : null,
              scheduleTimezone: updateWorkflowDto.schedule.enabled
                ? updateWorkflowDto.schedule.timezone?.trim() || 'Asia/Shanghai'
                : null,
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

  private validateAlerts(alerts?: {
    email?: string | null;
    onFailure?: boolean;
    onSuccess?: boolean;
  }, strict = true) {
    const shouldNotify = alerts?.onFailure || alerts?.onSuccess;

    if (!strict && !alerts?.email?.trim()) {
      return;
    }

    if (shouldNotify && !alerts?.email?.trim()) {
      throw new BadRequestException('启用邮件告警时必须填写通知邮箱。');
    }
  }
}
