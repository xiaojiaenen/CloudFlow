import { WorkflowDefinition } from './workflow.types';

export type TaskLogLevel = 'info' | 'warn' | 'error' | 'success';
export type ExecutionEventType = 'log' | 'screenshot' | 'status' | 'extract';
export type TaskExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

export interface TaskLogPayload {
  message: string;
  level: TaskLogLevel;
  timestamp: string;
  nodeId?: string;
}

export interface TaskScreenshotPayload {
  imageBase64: string;
  mimeType: string;
  source?: 'stream' | 'node';
  timestamp: string;
}

export interface TaskStatusPayload {
  status: TaskExecutionStatus;
  errorMessage?: string;
  timestamp: string;
}

export interface TaskExtractPayload {
  selector: string;
  property: string;
  value: string;
  preview: string;
  nodeId?: string;
  timestamp: string;
}

export interface TaskExecutionEvent {
  taskId: string;
  type: ExecutionEventType;
  data:
    | TaskLogPayload
    | TaskScreenshotPayload
    | TaskStatusPayload
    | TaskExtractPayload;
}

export interface TaskQueuePayload {
  taskId: string;
  workflow: WorkflowDefinition;
}
