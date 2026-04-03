import 'dotenv/config';
import { mkdir, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { DelayedError, Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Browser, BrowserContext, Frame, Page, chromium } from 'playwright';
import {
  DEFAULT_TASK_EXECUTION_POLICY,
  TaskExecutionPolicySnapshot,
} from '../src/common/constants/task-execution.constants';
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
  TaskExtractPayload,
  TaskLogLevel,
  TaskQueuePayload,
  TaskScreenshotPayload,
} from '../src/common/types/execution-event.types';
import {
  WorkflowCanvasEdge,
  WorkflowDefinition,
  WorkflowNode,
} from '../src/common/types/workflow.types';

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
const taskRuntimeBaseDir = process.env.TASK_RUNTIME_BASE_DIR
  ? path.resolve(process.env.TASK_RUNTIME_BASE_DIR)
  : path.resolve(process.cwd(), 'runtime', 'tasks');
const USER_RUNNING_KEY_PREFIX = 'cloudflow:user-running:';
const USER_RUNNING_SLOT_TTL_MS = 90_000;
const USER_RUNNING_SLOT_RETRY_DELAY_MS = 3_000;
const USER_RUNNING_SLOT_RENEW_INTERVAL_MS = 30_000;
const RESOURCE_MONITOR_INTERVAL_MS = 2_000;
const cpuCoreCount =
  typeof os.availableParallelism === 'function'
    ? Math.max(1, os.availableParallelism())
    : Math.max(1, os.cpus().length);

let browserPromise: Promise<Browser> | null = null;
let workerInstance: Worker<TaskQueuePayload> | null = null;
const taskControllers = new Map<string, { cancelRequested: boolean; context?: BrowserContext }>();

interface ExecutionContext {
  page: Page;
  activeFrame: Frame | null;
  variables: Record<string, string>;
  tempDir: string;
}

interface ExecutionResult {
  branch?: 'true' | 'false';
}

interface TraversalGraph {
  orderedNodeIds: string[];
  nodeById: Map<string, WorkflowNode>;
  outgoing: Map<string, WorkflowCanvasEdge[]>;
  incomingCounts: Map<string, number>;
  rankById: Map<string, { index: number; x: number; y: number }>;
}

interface TaskRuntimeOptions {
  screenshotIntervalMs: number;
  tempDir: string;
}

interface ResourceSnapshot {
  memoryRssMb: number;
  heapUsedMb: number;
  cpuPercent: number;
}

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

async function publishScreenshot(taskId: string, payload: TaskScreenshotPayload) {
  await publishEvent({
    taskId,
    type: 'screenshot',
    data: payload,
  });
}

