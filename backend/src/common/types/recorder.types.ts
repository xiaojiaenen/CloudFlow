import { WorkflowDefinition } from './workflow.types';

export type RecorderCommandType =
  | 'create'
  | 'navigate'
  | 'click'
  | 'input'
  | 'press_key'
  | 'scroll'
  | 'snapshot'
  | 'finish'
  | 'close';

export interface RecorderCommandPayload {
  requestId: string;
  sessionId: string;
  ownerId?: string;
  type: RecorderCommandType;
  url?: string;
  xRatio?: number;
  yRatio?: number;
  value?: string;
  key?: string;
  direction?: 'up' | 'down' | 'top' | 'bottom';
  distance?: number;
  name?: string;
}

export interface RecorderActionSummary {
  id: string;
  type:
    | 'open_page'
    | 'click'
    | 'input'
    | 'press_key'
    | 'scroll'
    | 'wait_for_url';
  label: string;
  selector?: string;
  value?: string;
  url?: string;
  direction?: 'up' | 'down' | 'top' | 'bottom';
  distance?: number;
}

export interface RecorderSessionSnapshot {
  sessionId: string;
  ownerId: string;
  pageUrl: string;
  imageBase64: string;
  mimeType: string;
  updatedAt: string;
  viewport: {
    width: number;
    height: number;
  };
  actionCount: number;
  actions: RecorderActionSummary[];
}

export interface RecorderCommandResult {
  ok: boolean;
  sessionId: string;
  pageUrl?: string;
  snapshot?: RecorderSessionSnapshot;
  action?: RecorderActionSummary;
  definition?: WorkflowDefinition;
  recommendedName?: string;
  error?: string;
}
