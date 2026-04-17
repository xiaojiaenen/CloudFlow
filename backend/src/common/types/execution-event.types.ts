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
  targetMode: 'first' | 'all' | 'count';
  resultFormat?: 'json_array' | 'join';
  saveTarget: 'variable' | 'task_output' | 'both';
  saveKey?: string;
  itemCount: number;
  value: string | string[] | number;
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
  ownerId: string;
  triggerSource: 'manual' | 'schedule';
  priority: number;
  workflow: WorkflowDefinition;
  inputs?: Record<string, string>;
  credentials?: Record<string, Record<string, string>>;
  credentialBindings?: Record<string, string>;
}
