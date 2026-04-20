import 'dotenv/config';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { DelayedError, Job, Worker } from 'bullmq';
import { Frame, Locator, Page } from 'playwright';
import {
  DEFAULT_TASK_EXECUTION_POLICY,
  TaskExecutionPolicySnapshot,
} from '../src/common/constants/task-execution.constants';
import {
  TASK_CANCEL_CHANNEL,
  TASK_EXECUTION_JOB_NAME,
  TASK_QUEUE_NAME,
} from '../src/common/constants/redis.constants';
import { TaskQueuePayload } from '../src/common/types/execution-event.types';
import {
  WorkflowCanvasEdge,
  WorkflowDefinition,
  WorkflowNode,
} from '../src/common/types/workflow.types';
import {
  createRedisConnection,
  resolveRedisConfig,
} from '../src/common/utils/redis-connection';
import {
  TaskCancelledError,
  createTaskCancellationManager,
} from './runtime/cancellation';
import { closeBrowser, getBrowser } from './runtime/browser';
import { executeSaveDataNode } from './runtime/data';
import { createTaskEventPublisher } from './runtime/events';
import { createTaskResourceManager } from './runtime/resources';

const prisma = new PrismaClient();
const redisConfig = resolveRedisConfig(process.env);
const workerConnection = createRedisConnection(redisConfig, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectionName: 'cloudflow-worker',
});
const publisher = createRedisConnection(redisConfig, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectionName: 'cloudflow-worker-publisher',
});
const cancellationSubscriber = createRedisConnection(redisConfig, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectionName: 'cloudflow-worker-cancel-subscriber',
});
const taskRuntimeBaseDir = process.env.TASK_RUNTIME_BASE_DIR
  ? path.resolve(process.env.TASK_RUNTIME_BASE_DIR)
  : path.resolve(process.cwd(), 'runtime', 'tasks');
const USER_RUNNING_KEY_PREFIX = 'cloudflow:user-running:';
const GLOBAL_RUNNING_KEY = 'cloudflow:global-running';
const USER_RUNNING_SLOT_TTL_MS = 90_000;
const GLOBAL_RUNNING_SLOT_TTL_MS = 90_000;
const USER_RUNNING_SLOT_RETRY_DELAY_MS = 3_000;
const GLOBAL_RUNNING_SLOT_RETRY_DELAY_MS = 3_000;
const USER_RUNNING_SLOT_RENEW_INTERVAL_MS = 30_000;
const GLOBAL_RUNNING_SLOT_RENEW_INTERVAL_MS = 30_000;

let workerInstance: Worker<TaskQueuePayload> | null = null;

