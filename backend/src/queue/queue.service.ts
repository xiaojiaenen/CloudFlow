import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TaskTriggerSource, Workflow } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { parseExpression } from 'cron-parser';
import {
  DEFAULT_TASK_EXECUTION_POLICY,
  TaskExecutionPolicySnapshot,
} from 'src/common/constants/task-execution.constants';
import {
  TASK_CANCEL_CHANNEL,
  TASK_CANCEL_KEY_PREFIX,
  TASK_EVENTS_CHANNEL,
  TASK_EXECUTION_JOB_NAME,
  TASK_QUEUE_NAME,
  WORKFLOW_SCHEDULE_JOB_NAME,
  WORKFLOW_SCHEDULER_QUEUE_NAME,
} from 'src/common/constants/redis.constants';
import {
  TaskExecutionEvent,
  TaskExecutionStatus,
  TaskLogLevel,
  TaskQueuePayload,
} from 'src/common/types/execution-event.types';
import {
  buildWorkflowExecutionSnapshot,
  resolveWorkflowRuntimeInputs,
} from 'src/common/utils/workflow-runtime';
import {
  createRedisConnection,
  resolveRedisConfig,
  type RedisConnection,
} from 'src/common/utils/redis-connection';
import { WorkflowDefinition } from 'src/common/types/workflow.types';
import { PrismaService } from 'src/prisma/prisma.service';

interface WorkflowSchedulePayload {
  workflowId: string;
}

type TaskExecutionPolicyConfig = Pick<
  TaskExecutionPolicySnapshot,
  | 'screenshotIntervalMs'
  | 'globalTaskConcurrency'
  | 'perUserTaskConcurrency'
  | 'manualTaskPriority'
  | 'scheduledTaskPriority'
