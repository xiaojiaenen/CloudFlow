export interface TaskElementPickerCandidate {
  selector: string;
  strategy: string;
  label: string;
  isUnique: boolean;
}

export interface TaskElementPickerRequest {
  requestId: string;
  taskId: string;
  xRatio: number;
  yRatio: number;
}

export interface TaskElementPickerResult {
  requestId: string;
  taskId: string;
  selector?: string;
  error?: string;
  tagName?: string;
  textPreview?: string;
  attributes?: Record<string, string>;
  candidates?: TaskElementPickerCandidate[];
  viewport?: {
    width: number;
    height: number;
  };
  point?: {
    x: number;
    y: number;
  };
}
