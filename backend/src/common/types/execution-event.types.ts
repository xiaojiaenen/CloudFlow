import { WorkflowDefinition } from './workflow.types';

export type TaskLogLevel = 'info' | 'warn' | 'error' | 'success';
export type ExecutionEventType = 'log' | 'screenshot' | 'status';
export type TaskExecutionStatus = 'pending' | 'running' | 'success' | 'failed';

export interface TaskLogPayload {
  message: string;
  level: TaskLogLevel;
  timestamp: string;
}

export interface TaskScreenshotPayload {
  imageBase64: string;
  mimeType: string;
  timestamp: string;
}

export interface TaskStatusPayload {
  status: TaskExecutionStatus;
  errorMessage?: string;
  timestamp: string;
}

export interface TaskExecutionEvent {
  taskId: string;
  type: ExecutionEventType;
  data: TaskLogPayload | TaskScreenshotPayload | TaskStatusPayload;
}

export interface TaskQueuePayload {
  taskId: string;
  workflow: WorkflowDefinition;
}