interface ExecutionContext {
  page: Page;
  activeFrame: Frame | null;
  runtimeInputs: Record<string, string>;
  variables: Record<string, string>;
  credentials: Record<string, Record<string, string>>;
  tempDir: string;
  workflowId: string;
  ownerId: string;
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

const {
  publishLog,
  publishStatus,
  publishScreenshot,
  publishExtract,
  publishDataWrite,
} = createTaskEventPublisher(publisher);

const {
  getTaskController,
  requestTaskCancellation,
  isTaskCancellationRequested,
  ensureTaskNotCancelled,
  clearTaskCancellation,
} = createTaskCancellationManager(publisher);

const {
  ensureTaskTempDir,
  startResourceMonitor,
  startScreenshotStream,
} = createTaskResourceManager(prisma, taskRuntimeBaseDir);

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

async function tryAcquireGlobalExecutionSlot(taskId: string, limit: number) {
  const result = await workerConnection.eval(
    `
      local key = KEYS[1]
      local member = ARGV[1]
      local limit = tonumber(ARGV[2])
      local ttl = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])
      local expiresAt = now - ttl

      redis.call('ZREMRANGEBYSCORE', key, '-inf', expiresAt)

      if redis.call('ZSCORE', key, member) then
        redis.call('ZADD', key, now, member)
        redis.call('PEXPIRE', key, ttl)
        return 1
      end

      if redis.call('ZCARD', key) >= limit then
        return 0
      end

      redis.call('ZADD', key, now, member)
      redis.call('PEXPIRE', key, ttl)
      return 1
    `,
    1,
    GLOBAL_RUNNING_KEY,
    taskId,
    String(limit),
    String(GLOBAL_RUNNING_SLOT_TTL_MS),
    String(Date.now()),
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

function startGlobalExecutionSlotHeartbeat(taskId: string) {
  const interval = setInterval(() => {
    const now = Date.now();

    void workerConnection
      .eval(
        `
          local key = KEYS[1]
          local member = ARGV[1]
          local ttl = tonumber(ARGV[2])
          local now = tonumber(ARGV[3])
          local expiresAt = now - ttl

          redis.call('ZREMRANGEBYSCORE', key, '-inf', expiresAt)

          if redis.call('ZSCORE', key, member) then
            redis.call('ZADD', key, now, member)
            redis.call('PEXPIRE', key, ttl)
          end

          return 1
        `,
        1,
        GLOBAL_RUNNING_KEY,
        taskId,
        String(GLOBAL_RUNNING_SLOT_TTL_MS),
        String(now),
      )
      .catch(() => undefined);
  }, GLOBAL_RUNNING_SLOT_RENEW_INTERVAL_MS);

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

async function releaseGlobalExecutionSlot(taskId: string) {
  await workerConnection.eval(
    `
      local key = KEYS[1]
      local member = ARGV[1]
      local ttl = tonumber(ARGV[2])

      redis.call('ZREM', key, member)

      if redis.call('ZCARD', key) == 0 then
        redis.call('DEL', key)
        return 0
      end

      redis.call('PEXPIRE', key, ttl)
      return 1
    `,
    1,
    GLOBAL_RUNNING_KEY,
    taskId,
    String(GLOBAL_RUNNING_SLOT_TTL_MS),
  );
}

function resolveTemplateValue(
  value: string,
  runtimeInputs: Record<string, string>,
  variables: Record<string, string>,
  credentials: Record<string, Record<string, string>>,
  preserveUnknown = false,
) {
  return value.replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
    (match, expression: string) => {
      const [scope, key, ...rest] = expression.split('.');

      if (scope === 'inputs' && key) {
        return runtimeInputs[key] ?? '';
      }

      if (scope === 'variables' && key) {
        return variables[key] ?? '';
      }

      if (scope === 'credentials' && key && rest.length > 0) {
        return credentials[key]?.[rest.join('.')] ?? '';
      }

      return preserveUnknown ? match : '';
    },
  );
}

function resolveNumberValue(
  value: unknown,
  fallback: number,
  runtimeInputs: Record<string, string>,
  variables: Record<string, string>,
  credentials: Record<string, Record<string, string>>,
) {
  const resolved = resolveTemplateValue(
    String(value ?? fallback),
    runtimeInputs,
    variables,
    credentials,
  );
  const parsed = Number(resolved);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeComparableValue(value: string) {
  return value.trim();
}

async function readExtractedValue(
  locator: Locator,
  property: 'text' | 'html' | 'href' | 'src' | 'value' | 'attribute',
  attributeName?: string,
) {
  if (property === 'html') {
    return locator.evaluate((element) => element.innerHTML);
  }

  if (property === 'href') {
    return (await locator.getAttribute('href')) ?? '';
  }

  if (property === 'src') {
    return (await locator.getAttribute('src')) ?? '';
  }

  if (property === 'value') {
    return locator
      .inputValue()
      .catch(async () => (await locator.getAttribute('value')) ?? '');
  }

  if (property === 'attribute') {
    if (!attributeName) {
      throw new Error('提取节点在 property=attribute 时必须填写属性名。');
    }

    return (await locator.getAttribute(attributeName)) ?? '';
  }

  return locator.innerText();
}

async function readExtractedValues(
  locator: Locator,
  property: 'text' | 'html' | 'href' | 'src' | 'value' | 'attribute',
  attributeName?: string,
) {
  if (property === 'attribute' && !attributeName) {
    throw new Error('提取节点在 property=attribute 时必须填写属性名。');
  }

  return locator.evaluateAll(
    (elements, options) =>
      elements.map((element) => {
        if (options.property === 'html') {
          return element.innerHTML ?? '';
        }

        if (options.property === 'href') {
          return element.getAttribute('href') ?? '';
        }

        if (options.property === 'src') {
          return element.getAttribute('src') ?? '';
        }

        if (options.property === 'value') {
          if (
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement
          ) {
            return element.value ?? '';
          }

          return element.getAttribute('value') ?? '';
        }

        if (options.property === 'attribute') {
          return element.getAttribute(options.attributeName ?? '') ?? '';
        }

        if (element instanceof HTMLElement) {
          return element.innerText ?? element.textContent ?? '';
        }

        return element.textContent ?? '';
      }),
    { property, attributeName },
  );
}

function createExtractPreview(value: string | string[] | number) {
  if (typeof value === 'number') {
    return `共 ${value} 项`;
  }

  const raw =
    typeof value === 'string'
      ? value
      : value
          .slice(0, 3)
          .map((item) => item.trim())
          .join(' | ');

  const suffix =
    Array.isArray(value) && value.length > 3 ? ` ... (+${value.length - 3})` : '';
  const preview = `${raw}${suffix}`.trim();

  if (!preview) {
    return '[空结果]';
  }

  return preview.length > 160 ? `${preview.slice(0, 160)}...` : preview;
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
  credentials: Record<string, Record<string, string>>,
) {
  switch (node.type) {
    case 'open_page':
      return {
        ...node,
        url: resolveTemplateValue(node.url, runtimeInputs, variables, credentials),
      };
    case 'click':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables, credentials),
      };
    case 'input':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables, credentials),
        value: resolveTemplateValue(node.value, runtimeInputs, variables, credentials),
      };
    case 'hover':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables, credentials),
      };
    case 'press_key':
      return {
        ...node,
        key: resolveTemplateValue(node.key, runtimeInputs, variables, credentials),
      };
    case 'select_option':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables, credentials),
        value: resolveTemplateValue(node.value, runtimeInputs, variables, credentials),
      };
    case 'check':
    case 'uncheck':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables, credentials),
      };
    case 'set_variable':
      return {
        ...node,
        key: resolveTemplateValue(node.key, runtimeInputs, variables, credentials),
        value: resolveTemplateValue(node.value, runtimeInputs, variables, credentials),
      };
    case 'condition':
      return {
        ...node,
        left: resolveTemplateValue(node.left, runtimeInputs, variables, credentials),
        right: resolveTemplateValue(String(node.right ?? ''), runtimeInputs, variables, credentials),
        operator: resolveTemplateValue(
          String(node.operator ?? 'equals'),
          runtimeInputs,
          variables,
          credentials,
        ) as
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
        time: resolveNumberValue(
          node.time ?? node.duration,
          1000,
          runtimeInputs,
          variables,
          credentials,
        ),
      };
    case 'wait_for_element':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables, credentials),
        state: resolveTemplateValue(
          String(node.state ?? 'visible'),
          runtimeInputs,
          variables,
          credentials,
        ) as 'attached' | 'detached' | 'visible' | 'hidden',
        timeout: resolveNumberValue(node.timeout, 10000, runtimeInputs, variables, credentials),
      };
    case 'wait_for_text':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables, credentials),
        text: resolveTemplateValue(node.text, runtimeInputs, variables, credentials),
        matchMode: resolveTemplateValue(
          String(node.matchMode ?? 'contains'),
          runtimeInputs,
          variables,
          credentials,
        ) as 'contains' | 'equals' | 'not_contains' | 'not_equals' | 'not_empty',
        timeout: resolveNumberValue(node.timeout, 10000, runtimeInputs, variables, credentials),
      };
    case 'wait_for_class':
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables, credentials),
        className: resolveTemplateValue(node.className, runtimeInputs, variables, credentials),
        condition: resolveTemplateValue(
          String(node.condition ?? 'contains'),
          runtimeInputs,
          variables,
          credentials,
        ) as 'contains' | 'not_contains',
        timeout: resolveNumberValue(node.timeout, 10000, runtimeInputs, variables, credentials),
      };
    case 'wait_for_url':
      return {
        ...node,
        urlIncludes: resolveTemplateValue(
          String(node.urlIncludes ?? ''),
          runtimeInputs,
          variables,
          credentials,
        ),
        waitUntil: resolveTemplateValue(
          String(node.waitUntil ?? 'load'),
          runtimeInputs,
          variables,
          credentials,
        ) as 'load' | 'domcontentloaded' | 'networkidle' | 'commit',
        timeout: resolveNumberValue(node.timeout, 10000, runtimeInputs, variables, credentials),
      };
    case 'switch_iframe':
      return {
        ...node,
        selector: resolveTemplateValue(
          String(node.selector ?? ''),
          runtimeInputs,
          variables,
          credentials,
        ),
        name: resolveTemplateValue(String(node.name ?? ''), runtimeInputs, variables, credentials),
        urlIncludes: resolveTemplateValue(
          String(node.urlIncludes ?? ''),
          runtimeInputs,
          variables,
          credentials,
        ),
        timeout: resolveNumberValue(node.timeout, 10000, runtimeInputs, variables, credentials),
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
          credentials,
        ) as 'down' | 'up' | 'bottom' | 'top',
        distance: resolveNumberValue(node.distance, 500, runtimeInputs, variables, credentials),
      };
    case 'extract':
      const saveKey = resolveTemplateValue(
        String(node.saveKey ?? node.saveAs ?? ''),
        runtimeInputs,
        variables,
        credentials,
      );
      return {
        ...node,
        selector: resolveTemplateValue(node.selector, runtimeInputs, variables, credentials),
        property: resolveTemplateValue(
          String(node.property ?? 'text'),
          runtimeInputs,
          variables,
          credentials,
        ) as 'text' | 'html' | 'href' | 'src' | 'value' | 'attribute',
        attributeName: resolveTemplateValue(
          String(node.attributeName ?? ''),
          runtimeInputs,
          variables,
          credentials,
        ),
        targetMode: resolveTemplateValue(
          String(node.targetMode ?? 'first'),
          runtimeInputs,
          variables,
          credentials,
        ) as 'first' | 'all' | 'count',
        resultFormat: resolveTemplateValue(
          String(node.resultFormat ?? 'json_array'),
          runtimeInputs,
          variables,
          credentials,
        ) as 'json_array' | 'join',
        joinWith: resolveTemplateValue(
          String(node.joinWith ?? ', '),
          runtimeInputs,
          variables,
          credentials,
        ),
        saveTarget: resolveTemplateValue(
          String(node.saveTarget ?? (saveKey ? 'both' : 'task_output')),
          runtimeInputs,
          variables,
          credentials,
        ) as 'variable' | 'task_output' | 'both',
        saveKey,
        saveAs: resolveTemplateValue(
          String(node.saveAs ?? saveKey),
          runtimeInputs,
          variables,
          credentials,
        ),
      };
    case 'screenshot':
      return {
        ...node,
        scope: resolveTemplateValue(
          String(node.scope ?? 'viewport'),
          runtimeInputs,
          variables,
          credentials,
        ) as 'viewport' | 'full' | 'element',
        selector: resolveTemplateValue(
          String(node.selector ?? ''),
          runtimeInputs,
          variables,
          credentials,
        ),
      };
    case 'save_data':
      return {
        ...node,
        collectionKey: resolveTemplateValue(
          String(node.collectionKey ?? ''),
          runtimeInputs,
          variables,
          credentials,
        ),
        collectionName: resolveTemplateValue(
          String(node.collectionName ?? ''),
          runtimeInputs,
          variables,
          credentials,
        ),
        recordMode: resolveTemplateValue(
          String(node.recordMode ?? 'single'),
          runtimeInputs,
          variables,
          credentials,
        ) as 'single' | 'array',
        sourceVariable: resolveTemplateValue(
          String(node.sourceVariable ?? ''),
          runtimeInputs,
          variables,
          credentials,
        ),
        writeMode: resolveTemplateValue(
          String(node.writeMode ?? 'upsert'),
          runtimeInputs,
          variables,
          credentials,
        ) as 'insert' | 'upsert' | 'skip_duplicates',
        recordKeyTemplate: resolveTemplateValue(
          String(node.recordKeyTemplate ?? ''),
          runtimeInputs,
          variables,
          credentials,
          true,
        ),
        fieldMappings: resolveTemplateValue(
          String(node.fieldMappings ?? ''),
          runtimeInputs,
          variables,
          credentials,
          true,
        ),
        resultVariable: resolveTemplateValue(
          String(node.resultVariable ?? ''),
          runtimeInputs,
          variables,
          credentials,
        ),
      };
    default:
      return node;
  }
}

