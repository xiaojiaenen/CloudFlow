import { TASK_EVENTS_CHANNEL } from '../../src/common/constants/redis.constants';
import {
  TaskExecutionEvent,
  TaskExecutionStatus,
  TaskExtractPayload,
  TaskLogLevel,
  TaskScreenshotPayload,
} from '../../src/common/types/execution-event.types';

type TaskEventPublisher = {
  publish(channel: string, message: string): Promise<unknown>;
};

export function createTaskEventPublisher(publisher: TaskEventPublisher) {
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

  async function publishStatus(
    taskId: string,
    status: TaskExecutionStatus,
    errorMessage?: string,
  ) {
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

  return {
    publishEvent,
    publishLog,
    publishStatus,
    publishScreenshot,
    publishExtract,
  };
}