async function publishExtract(taskId: string, payload: TaskExtractPayload) {
  await publishEvent({
    taskId,
    type: 'extract',
    data: payload,
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

async function getTaskExecutionPolicy(): Promise<TaskExecutionPolicySnapshot> {
  const config = await prisma.systemConfig.findFirst({
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

async function resolveTaskOwnerId(taskId: string, ownerId?: string) {
  if (ownerId?.trim()) {
    return ownerId;
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { ownerId: true },
  });

  if (!task?.ownerId) {
    throw new Error(`Unable to resolve ownerId for task ${taskId}.`);
  }

  return task.ownerId;
}

function getUserRunningKey(ownerId: string) {
  return `${USER_RUNNING_KEY_PREFIX}${ownerId}`;
}

async function tryAcquireUserExecutionSlot(ownerId: string, limit: number) {
  const result = await workerConnection.eval(
    `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local ttl = tonumber(ARGV[2])
      local current = tonumber(redis.call('GET', key) or '0')

      if current >= limit then
        return 0
      end

      local nextValue = redis.call('INCR', key)
      redis.call('PEXPIRE', key, ttl)
      return nextValue
    `,
    1,
    getUserRunningKey(ownerId),
    String(limit),
    String(USER_RUNNING_SLOT_TTL_MS),
  );

  return Number(result) > 0;
}

function startUserExecutionSlotHeartbeat(ownerId: string) {
  const interval = setInterval(() => {
    void workerConnection
      .pexpire(getUserRunningKey(ownerId), USER_RUNNING_SLOT_TTL_MS)
      .catch(() => undefined);
  }, USER_RUNNING_SLOT_RENEW_INTERVAL_MS);

  return () => clearInterval(interval);
}

async function releaseUserExecutionSlot(ownerId: string) {
  await workerConnection.eval(
    `
      local key = KEYS[1]
      local current = tonumber(redis.call('GET', key) or '0')

      if current <= 1 then
        redis.call('DEL', key)
        return 0
      end

      local nextValue = redis.call('DECR', key)
      redis.call('PEXPIRE', key, tonumber(ARGV[1]))
      return nextValue
    `,
    1,
    getUserRunningKey(ownerId),
    String(USER_RUNNING_SLOT_TTL_MS),
  );
}

async function ensureTaskTempDir(taskId: string) {
  const tempDir = path.join(taskRuntimeBaseDir, taskId);
  await mkdir(tempDir, { recursive: true });
  return tempDir;
}

function toMb(bytes: number) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

function createResourceSnapshot(
  previousCpuUsage: NodeJS.CpuUsage,
  previousTimestamp: bigint,
): { snapshot: ResourceSnapshot; cpuUsage: NodeJS.CpuUsage; timestamp: bigint } {
  const memory = process.memoryUsage();
  const currentCpuUsage = process.cpuUsage();
  const currentTimestamp = process.hrtime.bigint();
  const elapsedMicroseconds = Math.max(1, Number(currentTimestamp - previousTimestamp) / 1000);
  const cpuDeltaUser = currentCpuUsage.user - previousCpuUsage.user;
  const cpuDeltaSystem = currentCpuUsage.system - previousCpuUsage.system;
  const cpuPercent = Math.min(
    100,
    Number((((cpuDeltaUser + cpuDeltaSystem) / (elapsedMicroseconds * cpuCoreCount)) * 100).toFixed(2)),
  );

  return {
    snapshot: {
      memoryRssMb: toMb(memory.rss),
      heapUsedMb: toMb(memory.heapUsed),
      cpuPercent: Number.isFinite(cpuPercent) ? cpuPercent : 0,
    },
    cpuUsage: currentCpuUsage,
    timestamp: currentTimestamp,
  };
}

function startResourceMonitor(taskId: string) {
  let previousCpuUsage = process.cpuUsage();
  let previousTimestamp = process.hrtime.bigint();
  let peakMemoryRssMb = 0;
  let peakHeapUsedMb = 0;
  let peakCpuPercent = 0;
  let flushing = false;

  const flush = async () => {
    if (flushing) {
      return;
    }

    flushing = true;

    try {
      const nextSample = createResourceSnapshot(previousCpuUsage, previousTimestamp);
      previousCpuUsage = nextSample.cpuUsage;
      previousTimestamp = nextSample.timestamp;
      peakMemoryRssMb = Math.max(peakMemoryRssMb, nextSample.snapshot.memoryRssMb);
      peakHeapUsedMb = Math.max(peakHeapUsedMb, nextSample.snapshot.heapUsedMb);
      peakCpuPercent = Math.max(peakCpuPercent, nextSample.snapshot.cpuPercent);

      await prisma.task.update({
        where: { id: taskId },
        data: {
          workerPid: process.pid,
          resourceHeartbeatAt: new Date(),
          memoryRssMb: nextSample.snapshot.memoryRssMb,
          peakMemoryRssMb,
          heapUsedMb: nextSample.snapshot.heapUsedMb,
          peakHeapUsedMb,
          cpuPercent: nextSample.snapshot.cpuPercent,
          peakCpuPercent,
        },
      });
    } catch {
      // Ignore transient sampling failures so execution can continue.
    } finally {
      flushing = false;
    }
  };

  void flush();

  const interval = setInterval(() => {
    void flush();
  }, RESOURCE_MONITOR_INTERVAL_MS);

  return async () => {
    clearInterval(interval);
    await flush();
  };
}

function startScreenshotStream(taskId: string, page: Page, intervalMs: number, tempDir: string) {
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
      await writeFile(path.join(tempDir, 'latest-stream.jpg'), buffer).catch(() => undefined);

      await publishScreenshot(taskId, {
        imageBase64: buffer.toString('base64'),
        mimeType: 'image/jpeg',
        source: 'stream',
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Ignore transient screenshot failures when pages are navigating.
    } finally {
      capturing = false;
    }
  }, Math.max(100, intervalMs));

  return () => clearInterval(interval);
}

function resolveTemplateValue(
  value: string,
  runtimeInputs: Record<string, string>,
  variables: Record<string, string>,
) {
  return value.replace(
    /\{\{\s*(inputs|variables)\.([a-zA-Z0-9_-]+)\s*\}\}/g,
    (_, scope: 'inputs' | 'variables', key: string) => {
      return scope === 'inputs' ? runtimeInputs[key] ?? '' : variables[key] ?? '';
    },
  );
}

function resolveNumberValue(
  value: unknown,
  fallback: number,
  runtimeInputs: Record<string, string>,
  variables: Record<string, string>,
) {
  const resolved = resolveTemplateValue(String(value ?? fallback), runtimeInputs, variables);
  const parsed = Number(resolved);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeComparableValue(value: string) {
  return value.trim();
}

function compareCondition(left: string, operator: string, right: string) {
  const normalizedLeft = normalizeComparableValue(left);
  const normalizedRight = normalizeComparableValue(right);
  const leftNumber = Number(normalizedLeft);
  const rightNumber = Number(normalizedRight);
  const useNumber = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);

  switch (operator) {
    case 'not_equals':
      return normalizedLeft !== normalizedRight;
    case 'contains':
      return normalizedLeft.includes(normalizedRight);
    case 'not_contains':
      return !normalizedLeft.includes(normalizedRight);
    case 'greater_than':
      return useNumber ? leftNumber > rightNumber : normalizedLeft > normalizedRight;
    case 'less_than':
      return useNumber ? leftNumber < rightNumber : normalizedLeft < normalizedRight;
    case 'is_empty':
      return normalizedLeft.length === 0;
    case 'not_empty':
      return normalizedLeft.length > 0;
    case 'equals':
    default:
      return normalizedLeft === normalizedRight;
  }
}

function resolveNode(
  node: WorkflowNode,
  runtimeInputs: Record<string, string>,
  variables: Record<string, string>,
) {
  switch (node.type) {
    case 'open_page':
      return {
        ...node,
        url: resolveTemplateValue(node.url, runtimeInputs, variables),
      };
    case 'click':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables),
      };
    case 'input':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables),
        value: resolveTemplateValue(node.value, runtimeInputs, variables),
      };
    case 'hover':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables),
      };
    case 'press_key':
      return {
        ...node,
        key: resolveTemplateValue(node.key, runtimeInputs, variables),
      };
    case 'select_option':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables),
        value: resolveTemplateValue(node.value, runtimeInputs, variables),
      };
    case 'check':
    case 'uncheck':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables),
      };
    case 'set_variable':
      return {
        ...node,
        key: resolveTemplateValue(node.key, runtimeInputs, variables),
        value: resolveTemplateValue(node.value, runtimeInputs, variables),
      };
    case 'condition':
      return {
        ...node,
        left: resolveTemplateValue(node.left, runtimeInputs, variables),
        right: resolveTemplateValue(String(node.right ?? ''), runtimeInputs, variables),
        operator: resolveTemplateValue(String(node.operator ?? 'equals'), runtimeInputs, variables) as
          | 'equals'
          | 'not_equals'
          | 'contains'
          | 'not_contains'
          | 'greater_than'
          | 'less_than'
          | 'is_empty'
          | 'not_empty',
      };
    case 'wait':
      return {
        ...node,
        time: resolveNumberValue(node.time ?? node.duration, 1000, runtimeInputs, variables),
      };
    case 'wait_for_element':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables),
        state: resolveTemplateValue(
          String(node.state ?? 'visible'),
          runtimeInputs,
          variables,
        ) as 'attached' | 'detached' | 'visible' | 'hidden',
        timeout: resolveNumberValue(node.timeout, 10000, runtimeInputs, variables),
      };
    case 'wait_for_text':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables),
        text: resolveTemplateValue(node.text, runtimeInputs, variables),
        matchMode: resolveTemplateValue(
          String(node.matchMode ?? 'contains'),
          runtimeInputs,
          variables,
        ) as 'contains' | 'equals' | 'not_contains' | 'not_equals',
        timeout: resolveNumberValue(node.timeout, 10000, runtimeInputs, variables),
      };
    case 'wait_for_class':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables),
        className: resolveTemplateValue(node.className, runtimeInputs, variables),
        condition: resolveTemplateValue(
          String(node.condition ?? 'contains'),
          runtimeInputs,
          variables,
        ) as 'contains' | 'not_contains',
        timeout: resolveNumberValue(node.timeout, 10000, runtimeInputs, variables),
      };
    case 'wait_for_url':
      return {
        ...node,
        urlIncludes: resolveTemplateValue(String(node.urlIncludes ?? ''), runtimeInputs, variables),
        waitUntil: resolveTemplateValue(
          String(node.waitUntil ?? 'load'),
          runtimeInputs,
          variables,
        ) as 'load' | 'domcontentloaded' | 'networkidle' | 'commit',
        timeout: resolveNumberValue(node.timeout, 10000, runtimeInputs, variables),
      };
    case 'switch_iframe':
      return {
        ...node,
        selector: resolveTemplateValue(String(node.selector ?? ''), runtimeInputs, variables),
        name: resolveTemplateValue(String(node.name ?? ''), runtimeInputs, variables),
        urlIncludes: resolveTemplateValue(String(node.urlIncludes ?? ''), runtimeInputs, variables),
        timeout: resolveNumberValue(node.timeout, 10000, runtimeInputs, variables),
      };
    case 'switch_main_frame':
      return node;
    case 'scroll':
      return {
        ...node,
        direction: resolveTemplateValue(
          String(node.direction ?? 'down'),
          runtimeInputs,
          variables,
        ) as 'down' | 'up' | 'bottom' | 'top',
        distance: resolveNumberValue(node.distance, 500, runtimeInputs, variables),
      };
    case 'extract':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables),
        property: resolveTemplateValue(
          String(node.property ?? 'text'),
          runtimeInputs,
          variables,
        ) as 'text' | 'html' | 'href' | 'src' | 'value' | 'attribute',
        attributeName: resolveTemplateValue(
          String(node.attributeName ?? ''),
          runtimeInputs,
          variables,
        ),
        saveAs: resolveTemplateValue(String(node.saveAs ?? ''), runtimeInputs, variables),
      };
    case 'screenshot':
      return {
        ...node,
        scope: resolveTemplateValue(
          String(node.scope ?? 'viewport'),
          runtimeInputs,
          variables,
        ) as 'viewport' | 'full' | 'element',
        selector: resolveTemplateValue(String(node.selector ?? ''), runtimeInputs, variables),
      };
    default:
      return node;
  }
}