function getActiveTarget(executionContext: ExecutionContext) {
  return executionContext.activeFrame ?? executionContext.page;
}

async function findFrame(
  taskId: string,
  executionContext: ExecutionContext,
  node: Extract<WorkflowNode, { type: 'switch_iframe' }>,
) {
  const { page } = executionContext;
  const timeout = Number(node.timeout ?? 10000);
  const target = getActiveTarget(executionContext);

  if (node.selector) {
    const iframeLocator = target.locator(node.selector).first();
    await runCancellable(taskId, () =>
      iframeLocator.waitFor({ state: 'attached', timeout }),
    );
    const handle = await iframeLocator.elementHandle();
    const frame = await handle?.contentFrame();

    if (frame) {
      return frame;
    }
  }

  const deadline = Date.now() + timeout;

  while (Date.now() <= deadline) {
    await ensureTaskNotCancelled(taskId);
    const frame = page.frames().find((candidate) => {
      const nameMatched = node.name ? candidate.name() === node.name : false;
      const urlMatched = node.urlIncludes ? candidate.url().includes(node.urlIncludes) : false;
      return nameMatched || urlMatched;
    });

    if (frame) {
      return frame;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('未找到匹配的 iframe，请检查选择器、name 或 URL 包含条件。');
}

async function runCancellable<T>(
  taskId: string,
  action: () => Promise<T>,
): Promise<T> {
  let settled = false;

  const actionPromise = action()
    .then((result) => {
      settled = true;
      return result;
    })
    .catch((error) => {
      settled = true;
      throw error;
    });

  const cancellationPromise = (async () => {
    while (true) {
      await ensureTaskNotCancelled(taskId);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  })();

  try {
    return await Promise.race([actionPromise, cancellationPromise]);
  } finally {
    if (!settled) {
      void actionPromise.catch(() => undefined);
    }
  }
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
      await publishLog(taskId, `正在打开页面：${node.url}`, 'info', node.clientNodeId);
      executionContext.activeFrame = null;
      await runCancellable(taskId, () =>
        page.goto(node.url, { waitUntil: 'domcontentloaded' }),
      );
      await publishLog(taskId, '页面已开始加载，并已切回主文档上下文。', 'success', node.clientNodeId);
      return;
    case 'click':
      await publishLog(taskId, `正在点击元素：${node.selector}`, 'info', node.clientNodeId);
      await runCancellable(taskId, () =>
        target.locator(node.selector).first().click(),
      );
      await publishLog(taskId, `点击完成：${node.selector}`, 'success', node.clientNodeId);
      return;
    case 'input':
      await publishLog(taskId, `正在向 ${node.selector} 输入内容。`, 'info', node.clientNodeId);
      await runCancellable(taskId, () =>
        target.locator(node.selector).first().fill(node.value),
      );
      await publishLog(
        taskId,
        `输入完成：${node.selector} <- ${node.value ? '已写入值' : '空字符串'}`,
        'success',
        node.clientNodeId,
      );
      return;
    case 'hover':
      await publishLog(taskId, `正在悬停元素：${node.selector}`, 'info', node.clientNodeId);
      await runCancellable(taskId, () =>
        target.locator(node.selector).first().hover(),
      );
      await publishLog(taskId, `悬停完成：${node.selector}`, 'success', node.clientNodeId);
      return;
    case 'press_key':
      await publishLog(taskId, `正在按下键盘按键：${node.key}`, 'info', node.clientNodeId);
      await page.keyboard.press(node.key);
      await publishLog(taskId, `按键已发送：${node.key}`, 'success', node.clientNodeId);
      return;
    case 'select_option':
      await publishLog(
        taskId,
        `正在选择下拉项：${node.selector} -> ${node.value}`,
        'info',
        node.clientNodeId,
      );
      await runCancellable(taskId, () =>
        target.locator(node.selector).first().selectOption({ value: node.value }),
      );
      await publishLog(taskId, `下拉项已选择：${node.value}`, 'success', node.clientNodeId);
      return;
    case 'check':
      await publishLog(taskId, `正在勾选：${node.selector}`, 'info', node.clientNodeId);
      await runCancellable(taskId, () =>
        target.locator(node.selector).first().check(),
      );
      await publishLog(taskId, `勾选完成：${node.selector}`, 'success', node.clientNodeId);
      return;
    case 'uncheck':
      await publishLog(taskId, `正在取消勾选：${node.selector}`, 'info', node.clientNodeId);
      await runCancellable(taskId, () =>
        target.locator(node.selector).first().uncheck(),
      );
      await publishLog(taskId, `取消勾选完成：${node.selector}`, 'success', node.clientNodeId);
      return;
    case 'set_variable':
      executionContext.variables[node.key] = node.value;
      await publishLog(
        taskId,
        `变量已写入：${node.key} = ${node.value || '空字符串'}`,
        'success',
        node.clientNodeId,
      );
      return;
    case 'condition': {
      const matched = compareCondition(node.left, node.operator ?? 'equals', String(node.right ?? ''));
      await publishLog(
        taskId,
        `条件判断结果：${node.left} ${node.operator ?? 'equals'} ${
          String(node.right ?? '') || '(空)'
        } => ${matched ? '满足' : '不满足'}`,
        matched ? 'success' : 'warn',
        node.clientNodeId,
      );
      return { branch: matched ? 'true' : 'false' };
    }
    case 'wait': {
      const duration = Number(node.time ?? node.duration ?? 1000);
      await publishLog(taskId, `固定等待 ${duration}ms。`, 'info', node.clientNodeId);

      let remaining = duration;
      while (remaining > 0) {
        await ensureTaskNotCancelled(taskId);
        const slice = Math.min(remaining, 200);
        await page.waitForTimeout(slice);
        remaining -= slice;
      }

      await publishLog(taskId, `固定等待结束，共等待 ${duration}ms。`, 'success', node.clientNodeId);
      return;
    }
    case 'wait_for_element': {
      const timeout = Number(node.timeout ?? 10000);
      const state = node.state ?? 'visible';
      const stateLabel =
        state === 'visible'
          ? '可见'
          : state === 'attached'
            ? '已挂载到 DOM'
            : state === 'hidden'
              ? '已隐藏'
              : '已从 DOM 移除';
      await publishLog(
        taskId,
        `等待元素状态：${node.selector} -> ${stateLabel}，超时 ${timeout}ms。`,
        'info',
        node.clientNodeId,
      );
      await runCancellable(taskId, () =>
        target.locator(node.selector).first().waitFor({ state, timeout }),
      );
      await publishLog(
        taskId,
        `元素状态已满足：${node.selector} -> ${stateLabel}`,
        'success',
        node.clientNodeId,
      );
      return;
    }
    case 'wait_for_text': {
      const timeout = Number(node.timeout ?? 10000);
      const matchMode = node.matchMode ?? 'contains';
      const deadline = Date.now() + timeout;
      const locator = target.locator(node.selector);
      const conditionText =
        matchMode === 'equals'
          ? `文本完全等于“${node.text}”`
          : matchMode === 'not_contains'
            ? `文本不包含“${node.text}”`
            : matchMode === 'not_equals'
              ? `文本不等于“${node.text}”`
              : matchMode === 'not_empty'
                ? '文本变为非空'
                : `文本包含“${node.text}”`;

      await publishLog(
        taskId,
        `等待文本条件：${node.selector}，要求 ${conditionText}，超时 ${timeout}ms。`,
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
                : matchMode === 'not_empty'
                  ? 'not_empty'
                  : 'contains',
          matchMode === 'not_empty' ? '' : node.text,
        );

        if (matched) {
          await publishLog(
            taskId,
            `文本条件已满足，当前文本：${textContent || '(空)'}`,
            'success',
            node.clientNodeId,
          );
          return;
        }

        await page.waitForTimeout(200);
      }

      throw new Error(`等待文本超时：${node.selector} 未在 ${timeout}ms 内满足“${conditionText}”。`);
    }
    case 'wait_for_class': {
      const timeout = Number(node.timeout ?? 10000);
      const deadline = Date.now() + timeout;
      const locator = target.locator(node.selector).first();
      const condition = node.condition ?? 'contains';

      await publishLog(
        taskId,
        `等待 class 条件：${node.selector} ${
          condition === 'contains' ? `包含 ${node.className}` : `不包含 ${node.className}`
        }，超时 ${timeout}ms。`,
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
            `class 条件已满足，当前 class：${classValue || '(无)'}`,
            'success',
            node.clientNodeId,
          );
          return;
        }

        await page.waitForTimeout(200);
      }

      throw new Error(
        `等待 class 超时：${node.selector} 未在 ${timeout}ms 内满足 ${condition} ${node.className}。`,
      );
    }
    case 'wait_for_url': {
      const timeout = Number(node.timeout ?? 10000);
      const waitUntil = node.waitUntil ?? 'load';
      const urlIncludes = node.urlIncludes?.trim();
      await publishLog(
        taskId,
        urlIncludes
          ? `等待地址变化：URL 包含“${urlIncludes}”，等待阶段 ${waitUntil}，超时 ${timeout}ms。`
          : `等待页面加载状态：${waitUntil}，超时 ${timeout}ms。`,
        'info',
        node.clientNodeId,
      );

      if (urlIncludes) {
        await runCancellable(taskId, () =>
          page.waitForURL((url) => url.toString().includes(urlIncludes), { timeout, waitUntil }),
        );
      } else if (waitUntil === 'commit') {
        await runCancellable(taskId, () =>
          page.waitForURL(() => true, { timeout, waitUntil: 'commit' }),
        );
      } else {
        await runCancellable(taskId, () =>
          page.waitForLoadState(waitUntil, { timeout }),
        );
      }

      executionContext.activeFrame = null;
      await publishLog(taskId, 'URL 条件已满足，已切回主文档上下文。', 'success', node.clientNodeId);
      return;
    }
    case 'switch_iframe': {
      const frame = await findFrame(taskId, executionContext, node);
      executionContext.activeFrame = frame;
      await publishLog(
        taskId,
        `已切换到 iframe${frame.name() ? `：${frame.name()}` : ''}${frame.url() ? `，URL：${frame.url()}` : ''}`,
        'success',
        node.clientNodeId,
      );
      return;
    }
    case 'switch_main_frame':
      executionContext.activeFrame = null;
      await publishLog(taskId, '已切回主文档。', 'success', node.clientNodeId);
      return;
    case 'scroll': {
      const direction = node.direction ?? 'down';
      const distance = Number(node.distance ?? 500);
      const directionLabel =
        direction === 'bottom'
          ? '滚动到底部'
          : direction === 'top'
            ? '滚动到顶部'
            : direction === 'up'
              ? `向上滚动 ${distance}px`
              : `向下滚动 ${distance}px`;
      await publishLog(taskId, `正在执行滚动：${directionLabel}`, 'info', node.clientNodeId);

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
      await publishLog(taskId, `滚动完成：${directionLabel}`, 'success', node.clientNodeId);
      return;
    }
    case 'extract': {
      const property = node.property ?? 'text';
      const targetMode = node.targetMode ?? 'first';
      const resultFormat = node.resultFormat ?? 'json_array';
      const joinWith = node.joinWith ?? ', ';
      const saveKey = (node.saveKey ?? node.saveAs ?? '').trim();
      const saveTarget = node.saveTarget ?? (saveKey ? 'both' : 'task_output');
      const locator = target.locator(node.selector);
      const firstLocator = locator.first();
      if ((saveTarget === 'variable' || saveTarget === 'both') && !saveKey) {
        throw new Error('提取节点保存到变量时必须填写保存键名。');
      }
      await publishLog(
        taskId,
        `正在提取数据：${node.selector} -> ${property} (${targetMode})`,
        'info',
        node.clientNodeId,
      );
      if (targetMode === 'count') {
        const itemCount = await runCancellable(taskId, () => locator.count());
        const preview = createExtractPreview(itemCount);
        await publishExtract(taskId, {
          selector: node.selector,
          property,
          targetMode,
          saveTarget,
          saveKey: saveKey || undefined,
          itemCount,
          value: itemCount,
          preview,
          nodeId: node.clientNodeId,
          timestamp: new Date().toISOString(),
        });

        if (saveTarget === 'variable' || saveTarget === 'both') {
          executionContext.variables[saveKey] = String(itemCount);
          await publishLog(
            taskId,
            `提取结果已写入变量：${saveKey}`,
            'success',
            node.clientNodeId,
          );
        }

        await publishLog(
          taskId,
          `提取完成，预览：${preview}`,
          'success',
          node.clientNodeId,
        );
        return;
      }

      if (targetMode === 'all') {
        await runCancellable(taskId, () =>
          firstLocator.waitFor({ state: 'visible', timeout: 5000 }),
        );

        const extractedValues = await runCancellable(taskId, () =>
          readExtractedValues(locator, property, node.attributeName),
        );
        const itemCount = extractedValues.length;
        const eventValue =
          resultFormat === 'join' ? extractedValues.join(joinWith) : extractedValues;
        const variableValue =
          resultFormat === 'join'
            ? extractedValues.join(joinWith)
            : JSON.stringify(extractedValues);
        const preview = createExtractPreview(eventValue);

        await publishExtract(taskId, {
          selector: node.selector,
          property,
          targetMode,
          resultFormat,
          saveTarget,
          saveKey: saveKey || undefined,
          itemCount,
          value: eventValue,
          preview,
          nodeId: node.clientNodeId,
          timestamp: new Date().toISOString(),
        });

        if (saveTarget === 'variable' || saveTarget === 'both') {
          executionContext.variables[saveKey] = variableValue;
          await publishLog(
            taskId,
            `提取结果已写入变量：${saveKey}`,
            'success',
            node.clientNodeId,
          );
        }

        await publishLog(
          taskId,
          `提取完成，预览：${preview}`,
          'success',
          node.clientNodeId,
        );
        return;
      }

      await runCancellable(taskId, () =>
        firstLocator.waitFor({ state: 'visible', timeout: 5000 }),
      );

      let extractedValue = '';

      if (property === 'html') {
        extractedValue = await firstLocator.evaluate((element) => element.innerHTML);
      } else if (property === 'href') {
        extractedValue = (await firstLocator.getAttribute('href')) ?? '';
      } else if (property === 'src') {
        extractedValue = (await firstLocator.getAttribute('src')) ?? '';
      } else if (property === 'value') {
        extractedValue = await firstLocator
          .inputValue()
          .catch(async () => (await firstLocator.getAttribute('value')) ?? '');
      } else if (property === 'attribute') {
        if (!node.attributeName) {
          throw new Error('提取节点在 property=attribute 时必须填写属性名。');
        }

        extractedValue = (await firstLocator.getAttribute(node.attributeName)) ?? '';
      } else {
        extractedValue = await firstLocator.innerText();
      }

      const preview = createExtractPreview(extractedValue);
      await publishExtract(taskId, {
        selector: node.selector,
        property,
        targetMode,
        saveTarget,
        saveKey: saveKey || undefined,
        itemCount: extractedValue ? 1 : 0,
        value: extractedValue,
        preview,
        nodeId: node.clientNodeId,
        timestamp: new Date().toISOString(),
      });

      if (saveTarget === 'variable' || saveTarget === 'both') {
        executionContext.variables[saveKey] = extractedValue;
        await publishLog(
          taskId,
          `提取结果已写入变量：${saveKey}`,
          'success',
          node.clientNodeId,
        );
      }

      await publishLog(
        taskId,
        `提取完成，预览：${preview}`,
        'success',
        node.clientNodeId,
      );
      return;
    }
    case 'save_data': {
      await executeSaveDataNode(node, {
        prisma,
        taskId,
        workflowId: executionContext.workflowId,
        ownerId: executionContext.ownerId,
        runtimeInputs: executionContext.runtimeInputs,
        variables: executionContext.variables,
        credentials: executionContext.credentials,
        publishLog,
        publishDataWrite,
      });
      return;
    }
    case 'screenshot': {
      const scope = node.scope ?? 'viewport';
      await publishLog(
        taskId,
        scope === 'element'
          ? `正在截图指定元素：${node.selector || '(未填写选择器)'}`
          : `正在截图：${scope === 'full' ? '整页' : '当前视口'}`,
        'info',
        node.clientNodeId,
      );

      let buffer: Buffer;

      if (scope === 'element') {
        if (!node.selector) {
          throw new Error('截图节点在 scope=element 时必须填写元素选择器。');
        }

        buffer = await runCancellable(taskId, () =>
          target.locator(node.selector ?? '').first().screenshot({ type: 'jpeg', quality: 75 }),
        );
      } else {
        buffer = await runCancellable(taskId, () =>
          page.screenshot({ type: 'jpeg', quality: 75, fullPage: scope === 'full' }),
        );
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

      await publishLog(taskId, '截图已推送到前端。', 'success', node.clientNodeId);
      return;
    }
    default:
      throw new Error(`暂不支持的工作流节点：${(node as WorkflowNode).type}`);
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
      const resolvedNode = resolveNode(
        node,
        runtimeInputs,
        executionContext.variables,
        executionContext.credentials,
      );
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
  const runtimeCredentials = job.data.credentials ?? {};
  const taskIdentity = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      workflowId: true,
      ownerId: true,
    },
  });

  if (!taskIdentity) {
    throw new Error(`Task ${taskId} not found`);
  }

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
    runtimeInputs,
    variables: {},
    credentials: runtimeCredentials,
    tempDir: runtimeOptions.tempDir,
    workflowId: taskIdentity.workflowId,
    ownerId: taskIdentity.ownerId,
  };
  const stopScreenshotStream = startScreenshotStream(
    taskId,
    page,
    runtimeOptions.screenshotIntervalMs,
    runtimeOptions.tempDir,
    publishScreenshot,
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
      `任务开始执行，共 ${workflow.nodes.length} 个节点，运行参数 ${Object.keys(runtimeInputs).length} 项，绑定凭据 ${Object.keys(runtimeCredentials).length} 项，优先级 ${job.data.priority}。`,
    );

    await executeWorkflow(taskId, workflow, executionContext, runtimeInputs);

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'success', completedAt: new Date() },
    });

    await publishLog(
      taskId,
      `任务执行完成，共生成 ${Object.keys(executionContext.variables).length} 个变量。`,
      'success',
    );
    await publishStatus(taskId, 'success');
  } catch (error) {
    const cancellationRequested = await isTaskCancellationRequested(taskId);

    if (error instanceof TaskCancelledError || cancellationRequested) {
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'cancelled',
          completedAt: new Date(),
          errorMessage: '任务已由用户取消。',
          cancelRequestedAt: new Date(),
        },
      });

      await publishLog(taskId, '任务已取消。', 'warn');
      await publishStatus(taskId, 'cancelled');
      return;
    }

    const message = error instanceof Error ? error.message : '未知执行错误';

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'failed', completedAt: new Date(), errorMessage: message },
    });

    await publishLog(taskId, `任务执行失败：${message}`, 'error');
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
      const userSlotAcquired = await tryAcquireUserExecutionSlot(
        ownerId,
        runtimePolicy.perUserTaskConcurrency,
      );

      if (!userSlotAcquired) {
        await publishLog(
          taskId,
          `Per-user concurrency limit reached (${runtimePolicy.perUserTaskConcurrency}), retrying in ${USER_RUNNING_SLOT_RETRY_DELAY_MS}ms.`,
          'warn',
        );
        await job.moveToDelayed(Date.now() + USER_RUNNING_SLOT_RETRY_DELAY_MS, token);
        throw new DelayedError();
      }

      const globalSlotAcquired = await tryAcquireGlobalExecutionSlot(
        taskId,
        runtimePolicy.globalTaskConcurrency,
      );

      if (!globalSlotAcquired) {
        await releaseUserExecutionSlot(ownerId).catch(() => undefined);
        await publishLog(
          taskId,
          `Global concurrency limit reached (${runtimePolicy.globalTaskConcurrency}), retrying in ${GLOBAL_RUNNING_SLOT_RETRY_DELAY_MS}ms.`,
          'warn',
        );
        await job.moveToDelayed(Date.now() + GLOBAL_RUNNING_SLOT_RETRY_DELAY_MS, token);
        throw new DelayedError();
      }

      const stopUserSlotHeartbeat = startUserExecutionSlotHeartbeat(ownerId);
      const stopGlobalSlotHeartbeat = startGlobalExecutionSlotHeartbeat(taskId);
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
        stopUserSlotHeartbeat();
        stopGlobalSlotHeartbeat();
        await releaseUserExecutionSlot(ownerId).catch(() => undefined);
        await releaseGlobalExecutionSlot(taskId).catch(() => undefined);
      }
    },
    {
      connection: workerConnection,
      prefix: redisConfig.bullPrefix,
      concurrency: workerConcurrency,
    },
  );

  workerInstance.on('ready', () => {
    console.log(
      `[worker] CloudFlow worker is ready (local concurrency ${workerConcurrency}, cluster-wide limit enforced via Redis)`,
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
  await closeBrowser().catch(() => undefined);

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
