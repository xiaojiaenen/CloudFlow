export type SupportedWorkflowNodeType =
  | 'open_page'
  | 'click'
  | 'input'
  | 'wait'
  | 'scroll'
  | 'extract'
  | 'screenshot';

export interface WorkflowCanvasNode {
  id: string;
  type?: string;
  position: {
    x: number;
    y: number;
  };
  data: Record<string, unknown>;
}

export interface WorkflowCanvasEdge {
  id: string;
  source: string;
  target: string;
}

export interface BaseWorkflowNode {
  type: SupportedWorkflowNodeType;
  clientNodeId?: string;
}

export interface OpenPageNode extends BaseWorkflowNode {
  type: 'open_page';
  url: string;
}

export interface ClickNode extends BaseWorkflowNode {
  type: 'click';
  selector: string;
}

export interface InputNode extends BaseWorkflowNode {
  type: 'input';
  selector: string;
  value: string;
}

export interface WaitNode extends BaseWorkflowNode {
  type: 'wait';
  time?: number;
  duration?: number;
}

export interface ScrollNode extends BaseWorkflowNode {
  type: 'scroll';
  direction?: 'down' | 'up' | 'bottom' | 'top';
  distance?: number;
}

export interface ExtractNode extends BaseWorkflowNode {
  type: 'extract';
  selector: string;
  property?: 'text' | 'html' | 'href' | 'src';
}

export interface ScreenshotNode extends BaseWorkflowNode {
  type: 'screenshot';
  scope?: 'viewport' | 'full';
}

export type WorkflowNode = OpenPageNode | ClickNode | InputNode | WaitNode | ScrollNode | ExtractNode | ScreenshotNode;

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  canvas?: {
    nodes: WorkflowCanvasNode[];
    edges: WorkflowCanvasEdge[];
  };
}