function getActiveTarget(executionContext: ExecutionContext) {
  return executionContext.activeFrame ?? executionContext.page;
}

async function findFrame(
  executionContext: ExecutionContext,
  node: Extract<WorkflowNode, { type: 'switch_iframe' }>,
) {
  const { page } = executionContext;
  const timeout = Number(node.timeout ?? 10000);
  const target = getActiveTarget(executionContext);

  if (node.selector) {
    const iframeLocator = target.locator(node.selector).first();
    await iframeLocator.waitFor({ state: 'attached', timeout });
    const handle = await iframeLocator.elementHandle();
    const frame = await handle?.contentFrame();

    if (frame) {
      return frame;
    }
  }

  const deadline = Date.now() + timeout;

  while (Date.now() <= deadline) {
    const frame = page.frames().find((candidate) => {
      const nameMatched = node.name ? candidate.name() === node.name : false;
      const urlMatched = node.urlIncludes ? candidate.url().includes(node.urlIncludes) : false;
      return nameMatched || urlMatched;
    });

    if (frame) {
      return frame;
    }

    await page.waitForTimeout(200);
  }

  throw new Error('Unable to find matching iframe. Check selector, name, or URL.');
}

async function executeNode(
  taskId: string,
  executionContext: ExecutionContext,
  node: WorkflowNode,
): Promise<ExecutionResult | undefined> {
  const { page, tempDir } = executionContext;
  const target = getActiveTarget(executionContext);

  switch (node.type) {
    case 'open_page':
      await publishLog(taskId, `Open page ${node.url}`, 'info', node.clientNodeId);
      executionContext.activeFrame = null;
      await page.goto(node.url, { waitUntil: 'domcontentloaded' });
      return;
    case 'click':
      await publishLog(taskId, `Click ${node.selector}`, 'info', node.clientNodeId);
      await target.locator(node.selector).first().click();
      return;
    case 'input':
      await publishLog(taskId, `Fill ${node.selector}`, 'info', node.clientNodeId);
      await target.locator(node.selector).first().fill(node.value);
      return;
    case 'hover':
      await publishLog(taskId, `Hover ${node.selector}`, 'info', node.clientNodeId);
      await target.locator(node.selector).first().hover();
      return;
    case 'press_key':
      await publishLog(taskId, `Press key ${node.key}`, 'info', node.clientNodeId);
      await page.keyboard.press(node.key);
      return;
    case 'select_option':
      await publishLog(taskId, `Select option ${node.value} on ${node.selector}`, 'info', node.clientNodeId);
      await target.locator(node.selector).first().selectOption({ value: node.value });
      return;
    case 'check':
      await publishLog(taskId, `Check ${node.selector}`, 'info', node.clientNodeId);
      await target.locator(node.selector).first().check();
      return;
    case 'uncheck':
      await publishLog(taskId, `Uncheck ${node.selector}`, 'info', node.clientNodeId);
      await target.locator(node.selector).first().uncheck();
      return;
    case 'set_variable':
      executionContext.variables[node.key] = node.value;
      await publishLog(
        taskId,
        `Variable ${node.key} updated to ${node.value || '(empty)'}`,
        'success',
        node.clientNodeId,
      );
      return;
    case 'condition': {
      const matched = compareCondition(node.left, node.operator ?? 'equals', String(node.right ?? ''));
      await publishLog(
        taskId,
        `Condition result: ${node.left} ${node.operator ?? 'equals'} ${String(node.right ?? '')} => ${matched ? 'true' : 'false'}`,
        matched ? 'success' : 'warn',
        node.clientNodeId,
      );
      return { branch: matched ? 'true' : 'false' };
    }
    case 'wait': {
      const duration = Number(node.time ?? node.duration ?? 1000);
      await publishLog(taskId, `Wait ${duration}ms`, 'info', node.clientNodeId);

      let remaining = duration;
      while (remaining > 0) {
        await ensureTaskNotCancelled(taskId);
        const slice = Math.min(remaining, 200);
        await page.waitForTimeout(slice);
        remaining -= slice;
      }

      return;
    }
    case 'wait_for_element': {
      const timeout = Number(node.timeout ?? 10000);
      const state = node.state ?? 'visible';
      await publishLog(
        taskId,
        `Wait for element ${node.selector} to become ${state} within ${timeout}ms`,
        'info',
        node.clientNodeId,
      );
      await target.locator(node.selector).first().waitFor({ state, timeout });
      return;
    }
    case 'wait_for_text': {
      const timeout = Number(node.timeout ?? 10000);
      const matchMode = node.matchMode ?? 'contains';
      const deadline = Date.now() + timeout;
      const locator = target.locator(node.selector).first();

      await publishLog(
        taskId,
        `Wait for text on ${node.selector} to satisfy ${matchMode} ${node.text}`,
        'info',
        node.clientNodeId,
      );

      while (Date.now() <= deadline) {
        await ensureTaskNotCancelled(taskId);
        const textContent = ((await locator.textContent().catch(() => '')) ?? '').trim();
        const matched = compareCondition(
          textContent,
          matchMode === 'equals'
            ? 'equals'
            : matchMode === 'not_contains'
              ? 'not_contains'
              : matchMode === 'not_equals'
                ? 'not_equals'
                : 'contains',
          node.text,
        );

        if (matched) {
          await publishLog(
            taskId,
            `Text condition satisfied: ${textContent || '(empty)'}`,
            'success',
            node.clientNodeId,
          );
          return;
        }

        await page.waitForTimeout(200);
      }

      throw new Error(`Timed out waiting for text on ${node.selector} to satisfy ${matchMode} ${node.text}`);
    }
    case 'wait_for_class': {
      const timeout = Number(node.timeout ?? 10000);
      const deadline = Date.now() + timeout;
      const locator = target.locator(node.selector).first();
      const condition = node.condition ?? 'contains';

      await publishLog(
        taskId,
        `Wait for class on ${node.selector} to ${condition === 'contains' ? 'contain' : 'exclude'} ${node.className}`,
        'info',
        node.clientNodeId,
      );

      while (Date.now() <= deadline) {
        await ensureTaskNotCancelled(taskId);
        const classValue = (await locator.getAttribute('class').catch(() => '')) ?? '';
        const classes = classValue.split(/\s+/).filter(Boolean);
        const hasClass = classes.includes(node.className);
        const matched = condition === 'not_contains' ? !hasClass : hasClass;

        if (matched) {
          await publishLog(
            taskId,
            `Class condition satisfied: ${classValue || '(none)'}`,
            'success',
            node.clientNodeId,
          );
          return;
        }

        await page.waitForTimeout(200);
      }

      throw new Error(`Timed out waiting for class on ${node.selector} to satisfy ${condition} ${node.className}`);
    }
    case 'wait_for_url': {
      const timeout = Number(node.timeout ?? 10000);
      const waitUntil = node.waitUntil ?? 'load';
      const urlIncludes = node.urlIncludes?.trim();
      await publishLog(
        taskId,
        urlIncludes
          ? `Wait for URL to include ${urlIncludes} at ${waitUntil}`
          : `Wait for page load state ${waitUntil}`,
        'info',
        node.clientNodeId,
      );

      if (urlIncludes) {
        await page.waitForURL((url) => url.toString().includes(urlIncludes), { timeout, waitUntil });
      } else if (waitUntil === 'commit') {
        await page.waitForURL(() => true, { timeout, waitUntil: 'commit' });
      } else {
        await page.waitForLoadState(waitUntil, { timeout });
      }

      executionContext.activeFrame = null;
      return;
    }
    case 'switch_iframe': {
      const frame = await findFrame(executionContext, node);
      executionContext.activeFrame = frame;
      await publishLog(
        taskId,
        `Switched to iframe${frame.name() ? ` (${frame.name()})` : ''}`,
        'success',
        node.clientNodeId,
      );
      return;
    }
    case 'switch_main_frame':
      executionContext.activeFrame = null;
      await publishLog(taskId, 'Switched back to main frame.', 'success', node.clientNodeId);
      return;
    case 'scroll': {
      const direction = node.direction ?? 'down';
      const distance = Number(node.distance ?? 500);
      await publishLog(taskId, `Scroll ${direction} by ${distance}px`, 'info', node.clientNodeId);

      if (direction === 'bottom') {
        await target.evaluate(() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        });
      } else if (direction === 'top') {
        await target.evaluate(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      } else if (direction === 'up') {
        await target.evaluate((value) => {
          window.scrollBy({ top: -value, behavior: 'smooth' });
        }, distance);
      } else {
        await target.evaluate((value) => {
          window.scrollBy({ top: value, behavior: 'smooth' });
        }, distance);
      }

      await page.waitForTimeout(400);
      return;
    }
    case 'extract': {
      const property = node.property ?? 'text';
      const locator = target.locator(node.selector).first();
      await publishLog(taskId, `Extract ${property} from ${node.selector}`, 'info', node.clientNodeId);
      await locator.waitFor({ state: 'visible', timeout: 5000 });

      let extractedValue = '';

      if (property === 'html') {
        extractedValue = await locator.evaluate((element) => element.innerHTML);
      } else if (property === 'href') {
        extractedValue = (await locator.getAttribute('href')) ?? '';
      } else if (property === 'src') {
        extractedValue = (await locator.getAttribute('src')) ?? '';
      } else if (property === 'value') {
        extractedValue = await locator.inputValue().catch(async () => (await locator.getAttribute('value')) ?? '');
      } else if (property === 'attribute') {
        if (!node.attributeName) {
          throw new Error('extract node requires attributeName when property is attribute.');
        }

        extractedValue = (await locator.getAttribute(node.attributeName)) ?? '';
      } else {
        extractedValue = await locator.innerText();
      }

      const preview = extractedValue.length > 120 ? `${extractedValue.slice(0, 120)}...` : extractedValue;
      await publishExtract(taskId, {
        selector: node.selector,
        property,
        value: extractedValue,
        preview: preview || '[empty result]',
        nodeId: node.clientNodeId,
        timestamp: new Date().toISOString(),
      });

      if (node.saveAs) {
        executionContext.variables[node.saveAs] = extractedValue;
        await publishLog(taskId, `Saved extract result to variable ${node.saveAs}`, 'success', node.clientNodeId);
      }

      await publishLog(taskId, `Extract result: ${preview || '[empty result]'}`, 'success', node.clientNodeId);
      return;
    }
    case 'screenshot': {
      const scope = node.scope ?? 'viewport';
      await publishLog(
        taskId,
        scope === 'element'
          ? `Capture element screenshot ${node.selector || '(missing selector)'}`
          : `Capture screenshot scope ${scope === 'full' ? 'full-page' : 'viewport'}`,
        'info',
        node.clientNodeId,
      );

      let buffer: Buffer;

      if (scope === 'element') {
        if (!node.selector) {
          throw new Error('screenshot node requires selector when scope is element.');
        }

        buffer = await target.locator(node.selector).first().screenshot({ type: 'jpeg', quality: 75 });
      } else {
        buffer = await page.screenshot({ type: 'jpeg', quality: 75, fullPage: scope === 'full' });
      }

      await writeFile(
        path.join(tempDir, `node-screenshot-${Date.now()}.jpg`),
        buffer,
      ).catch(() => undefined);

      await publishScreenshot(taskId, {
        imageBase64: buffer.toString('base64'),
        mimeType: 'image/jpeg',
        source: 'node',
        timestamp: new Date().toISOString(),
      });

      await publishLog(taskId, 'Screenshot pushed to frontend.', 'success', node.clientNodeId);
      return;
    }
    default:
      throw new Error(`Unsupported workflow node: ${(node as WorkflowNode).type}`);
  }
}

