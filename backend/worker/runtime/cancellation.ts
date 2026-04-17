import { BrowserContext } from 'playwright';
import { TASK_CANCEL_KEY_PREFIX } from '../../src/common/constants/redis.constants';

type TaskCancellationStore = {
  exists(key: string): Promise<number>;
  del(key: string): Promise<unknown>;
};

type TaskController = {
  cancelRequested: boolean;
  context?: BrowserContext;
};

export class TaskCancelledError extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} cancelled by user.`);
    this.name = 'TaskCancelledError';
  }
}

export function createTaskCancellationManager(store: TaskCancellationStore) {
  const taskControllers = new Map<string, TaskController>();

  function getCancellationKey(taskId: string) {
    return `${TASK_CANCEL_KEY_PREFIX}${taskId}`;
  }

  function getTaskController(taskId: string) {
    const existingController = taskControllers.get(taskId);

    if (existingController) {
      return existingController;
    }

    const controller: TaskController = {
      cancelRequested: false,
      context: undefined,
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

    const result = await store.exists(getCancellationKey(taskId));
    return result === 1;
  }

  async function ensureTaskNotCancelled(taskId: string) {
    if (await isTaskCancellationRequested(taskId)) {
      throw new TaskCancelledError(taskId);
    }
  }

  async function clearTaskCancellation(taskId: string) {
    taskControllers.delete(taskId);
    await store.del(getCancellationKey(taskId));
  }

  return {
    getCancellationKey,
    getTaskController,
    requestTaskCancellation,
    isTaskCancellationRequested,
    ensureTaskNotCancelled,
    clearTaskCancellation,
  };
}
