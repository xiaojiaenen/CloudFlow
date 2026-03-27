import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { chromium, Browser, Page } from 'playwright';
import {
  TASK_EVENTS_CHANNEL,
  TASK_EXECUTION_JOB_NAME,
  TASK_QUEUE_NAME,
} from '../src/common/constants/redis.constants';
import {
  TaskExecutionEvent,
  TaskExecutionStatus,
  TaskLogLevel,
  TaskQueuePayload,
} from '../src/common/types/execution-event.types';
import { WorkflowNode } from '../src/common/types/workflow.types';

const prisma = new PrismaClient();
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const workerConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
const publisher = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

let browserPromise: Promise<Browser> | null = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: process.env.BROWSER_HEADLESS !== 'false',
    });
  }

  return browserPromise;
}

async function publishEvent(event: TaskExecutionEvent) {
  await publisher.publish(TASK_EVENTS_CHANNEL, JSON.stringify(event));
}

async function publishLog(taskId: string, message: string, level: TaskLogLevel = 'info') {
  await publishEvent({
    taskId,
    type: 'log',
    data: {
      message,
      level,
      timestamp: new Date().toISOString(),
    },
  });
}

async function publishStatus(taskId: string, status: TaskExecutionStatus, errorMessage?: string) {
  await publishEvent({
    taskId,
    type: 'status',
    data: {
      status,
      errorMessage,
      timestamp: new Date().toISOString(),
    },
  });
}

function startScreenshotStream(taskId: string, page: Page) {
  let capturing = false;

  const interval = setInterval(async () => {
    if (capturing || page.isClosed()) {
      return;
    }

    capturing = true;

    try {
      const buffer = await page.screenshot({
        type: 'jpeg',
        quality: 60,
      });

      await publishEvent({
        taskId,
        type: 'screenshot',
        data: {
          imageBase64: buffer.toString('base64'),
          mimeType: 'image/jpeg',
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Ignore transient screenshot failures when pages are navigating.
    } finally {
      capturing = false;
    }
  }, 500);

  return () => clearInterval(interval);
}

async function executeNode(taskId: string, page: Page, node: WorkflowNode) {
  switch (node.type) {
    case 'open_page':
      await publishLog(taskId, `打开页面 ${node.url}`);
      await page.goto(node.url, { waitUntil: 'domcontentloaded' });
      break;
    case 'click':
      await publishLog(taskId, `点击元素 ${node.selector}`);
      await page.locator(node.selector).click();
      break;
    case 'input':
      await publishLog(taskId, `输入内容到 ${node.selector}`);
      await page.locator(node.selector).fill(node.value);
      break;
    case 'wait': {
      const duration = Number(node.time ?? node.duration ?? 1000);
      await publishLog(taskId, `等待 ${duration}ms`);
      await page.waitForTimeout(duration);
      break;
    }
    default:
      throw new Error(`Unsupported workflow node: ${(node as WorkflowNode).type}`);
  }
}

async function runTask(job: Job<TaskQueuePayload>) {
  const { taskId, workflow } = job.data;
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: {
      width: 1440,
      height: 900,
    },
  });
  const page = await context.newPage();
  const stopScreenshotStream = startScreenshotStream(taskId, page);

  try {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'running',
        startedAt: new Date(),
        errorMessage: null,
      },
    });

    await publishStatus(taskId, 'running');
    await publishLog(taskId, `开始执行任务，共 ${workflow.nodes.length} 个节点`);

    for (const node of workflow.nodes) {
      await executeNode(taskId, page, node);
    }

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'success',
        completedAt: new Date(),
      },
    });

    await publishLog(taskId, '任务执行完成', 'success');
    await publishStatus(taskId, 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown execution error';

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: message,
      },
    });

    await publishLog(taskId, `任务执行失败: ${message}`, 'error');
    await publishStatus(taskId, 'failed', message);

    throw error;
  } finally {
    stopScreenshotStream();
    await context.close();
  }
}

const worker = new Worker<TaskQueuePayload>(
  TASK_QUEUE_NAME,
  async (job) => {
    if (job.name !== TASK_EXECUTION_JOB_NAME) {
      return;
    }

    await runTask(job);
  },
  {
    connection: workerConnection,
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
  },
);

worker.on('ready', () => {
  console.log('[worker] CloudFlow worker is ready');
});

worker.on('completed', (job) => {
  console.log(`[worker] Job ${job.id} completed`);
});

worker.on('failed', (job, error) => {
  console.error(`[worker] Job ${job?.id} failed`, error);
});

async function shutdown(code = 0) {
  await worker.close();
  await publisher.quit();
  await workerConnection.quit();
  await prisma.$disconnect();

  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
  }

  process.exit(code);
}

process.on('SIGINT', () => {
  void shutdown(0);
});

process.on('SIGTERM', () => {
  void shutdown(0);
});