function buildFallbackEdges(nodeIds: string[]): WorkflowCanvasEdge[] {
  return nodeIds.slice(1).map((target, index) => ({
    id: `e${nodeIds[index]}-${target}`,
    source: nodeIds[index],
    target,
    sourceHandle: null,
    targetHandle: null,
  }));
}

function buildTraversalGraph(workflow: WorkflowDefinition): TraversalGraph {
  const nodeById = new Map<string, WorkflowNode>();
  const orderedNodeIds: string[] = [];
  const rankById = new Map<string, { index: number; x: number; y: number }>();
  const canvasNodeMap = new Map(
    (workflow.canvas?.nodes ?? []).map((node, index) => [
      node.id,
      { index, x: node.position.x, y: node.position.y },
    ]),
  );

  workflow.nodes.forEach((node, index) => {
    const nodeId = String(node.clientNodeId ?? `node-${index + 1}`);
    nodeById.set(nodeId, { ...node, clientNodeId: nodeId });
  });

  if (workflow.canvas?.nodes?.length) {
    workflow.canvas.nodes.forEach((canvasNode, index) => {
      if (nodeById.has(canvasNode.id)) {
        orderedNodeIds.push(canvasNode.id);
        rankById.set(canvasNode.id, { index, x: canvasNode.position.x, y: canvasNode.position.y });
      }
    });
  }

  for (const [nodeId] of nodeById) {
    if (!orderedNodeIds.includes(nodeId)) {
      orderedNodeIds.push(nodeId);
      const fallbackIndex = orderedNodeIds.length - 1;
      rankById.set(nodeId, canvasNodeMap.get(nodeId) ?? { index: fallbackIndex, x: 0, y: fallbackIndex });
    }
  }

  const edges = workflow.canvas?.edges?.length && workflow.canvas.nodes?.length
    ? workflow.canvas.edges
    : buildFallbackEdges(orderedNodeIds);

  const incomingCounts = new Map<string, number>();
  const outgoing = new Map<string, WorkflowCanvasEdge[]>();

  for (const nodeId of orderedNodeIds) {
    incomingCounts.set(nodeId, 0);
    outgoing.set(nodeId, []);
  }

  const compareByRank = (left: string, right: string) => {
    const leftRank = rankById.get(left) ?? { index: 0, x: 0, y: 0 };
    const rightRank = rankById.get(right) ?? { index: 0, x: 0, y: 0 };

    if (leftRank.y !== rightRank.y) return leftRank.y - rightRank.y;
    if (leftRank.x !== rightRank.x) return leftRank.x - rightRank.x;
    return leftRank.index - rightRank.index;
  };

  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) {
      continue;
    }

    incomingCounts.set(edge.target, (incomingCounts.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  }

  for (const [nodeId, nodeEdges] of outgoing) {
    outgoing.set(nodeId, nodeEdges.sort((left, right) => compareByRank(left.target, right.target)));
  }

  return { orderedNodeIds, nodeById, outgoing, incomingCounts, rankById };
}

