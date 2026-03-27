export type SupportedWorkflowNodeType = 'open_page' | 'click' | 'input' | 'wait';

export interface BaseWorkflowNode {
  type: SupportedWorkflowNodeType;
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

export type WorkflowNode = OpenPageNode | ClickNode | InputNode | WaitNode;

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
}
