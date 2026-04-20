export type ExecutionNodeStatus = "idle" | "running" | "success" | "error" | "cancelled";
export type WorkflowStatus = "draft" | "active" | "archived";
export type WorkflowInputFieldType = "text" | "textarea" | "password" | "number" | "select" | "date" | "email";
export type WorkflowCredentialRequirementType = "account" | "api_key" | "cookie" | "smtp" | "custom";

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

export interface CredentialRecord {
  id: string;
  name: string;
  key: string;
  type: WorkflowCredentialRequirementType;
  provider?: string | null;
  description?: string | null;
  payload: Record<string, unknown>;
  maskedPayload?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface CredentialUpsertPayload {
  name: string;
  key: string;
  type: WorkflowCredentialRequirementType;
  provider?: string;
  description?: string;
  payload: Record<string, unknown>;
}

export interface CanvasNodeData {
  label: string;
  type: string;
  params: string;
  status?: ExecutionNodeStatus;
  [key: string]: unknown;
}

export interface SanitizedCanvasNode {
  id: string;
  type: string | undefined;
  position: {
    x: number;
    y: number;
  };
  data: CanvasNodeData;
}

export interface SanitizedCanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface WorkflowCanvasSnapshot {
  nodes: SanitizedCanvasNode[];
  edges: SanitizedCanvasEdge[];
}

export interface WorkflowApiDefinition {
  nodes: Array<Record<string, unknown>>;
  canvas?: WorkflowCanvasSnapshot;
  inputSchema?: WorkflowInputField[];
  credentialRequirements?: WorkflowCredentialRequirement[];
  runtime?: WorkflowRuntimeContext;
}

export interface WorkflowOwnerSummary {
  id: string;
  name: string;
  email: string;
}

export interface WorkflowRecord {
  id: string;
  name: string;
  description?: string | null;
  definition: WorkflowApiDefinition;
  status: WorkflowStatus;
  installedFromTemplateId?: string | null;
  scheduleEnabled?: boolean;
  scheduleCron?: string | null;
  scheduleTimezone?: string | null;
  alertEmail?: string | null;
  alertOnSuccess?: boolean;
  alertOnFailure?: boolean;
  createdAt: string;
  updatedAt: string;
  owner?: WorkflowOwnerSummary | null;
  publishedTemplate?: WorkflowTemplateRecord | null;
}

export interface WorkflowSchedulePayload {
  enabled: boolean;
  cron?: string;
  timezone?: string;
}

export interface WorkflowAlertPayload {
  email?: string;
  onFailure: boolean;
  onSuccess: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TaskRecord {
  id: string;
  workflowId: string;
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  triggerSource?: "manual" | "schedule";
  queuePriority?: number;
  errorMessage?: string | null;
  cancelRequestedAt?: string | null;
  tempDir?: string | null;
  workerPid?: number | null;
  resourceHeartbeatAt?: string | null;
  memoryRssMb?: number | null;
  peakMemoryRssMb?: number | null;
  heapUsedMb?: number | null;
  peakHeapUsedMb?: number | null;
  cpuPercent?: number | null;
  peakCpuPercent?: number | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  workflow?: WorkflowRecord;
  workflowSnapshot?: WorkflowApiDefinition;
  executionEvents?: TaskExecutionRecord[];
}

export interface TaskSummaryRecord {
  total: number;
  byStatus: {
    pending: number;
    running: number;
    success: number;
    failed: number;
    cancelled: number;
  };
  byTriggerSource: {
    manual: number;
    schedule: number;
  };
}

export interface AlertRecord {
  id: string;
  level: "error" | "warning" | "success";
  title: string;
  message: string;
  createdAt: string;
  taskId: string;
  workflowId: string;
  workflowName: string;
  triggerSource?: "manual" | "schedule";
  taskStatus: "pending" | "running" | "success" | "failed" | "cancelled";
}

export interface WorkflowScheduleRecord {
  id: string;
  name: string;
  description?: string | null;
  scheduleCron?: string | null;
  scheduleTimezone?: string | null;
  nextRunAt?: string | null;
  updatedAt: string;
  alertEmail?: string | null;
  alertOnFailure?: boolean;
  alertOnSuccess?: boolean;
  lastScheduledTask?: {
    id: string;
    status: "pending" | "running" | "success" | "failed" | "cancelled";
    createdAt: string;
    startedAt?: string | null;
    completedAt?: string | null;
  } | null;
}

export interface WorkflowTemplateRecord {
  id: string;
  slug: string;
  sourceWorkflowId?: string | null;
  publisherId?: string | null;
  title: string;
  description: string;
  category: string;
  tags: string[];
  definition: WorkflowApiDefinition;
  authorName: string;
  published: boolean;
  featured: boolean;
  installCount: number;
  rating: number;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOverviewRecord {
  metrics: {
    activeWorkflows: number;
    draftWorkflows: number;
    archivedWorkflows: number;
    templateTotal: number;
    publishedTemplates: number;
    scheduledWorkflows: number;
    taskTotal: number;
    totalUsers: number;
  };
  roleMatrix: Array<{
    key: "user" | "admin";
    name: string;
    summary: string;
    capabilities: string[];
  }>;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  isSuperAdmin?: boolean;
  status: "active" | "suspended";
  createdAt: string;
  updatedAt: string;
}

export interface ResetUserPasswordResult {
  id: string;
  email: string;
  temporaryPassword: string;
  emailSent?: boolean;
}

export interface TaskElementPickerCandidate {
  selector: string;
  strategy: string;
  label: string;
  isUnique: boolean;
}

export interface TaskElementPickerResult {
  requestId: string;
  taskId: string;
  selector: string;
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

export interface RecorderActionSummary {
  id: string;
  type: "open_page" | "click" | "input" | "press_key" | "scroll" | "wait_for_url";
  label: string;
  selector?: string;
  value?: string;
  url?: string;
  direction?: "up" | "down" | "top" | "bottom";
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

export interface RecorderFinishResult {
  ok: boolean;
  sessionId: string;
  recommendedName?: string;
  definition?: WorkflowApiDefinition;
  error?: string;
}

export interface CreatedUserResult extends UserRecord {
  temporaryPassword?: string;
  welcomeEmailSent?: boolean;
}

export interface SystemConfigRecord {
  id: string;
  platformName: string;
  supportEmail?: string | null;
  smtpHost?: string | null;
  smtpPort: number;
  smtpUser?: string | null;
  smtpPass?: string | null;
  smtpSecure: boolean;
  smtpIgnoreTlsCertificate: boolean;
  smtpFrom?: string | null;
  minioEndpoint?: string | null;
  minioPort: number;
  minioUseSSL: boolean;
  minioAccessKey?: string | null;
  minioSecretKey?: string | null;
  minioBucket?: string | null;
  screenshotIntervalMs: number;
  screenshotPersistIntervalMs: number;
  taskRetentionDays: number;
  monitorPageSize: number;
  globalTaskConcurrency: number;
  perUserTaskConcurrency: number;
  manualTaskPriority: number;
  scheduledTaskPriority: number;
  createdAt: string;
  updatedAt: string;
}

export interface SmtpTestResult {
  success: boolean;
  message: string;
  host: string;
  port: number;
  secure: boolean;
  ignoreTlsCertificate?: boolean;
  checkedAt: string;
}

export interface MinioTestResult {
  success: boolean;
  message: string;
  endpoint: string;
  port: number;
  useSSL: boolean;
  bucket: string;
  bucketExists: boolean;
  checkedAt: string;
}

export interface HealthRecord {
  api: "up" | "down";
  database: "up" | "down";
  redis: "up" | "degraded" | "down";
  storageConfigured?: boolean;
  queues: {
    tasks: Record<string, number>;
    schedulers: Record<string, number>;
  };
  smtpConfigured: boolean;
  checkedAt: string;
  runtime: {
    nodeEnv: string;
    port: string;
  };
}

export interface TaskEvent {
  taskId: string;
  type: "log" | "screenshot" | "status" | "extract" | "data_write";
  data:
    | {
        message: string;
        level: "info" | "warn" | "error" | "success";
        timestamp: string;
        nodeId?: string;
      }
    | {
        imageBase64?: string;
        imageBuffer?:
          | ArrayBuffer
          | Uint8Array
          | Blob
          | {
              type: "Buffer";
              data: number[];
            };
        mimeType: string;
        source?: "stream" | "node";
        timestamp: string;
      }
    | {
        status: "pending" | "running" | "success" | "failed" | "cancelled";
        errorMessage?: string;
        timestamp: string;
      }
    | {
        selector: string;
        property: string;
        value: string;
        preview: string;
        nodeId?: string;
        timestamp: string;
      }
    | {
        batchId: string;
        collectionId: string;
        collectionKey: string;
        collectionName: string;
        nodeId?: string;
        writeMode: "insert" | "upsert" | "skip_duplicates";
        recordMode: "single" | "array";
        totalCount: number;
        insertedCount: number;
        updatedCount: number;
        skippedCount: number;
        failedCount: number;
        timestamp: string;
      };
}

export interface TaskExecutionRecord {
  id: string;
  taskId: string;
  type: "log" | "screenshot" | "status" | "extract" | "data_write";
  sequence: number;
  level?: "info" | "warn" | "error" | "success" | null;
  nodeId?: string | null;
  message?: string | null;
  status?: "pending" | "running" | "success" | "failed" | "cancelled" | null;
  mimeType?: string | null;
  imageBase64?: string | null;
  storageProvider?: string | null;
  storageBucket?: string | null;
  storageKey?: string | null;
  sizeBytes?: number | null;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

export interface DataCollectionRecord {
  id: string;
  ownerId: string;
  key: string;
  name: string;
  description?: string | null;
  schemaJson?: Record<string, unknown> | null;
  schemaFields: string[];
  recordCount: number;
  batchCount: number;
  createdAt: string;
  updatedAt: string;
  owner?: WorkflowOwnerSummary | null;
}

export interface DataRecordRow {
  id: string;
  collectionId: string;
  ownerId: string;
  recordKey: string;
  dataJson: Record<string, unknown>;
  sourceWorkflowId?: string | null;
  lastTaskId?: string | null;
  lastBatchId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DataWriteBatchRecord {
  id: string;
  collectionId: string;
  taskId: string;
  workflowId: string;
  ownerId: string;
  nodeId?: string | null;
  writeMode: "insert" | "upsert" | "skip_duplicates";
  recordMode: "single" | "array";
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  totalCount: number;
  createdAt: string;
  collection?: {
    id: string;
    key: string;
    name: string;
  };
  owner?: WorkflowOwnerSummary | null;
}

export interface DataWriteBatchRowRecord {
  id: string;
  batchId: string;
  collectionId: string;
  taskId: string;
  workflowId: string;
  ownerId: string;
  recordKey?: string | null;
  operation: "insert" | "update" | "skip" | "error";
  dataJson?: Record<string, unknown> | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface DataCollectionRecordsResponse extends PaginatedResponse<DataRecordRow> {
  collection: DataCollectionRecord;
  columns: string[];
}

export interface DataBatchRowsResponse extends PaginatedResponse<DataWriteBatchRowRecord> {
  batch: DataWriteBatchRecord & {
    collection?: {
      id: string;
      key: string;
      name: string;
      schemaJson?: Record<string, unknown> | null;
      schemaFields: string[];
    };
  };
  columns: string[];
}