function getStartNodeIds(graph: TraversalGraph) {
  return graph.orderedNodeIds.filter((nodeId) => (graph.incomingCounts.get(nodeId) ?? 0) === 0);
}

function getNextNodeId(graph: TraversalGraph, currentNodeId: string, result?: ExecutionResult) {
  const outgoing = graph.outgoing.get(currentNodeId) ?? [];
  if (outgoing.length === 0) {
    return null;
  }

  const currentNode = graph.nodeById.get(currentNodeId);
  if (currentNode?.type === 'condition') {
    const branch = result?.branch ?? 'false';
    const handledEdge = outgoing.find((edge) => edge.sourceHandle === branch);
    if (handledEdge) {
      return handledEdge.target;
    }

    const plainEdges = outgoing.filter((edge) => !edge.sourceHandle);
    if (plainEdges.length > 0) {
      return branch === 'true'
        ? plainEdges[0]?.target ?? null
        : plainEdges[1]?.target ?? plainEdges[0]?.target ?? null;
    }

    return null;
  }

  return outgoing[0]?.target ?? null;
}

async function executeWorkflow(
  taskId: string,
  workflow: WorkflowDefinition,
  executionContext: ExecutionContext,
  runtimeInputs: Record<string, string>,
) {
  const graph = buildTraversalGraph(workflow);
  const visited = new Set<string>();
  const startNodeIds = getStartNodeIds(graph);
  const candidateNodeIds = [...startNodeIds, ...graph.orderedNodeIds.filter((nodeId) => !startNodeIds.includes(nodeId))];

  let safetyCounter = 0;
  const maxSteps = Math.max(graph.orderedNodeIds.length * 5, 20);

  for (const rootNodeId of candidateNodeIds) {
    if (visited.has(rootNodeId)) {
      continue;
    }

    let currentNodeId: string | null = rootNodeId;

    while (currentNodeId) {
      if (visited.has(currentNodeId)) {
        break;
      }

      if (safetyCounter >= maxSteps) {
        throw new Error('Workflow execution exceeded the safety limit. Check for cyclic branches.');
      }

      const node = graph.nodeById.get(currentNodeId);
      if (!node) {
        visited.add(currentNodeId);
        break;
      }

      safetyCounter += 1;
      await ensureTaskNotCancelled(taskId);
      const resolvedNode = resolveNode(node, runtimeInputs, executionContext.variables);
      const result = await executeNode(taskId, executionContext, resolvedNode);
      await ensureTaskNotCancelled(taskId);

      visited.add(currentNodeId);
      const nextNodeId = getNextNodeId(graph, currentNodeId, result);
      currentNodeId = nextNodeId && !visited.has(nextNodeId) ? nextNodeId : null;
    }
  }
}

