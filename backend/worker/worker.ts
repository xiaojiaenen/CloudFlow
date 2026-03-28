import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import {
  TASK_CANCEL_CHANNEL,
  TASK_CANCEL_KEY_PREFIX,
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
const cancellationSubscriber = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

let browserPromise: Promise<Browser> | null = null;
const taskControllers = new Map<string, { cancelRequested: boolean; context?: BrowserContext }>();

class TaskCancelledError extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} cancelled by user.`);
    this.name = 'TaskCancelledError';
  }
}

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

async function publishLog(
  taskId: string,
  message: string,
  level: TaskLogLevel = 'info',
  nodeId?: string,
) {
  await publishEvent({
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

function getCancellationKey(taskId: string) {
  return `${TASK_CANCEL_KEY_PREFIX}${taskId}`;
}

function getTaskController(taskId: string) {
  const existingController = taskControllers.get(taskId);

  if (existingController) {
    return existingController;
  }

  const controller = {
    cancelRequested: false,
    context: undefined as BrowserContext | undefined,
  };

  taskControllers.set(taskId, controller);
  return controller;
}

function requestTaskCancellation(taskId: string) {
  const controller = getTaskController(taskId);
  controller.cancelRequested = true;

  if (controller.context) {
    void controller.context.close().catch(() => undefined);
  }
}

async function isTaskCancellationRequested(taskId: string) {
  const controller = taskControllers.get(taskId);

  if (controller?.cancelRequested) {
    return true;
  }

  const result = await publisher.exists(getCancellationKey(taskId));
  return result === 1;
}

async function ensureTaskNotCancelled(taskId: string) {
  if (await isTaskCancellationRequested(taskId)) {
    throw new TaskCancelledError(taskId);
  }
}

async function clearTaskCancellation(taskId: string) {
  taskControllers.delete(taskId);
  await publisher.del(getCancellationKey(taskId));
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
      await publishLog(taskId, `打开页面 ${node.url}`, 'info', node.clientNodeId);
      await page.goto(node.url, { waitUntil: 'domcontentloaded' });
      break;
    case 'click':
      await publishLog(taskId, `点击元素 ${node.selector}`, 'info', node.clientNodeId);
      await page.locator(node.selector).click();
      break;
    case 'input':
      await publishLog(taskId, `输入内容到 ${node.selector}`, 'info', node.clientNodeId);
      await page.locator(node.selector).fill(node.value);
      break;
    case 'wait': {
      const duration = Number(node.time ?? node.duration ?? 1000);
      await publishLog(taskId, `等待 ${duration}ms`, 'info', node.clientNodeId);

      let remaining = duration;
      while (remaining > 0) {
        await ensureTaskNotCancelled(taskId);
        const slice = Math.min(remaining, 200);
        await page.waitForTimeout(slice);
        remaining -= slice;
      }

      break;
    }
    case 'scroll': {
      const direction = node.direction ?? 'down';
      const distance = Number(node.distance ?? 500);
      await publishLog(taskId, `滚动页面，方向 ${direction}，距离 ${distance}px`, 'info', node.clientNodeId);

      if (direction === 'bottom') {
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
      } else if (direction === 'top') {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      } else if (direction === 'up') {
        await page.mouse.wheel(0, -distance);
      } else {
        await page.mouse.wheel(0, distance);
      }

      await page.waitForTimeout(400);
      break;
    }
    case 'extract': {
      const property = node.property ?? 'text';
      await publishLog(taskId, `提取元素 ${node.selector} 的 ${property}`, 'info', node.clientNodeId);

      const locator = page.locator(node.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 5000 });

      let extractedValue = '';

      if (property === 'html') {
        extractedValue = await locator.evaluate((element) => element.innerHTML);
      } else if (property === 'href') {
        extractedValue = (await locator.getAttribute('href')) ?? '';
      } else if (property === 'src') {
        extractedValue = (await locator.getAttribute('src')) ?? '';
      } else {
        extractedValue = await locator.innerText();
      }

      const preview = extractedValue.length > 120 ? `${extractedValue.slice(0, 120)}...` : extractedValue;
      await publishLog(taskId, `提取结果: ${preview || '[空值]'}`, 'success', node.clientNodeId);
      break;
    }
    case 'screenshot': {
      const scope = node.scope ?? 'viewport';
      await publishLog(taskId, `执行截图，范围 ${scope === 'full' ? '整个页面' : '当前视口'}`, 'info', node.clientNodeId);

      const buffer = await page.screenshot({
        type: 'jpeg',
        quality: 75,
        fullPage: scope === 'full',
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

      await publishLog(taskId, '截图已推送到前端。', 'success', node.clientNodeId);
      break;
    }
    default:
      throw new Error(`Unsupported workflow node: ${(node as WorkflowNode).type}`);
  }
}

async function runTask(job: Job<TaskQueuePayload>) {
  const { taskId, workflow } = job.data;
  const browser = await getBrowser();
  const controller = getTaskController(taskId);
  const context = await browser.newContext({
    viewport: {
      width: 1440,
      height: 900,
    },
  });

  controller.context = context;

  const page = await context.newPage();
  const stopScreenshotStream = startScreenshotStream(taskId, page);

  try {
    await ensureTaskNotCancelled(taskId);

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
      await ensureTaskNotCancelled(taskId);
      await executeNode(taskId, page, node);
      await ensureTaskNotCancelled(taskId);
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
    const cancellationRequested = await isTaskCancellationRequested(taskId);

    if (error instanceof TaskCancelledError || cancellationRequested) {
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'cancelled',
          completedAt: new Date(),
          errorMessage: 'Task cancelled by user.',
          cancelRequestedAt: new Date(),
        },
      });

      await publishLog(taskId, '任务已取消。', 'warn');
      await publishStatus(taskId, 'cancelled');
      return;
    }

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
    await context.close().catch(() => undefined);
    await clearTaskCancellation(taskId);
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

cancellationSubscriber.on('message', (channel, message) => {
  if (channel !== TASK_CANCEL_CHANNEL) {
    return;
  }

  try {
    const payload = JSON.parse(message) as { taskId?: string };
    if (payload.taskId) {
      requestTaskCancellation(payload.taskId);
    }
  } catch (error) {
    console.error('[worker] Failed to parse cancellation payload', error);
  }
});

void cancellationSubscriber.subscribe(TASK_CANCEL_CHANNEL);

async function shutdown(code = 0) {
  await worker.close();
  await cancellationSubscriber.quit();
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
