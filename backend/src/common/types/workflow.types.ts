export type SupportedWorkflowNodeType =
  | 'open_page'
  | 'click'
  | 'input'
  | 'hover'
  | 'press_key'
  | 'select_option'
  | 'check'
  | 'uncheck'
  | 'set_variable'
  | 'condition'
  | 'wait'
  | 'wait_for_element'
  | 'wait_for_text'
  | 'wait_for_class'
  | 'wait_for_url'
  | 'switch_iframe'
  | 'switch_main_frame'
  | 'scroll'
  | 'extract'
  | 'screenshot';

export type WorkflowInputFieldType =
  | 'text'
  | 'textarea'
  | 'password'
  | 'number'
  | 'select'
  | 'date'
  | 'email';

export type WorkflowCredentialRequirementType =
  | 'account'
  | 'api_key'
  | 'cookie'
  | 'smtp'
  | 'custom';

export interface WorkflowInputFieldOption {
  label: string;
  value: string;
}

export interface WorkflowInputField {
  key: string;
  label: string;
  type: WorkflowInputFieldType;
  required?: boolean;
  sensitive?: boolean;
  placeholder?: string;
  description?: string;
  defaultValue?: string;
  options?: WorkflowInputFieldOption[];
}

export interface WorkflowCredentialRequirement {
  key: string;
  label: string;
  type: WorkflowCredentialRequirementType;
  required?: boolean;
  provider?: string;
  description?: string;
}

export interface WorkflowRuntimeCredentialMeta {
  credentialId: string;
  credentialName: string;
  type: WorkflowCredentialRequirementType;
  provider?: string;
}

export interface WorkflowRuntimeContext {
  inputs?: Record<string, string>;
  maskedInputs?: Record<string, string>;
  credentialBindings?: Record<string, string>;
  maskedCredentials?: Record<string, Record<string, string>>;
  credentialMetadata?: Record<string, WorkflowRuntimeCredentialMeta>;
}

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
  sourceHandle?: string | null;
  targetHandle?: string | null;
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

export interface HoverNode extends BaseWorkflowNode {
  type: 'hover';
  selector: string;
}

export interface PressKeyNode extends BaseWorkflowNode {
  type: 'press_key';
  key: string;
}

export interface SelectOptionNode extends BaseWorkflowNode {
  type: 'select_option';
  selector: string;
  value: string;
}

export interface CheckNode extends BaseWorkflowNode {
  type: 'check';
  selector: string;
}

export interface UncheckNode extends BaseWorkflowNode {
  type: 'uncheck';
  selector: string;
}

export interface SetVariableNode extends BaseWorkflowNode {
  type: 'set_variable';
  key: string;
  value: string;
}

export interface ConditionNode extends BaseWorkflowNode {
  type: 'condition';
  left: string;
  operator?:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'greater_than'
    | 'less_than'
    | 'is_empty'
    | 'not_empty';
  right?: string;
}

export interface WaitNode extends BaseWorkflowNode {
  type: 'wait';
  time?: number;
  duration?: number;
}

export interface WaitForElementNode extends BaseWorkflowNode {
  type: 'wait_for_element';
  selector: string;
  state?: 'attached' | 'detached' | 'visible' | 'hidden';
  timeout?: number;
}

export interface WaitForTextNode extends BaseWorkflowNode {
  type: 'wait_for_text';
  selector: string;
  text: string;
  matchMode?: 'contains' | 'equals' | 'not_contains' | 'not_equals' | 'not_empty';
  timeout?: number;
}

export interface WaitForClassNode extends BaseWorkflowNode {
  type: 'wait_for_class';
  selector: string;
  className: string;
  condition?: 'contains' | 'not_contains';
  timeout?: number;
}

export interface WaitForUrlNode extends BaseWorkflowNode {
  type: 'wait_for_url';
  urlIncludes?: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  timeout?: number;
}

export interface SwitchIframeNode extends BaseWorkflowNode {
  type: 'switch_iframe';
  selector?: string;
  name?: string;
  urlIncludes?: string;
  timeout?: number;
}

export interface SwitchMainFrameNode extends BaseWorkflowNode {
  type: 'switch_main_frame';
}

export interface ScrollNode extends BaseWorkflowNode {
  type: 'scroll';
  direction?: 'down' | 'up' | 'bottom' | 'top';
  distance?: number;
}

export interface ExtractNode extends BaseWorkflowNode {
  type: 'extract';
  selector: string;
  property?: 'text' | 'html' | 'href' | 'src' | 'value' | 'attribute';
  attributeName?: string;
  saveAs?: string;
}

export interface ScreenshotNode extends BaseWorkflowNode {
  type: 'screenshot';
  scope?: 'viewport' | 'full' | 'element';
  selector?: string;
}

export type WorkflowNode =
  | OpenPageNode
  | ClickNode
  | InputNode
  | HoverNode
  | PressKeyNode
  | SelectOptionNode
  | CheckNode
  | UncheckNode
  | SetVariableNode
  | ConditionNode
  | WaitNode
  | WaitForElementNode
  | WaitForTextNode
  | WaitForClassNode
  | WaitForUrlNode
  | SwitchIframeNode
  | SwitchMainFrameNode
  | ScrollNode
  | ExtractNode
  | ScreenshotNode;

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  canvas?: {
    nodes: WorkflowCanvasNode[];
    edges: WorkflowCanvasEdge[];
  };
  inputSchema?: WorkflowInputField[];
  credentialRequirements?: WorkflowCredentialRequirement[];
  runtime?: WorkflowRuntimeContext;
}