async function runTask(job: Job<TaskQueuePayload>, runtimeOptions: TaskRuntimeOptions) {
  const { taskId, workflow } = job.data;
  const runtimeInputs = job.data.inputs ?? workflow.runtime?.inputs ?? {};
  const browser = await getBrowser();
  const controller = getTaskController(taskId);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });

  controller.context = context;

  const page = await context.newPage();
  const executionContext: ExecutionContext = {
    page,
    activeFrame: null,
    variables: {},
    tempDir: runtimeOptions.tempDir,
  };
  const stopScreenshotStream = startScreenshotStream(
    taskId,
    page,
    runtimeOptions.screenshotIntervalMs,
    runtimeOptions.tempDir,
  );
  const stopResourceMonitor = startResourceMonitor(taskId);

  try {
    await ensureTaskNotCancelled(taskId);

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'running',
        startedAt: new Date(),
        errorMessage: null,
        tempDir: runtimeOptions.tempDir,
        workerPid: process.pid,
        resourceHeartbeatAt: new Date(),
      },
    });

    await publishStatus(taskId, 'running');
    await publishLog(
      taskId,
      `Task started with ${workflow.nodes.length} nodes, ${Object.keys(runtimeInputs).length} runtime inputs, priority ${job.data.priority}.`,
    );

    await executeWorkflow(taskId, workflow, executionContext, runtimeInputs);

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'success', completedAt: new Date() },
    });

    await publishLog(taskId, `Task completed and produced ${Object.keys(executionContext.variables).length} variables.`, 'success');
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

      await publishLog(taskId, 'Task cancelled.', 'warn');
      await publishStatus(taskId, 'cancelled');
      return;
    }

    const message = error instanceof Error ? error.message : 'Unknown execution error';

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'failed', completedAt: new Date(), errorMessage: message },
    });

    await publishLog(taskId, `Task failed: ${message}`, 'error');
    await publishStatus(taskId, 'failed', message);

    throw error;
  } finally {
    stopScreenshotStream();
    await stopResourceMonitor();
    await context.close().catch(() => undefined);
    await clearTaskCancellation(taskId);
  }
}