>;

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queue: Queue<TaskQueuePayload>;
  private readonly schedulerQueue: Queue<WorkflowSchedulePayload>;
  private readonly schedulerWorker: Worker<WorkflowSchedulePayload>;
  private readonly connection: RedisConnection;
  private readonly publisher: RedisConnection;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {
    const redisConfig = resolveRedisConfig(this.configService);

    this.connection = createRedisConnection(redisConfig, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectionName: 'cloudflow-queue',
    });

    this.publisher = createRedisConnection(redisConfig, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectionName: 'cloudflow-queue-publisher',
    });

    this.queue = new Queue<TaskQueuePayload>(TASK_QUEUE_NAME, {
      connection: this.connection,
      prefix: redisConfig.bullPrefix,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    });

    this.schedulerQueue = new Queue<WorkflowSchedulePayload>(
      WORKFLOW_SCHEDULER_QUEUE_NAME,
      {
        connection: this.connection,
        prefix: redisConfig.bullPrefix,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 1000,
        },
      },
    );

    this.schedulerWorker = new Worker<WorkflowSchedulePayload>(
      WORKFLOW_SCHEDULER_QUEUE_NAME,
      async (job) => {
        if (job.name !== WORKFLOW_SCHEDULE_JOB_NAME) {
          return;
        }

        await this.handleScheduledWorkflow(job);
      },
      {
        connection: this.connection,
        prefix: redisConfig.bullPrefix,
        concurrency: 1,
      },
    );

    this.schedulerWorker.on('ready', () => {
      this.logger.log('Workflow scheduler worker is ready');
    });

    this.schedulerWorker.on('failed', (job, error) => {
      this.logger.error(`Workflow schedule job ${job?.id} failed`, error.stack);
    });
  }

  async onModuleInit() {
    await this.syncAllWorkflowSchedules();
  }

  async enqueueTask(payload: TaskQueuePayload) {
    const job = await this.queue.add(TASK_EXECUTION_JOB_NAME, payload, {
      jobId: payload.taskId,
      priority: payload.priority,
    });
    this.logger.log(`Task ${payload.taskId} enqueued as job ${job.id}`);
    return job;
  }

  async getTaskExecutionPolicy(): Promise<TaskExecutionPolicyConfig> {
    const config = await this.prismaService.systemConfig.findFirst({
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        screenshotIntervalMs: true,
        globalTaskConcurrency: true,
        perUserTaskConcurrency: true,
        manualTaskPriority: true,
        scheduledTaskPriority: true,
      },
    });

    return {
      screenshotIntervalMs:
        config?.screenshotIntervalMs ?? DEFAULT_TASK_EXECUTION_POLICY.screenshotIntervalMs,
      globalTaskConcurrency:
        config?.globalTaskConcurrency ?? DEFAULT_TASK_EXECUTION_POLICY.globalTaskConcurrency,
      perUserTaskConcurrency:
        config?.perUserTaskConcurrency ?? DEFAULT_TASK_EXECUTION_POLICY.perUserTaskConcurrency,
      manualTaskPriority:
        config?.manualTaskPriority ?? DEFAULT_TASK_EXECUTION_POLICY.manualTaskPriority,
      scheduledTaskPriority:
        config?.scheduledTaskPriority ?? DEFAULT_TASK_EXECUTION_POLICY.scheduledTaskPriority,
    };
  }

  async resolveTaskPriority(triggerSource: TaskTriggerSource) {
    const policy = await this.getTaskExecutionPolicy();
    return triggerSource === 'schedule'
      ? policy.scheduledTaskPriority
      : policy.manualTaskPriority;
  }

  async cancelPendingTask(taskId: string) {
    const job = await this.queue.getJob(taskId);

    if (!job) {
      return false;
    }

    const state = await job.getState();

    if (state === 'active' || state === 'completed' || state === 'failed') {
      return false;
    }

    await job.remove();
    return true;
  }

  async validateWorkflowSchedule(schedule?: {
    enabled?: boolean;
    cron?: string | null;
    timezone?: string | null;
  }) {
    if (!schedule?.enabled) {
      return;
    }

    if (!schedule.cron?.trim()) {
      throw new Error('启用定时调度时必须提供 Cron 表达式。');
    }

    parseExpression(schedule.cron.trim(), {
      tz: schedule.timezone?.trim() || 'Asia/Shanghai',
    });
  }

  async syncWorkflowSchedule(workflow: {
    id: string;
    scheduleEnabled: boolean;
    scheduleCron: string | null;
    scheduleTimezone: string | null;
  }) {
    const schedulerId = this.getSchedulerId(workflow.id);

    if (!workflow.scheduleEnabled || !workflow.scheduleCron) {
      await this.schedulerQueue.removeJobScheduler(schedulerId);
      this.logger.log(`Removed scheduler for workflow ${workflow.id}`);
      return;
    }

    await this.schedulerQueue.upsertJobScheduler(
      schedulerId,
      {
        pattern: workflow.scheduleCron,
        tz: workflow.scheduleTimezone || 'Asia/Shanghai',
      },
      {
        name: WORKFLOW_SCHEDULE_JOB_NAME,
        data: {
          workflowId: workflow.id,
        },
        opts: {
          removeOnComplete: 100,
          removeOnFail: 1000,
        },
      },
    );

    this.logger.log(
      `Synced scheduler for workflow ${workflow.id} with cron "${workflow.scheduleCron}" (${workflow.scheduleTimezone || 'Asia/Shanghai'})`,
    );
  }

  async getWorkflowScheduler(workflowId: string) {
    return this.schedulerQueue.getJobScheduler(this.getSchedulerId(workflowId));
  }

  async getHealth() {
    const [redis, taskCounts, schedulerCounts] = await Promise.all([
      this.connection.ping(),
      this.queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      this.schedulerQueue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      ),
    ]);

    return {
      redis: redis === 'PONG' ? 'up' : 'degraded',
      queues: {
        tasks: taskCounts,
        schedulers: schedulerCounts,
      },
    };
  }

  async requestTaskCancellation(taskId: string) {
    await this.publisher.set(this.getCancellationKey(taskId), '1', 'EX', 60 * 60 * 24);
    await this.publisher.publish(TASK_CANCEL_CHANNEL, JSON.stringify({ taskId }));
  }

  async clearTaskCancellation(taskId: string) {
    await this.publisher.del(this.getCancellationKey(taskId));
  }

  async publishEvent(event: TaskExecutionEvent) {
    await this.publisher.publish(TASK_EVENTS_CHANNEL, JSON.stringify(event));
  }

  async publishLog(
    taskId: string,
    message: string,
    level: TaskLogLevel = 'info',
    nodeId?: string,
  ) {
    await this.publishEvent({
      taskId,
      type: 'log',
      data: {
        message,
        level,
        nodeId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async publishStatus(taskId: string, status: TaskExecutionStatus, errorMessage?: string) {
    await this.publishEvent({
      taskId,
      type: 'status',
      data: {
        status,
        errorMessage,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private async syncAllWorkflowSchedules() {
    const workflows = await this.prismaService.workflow.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        scheduleEnabled: true,
        scheduleCron: true,
        scheduleTimezone: true,
      },
    });

    for (const workflow of workflows) {
      await this.syncWorkflowSchedule(workflow);
    }
  }

  private async handleScheduledWorkflow(job: Job<WorkflowSchedulePayload>) {
    const workflow = await this.prismaService.workflow.findUnique({
      where: { id: job.data.workflowId },
    });

    if (
      !workflow ||
      workflow.deletedAt ||
      workflow.status === 'archived' ||
      !workflow.scheduleEnabled ||
      !workflow.scheduleCron
    ) {
      await this.schedulerQueue.removeJobScheduler(this.getSchedulerId(job.data.workflowId));
      return;
    }

    const task = await this.createTaskFromWorkflow(workflow);

    await this.publishLog(task.id, `定时调度已触发工作流“${workflow.name}”。`, 'info');
    await this.publishStatus(task.id, 'pending');
  }

  private async createTaskFromWorkflow(workflow: Workflow) {
    const priority = await this.resolveTaskPriority('schedule');
    const workflowDefinition = workflow.definition as unknown as WorkflowDefinition;
    const runtimeContext = resolveWorkflowRuntimeInputs(
      workflowDefinition.inputSchema ?? [],
      {},
    );
    const executionSnapshot = buildWorkflowExecutionSnapshot(
      workflowDefinition,
      runtimeContext.inputs,
    );

    const task = await this.prismaService.task.create({
      data: {
        workflowId: workflow.id,
        ownerId: workflow.ownerId,
        status: 'pending',
        triggerSource: 'schedule',
        queuePriority: priority,
        workflowSnapshot: executionSnapshot as unknown as Prisma.InputJsonValue,
      },
    });

    await this.enqueueTask({
      taskId: task.id,
      ownerId: workflow.ownerId,
      triggerSource: 'schedule',
      priority,
      workflow: executionSnapshot,
      inputs: runtimeContext.inputs,
    });

    return task;
  }

  private getSchedulerId(workflowId: string) {
    return `workflow-scheduler:${workflowId}`;
  }

  private getCancellationKey(taskId: string) {
    return `${TASK_CANCEL_KEY_PREFIX}${taskId}`;
  }

  async onModuleDestroy() {
    await this.schedulerWorker.close();
    await this.schedulerQueue.close();
    await this.queue.close();
    await this.publisher.quit();
    await this.connection.quit();
  }
}