async function bootstrap() {
  await mkdir(taskRuntimeBaseDir, { recursive: true });

  const policy = await getTaskExecutionPolicy();
  const workerConcurrency = Math.max(1, policy.globalTaskConcurrency);

  workerInstance = new Worker<TaskQueuePayload>(
    TASK_QUEUE_NAME,
    async (job, token) => {
      if (job.name !== TASK_EXECUTION_JOB_NAME) {
        return;
      }

      const taskId = job.data.taskId;
      const ownerId = await resolveTaskOwnerId(taskId, job.data.ownerId);
      const runtimePolicy = await getTaskExecutionPolicy();
      const acquired = await tryAcquireUserExecutionSlot(
        ownerId,
        runtimePolicy.perUserTaskConcurrency,
      );

      if (!acquired) {
        await publishLog(
          taskId,
          `Per-user concurrency limit reached (${runtimePolicy.perUserTaskConcurrency}), retrying in ${USER_RUNNING_SLOT_RETRY_DELAY_MS}ms.`,
          'warn',
        );
        await job.moveToDelayed(Date.now() + USER_RUNNING_SLOT_RETRY_DELAY_MS, token);
        throw new DelayedError();
      }

      const stopSlotHeartbeat = startUserExecutionSlotHeartbeat(ownerId);
      const tempDir = await ensureTaskTempDir(taskId);

      try {
        await prisma.task.update({
          where: { id: taskId },
          data: {
            tempDir,
            workerPid: process.pid,
          },
        });

        await runTask(job, {
          screenshotIntervalMs: runtimePolicy.screenshotIntervalMs,
          tempDir,
        });
      } finally {
        stopSlotHeartbeat();
        await releaseUserExecutionSlot(ownerId).catch(() => undefined);
      }
    },
    {
      connection: workerConnection,
      concurrency: workerConcurrency,
    },
  );

  workerInstance.on('ready', () => {
    console.log(
      `[worker] CloudFlow worker is ready (global concurrency ${workerConcurrency})`,
    );
  });

  workerInstance.on('completed', (job) => {
    console.log(`[worker] Job ${job.id} completed`);
  });

  workerInstance.on('failed', (job, error) => {
    console.error(`[worker] Job ${job?.id} failed`, error);
  });
}

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
  if (workerInstance) {
    await workerInstance.close();
  }
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

void bootstrap().catch((error) => {
  console.error('[worker] Failed to bootstrap CloudFlow worker', error);
  void shutdown(1);
});
