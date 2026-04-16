import type { Edge, Node } from "@xyflow/react";
import { getNodeDefinition } from "@/src/registry/nodes";

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

export interface WorkflowRecord {
  id: string;
  name: string;
  description?: string | null;
  definition: WorkflowApiDefinition;
  status: WorkflowStatus;
  scheduleEnabled?: boolean;
  scheduleCron?: string | null;
  scheduleTimezone?: string | null;
  alertEmail?: string | null;
  alertOnSuccess?: boolean;
  alertOnFailure?: boolean;
  createdAt: string;
  updatedAt: string;
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
  type: "log" | "screenshot" | "status" | "extract";
  data:
    | {
        message: string;
        level: "info" | "warn" | "error" | "success";
        timestamp: string;
        nodeId?: string;
      }
    | {
        imageBase64: string;
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
      };
}

export interface TaskExecutionRecord {
  id: string;
  taskId: string;
  type: "log" | "screenshot" | "status" | "extract";
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

export const WORKFLOW_SAVED_EVENT = "cloudflow:workflow-saved";
export const WORKFLOW_OPEN_BLANK_EVENT = "cloudflow:open-blank-workflow";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:3001/api";
const WS_BASE_URL =
  (import.meta.env.VITE_WS_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:3001";
const AUTH_STORAGE_KEY = "cloudflow:auth-token";

export function formatNodeParams(data: Record<string, unknown>) {
  const definition = getNodeDefinition(String(data.type ?? ""));
  const fieldMap = new Map((definition?.fields ?? []).map((field) => [field.name, field]));

  return Object.entries(data)
    .filter(
      ([key, value]) =>
        !["label", "type", "status", "params", "clientNodeId"].includes(key) &&
        value !== undefined &&
        value !== "",
    )
    .map(([key, value]) => {
      const field = fieldMap.get(key);
      const displayValue =
        field?.options?.find((option) => option.value === String(value))?.label ?? String(value);
      return `${field?.label ?? key}: ${displayValue}`;
    })
    .join("，");
}

function buildNodeParams(data: Record<string, unknown>) {
  return formatNodeParams(data);
}

function createNodeData(type: string, extra: Record<string, unknown> = {}): CanvasNodeData {
  const defaultLabel = getNodeDefinition(type)?.label ?? type;
  const data = {
    label: defaultLabel,
    type,
    status: "idle" as const,
    ...extra,
  };

  return {
    ...data,
    params: buildNodeParams(data),
  };
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function getWsBaseUrl() {
  return WS_BASE_URL;
}

export function getAuthToken() {
  return window.localStorage.getItem(AUTH_STORAGE_KEY) ?? "";
}

export function setAuthToken(token: string) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, token);
}

export function clearAuthToken() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function buildTaskScreenshotUrl(taskId: string, eventId: string) {
  const token = getAuthToken();
  const query = token ? `?accessToken=${encodeURIComponent(token)}` : "";
  return `${API_BASE_URL}/tasks/${taskId}/screenshots/${eventId}${query}`;
}

export function getTaskExecutionScreenshotSrc(
  taskId: string,
  event?: Pick<TaskExecutionRecord, "id" | "imageBase64"> | null,
) {
  if (!event) {
    return null;
  }

  if (event.imageBase64) {
    return `data:image/jpeg;base64,${event.imageBase64}`;
  }

  return buildTaskScreenshotUrl(taskId, event.id);
}

function buildAuthHeaders(headers?: HeadersInit) {
  const token = getAuthToken();

  if (!token) {
    return headers;
  }

  return {
    ...(headers ?? {}),
    Authorization: `Bearer ${token}`,
  };
}

export function createEmptyCanvasGraph(): WorkflowCanvasSnapshot {
  return {
    nodes: [],
    edges: [],
  };
}

export function createDemoCanvasGraph(): WorkflowCanvasSnapshot {
  return {
    nodes: [
      {
        id: "1",
        type: "custom",
        position: { x: 250, y: 50 },
        data: createNodeData("open_page", {
          label: "打开目标网页",
          url: "data:text/html,%3C!doctype%20html%3E%3Chtml%3E%3Cbody%20style%3D%22font-family%3AArial%3Bpadding%3A40px%3Bbackground%3A%230f172a%3Bcolor%3Awhite%22%3E%3Ch1%3ECloudFlow%20Demo%3C%2Fh1%3E%3Cinput%20id%3D%22username%22%20placeholder%3D%22username%22%20style%3D%22display%3Ablock%3Bmargin-bottom%3A12px%3Bpadding%3A10px%3Bwidth%3A240px%22%20%2F%3E%3Cbutton%20id%3D%22login%22%20style%3D%22padding%3A10px%2016px%22%20onclick%3D%22document.getElementById(%27result%27).textContent%20%3D%20%27Login%20clicked%27%22%3ELogin%3C%2Fbutton%3E%3Cp%20id%3D%22result%22%20style%3D%22margin-top%3A16px%22%3EWaiting...%3C%2Fp%3E%3C%2Fbody%3E%3C%2Fhtml%3E",
        }),
      },
      {
        id: "2",
        type: "custom",
        position: { x: 250, y: 200 },
        data: createNodeData("input", {
          label: "输入账号",
          selector: "#username",
          value: "test",
        }),
      },
      {
        id: "3",
        type: "custom",
        position: { x: 250, y: 350 },
        data: createNodeData("click", {
          label: "点击登录按钮",
          selector: "#login",
        }),
      },
      {
        id: "4",
        type: "custom",
        position: { x: 250, y: 500 },
        data: createNodeData("wait", {
          label: "等待页面稳定",
          time: "1500",
        }),
      },
    ],
    edges: [
      { id: "e1-2", source: "1", target: "2" },
      { id: "e2-3", source: "2", target: "3" },
      { id: "e3-4", source: "3", target: "4" },
    ],
  };
}

export async function listWorkflows(params?: {
  includeArchived?: boolean;
  status?: WorkflowStatus;
  search?: string;
}) {
  const query = new URLSearchParams();

  if (params?.includeArchived) {
    query.set("includeArchived", "true");
  }

  if (params?.status) {
    query.set("status", params.status);
  }

  if (params?.search?.trim()) {
    query.set("search", params.search.trim());
  }

  const response = await fetch(`${API_BASE_URL}/workflows${query.toString() ? `?${query.toString()}` : ""}`, {
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`读取工作流列表失败 (${response.status})`);
  }

  return (await response.json()) as WorkflowRecord[];
}

export async function getWorkflow(id: string) {
  const response = await fetch(`${API_BASE_URL}/workflows/${id}`, {
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`读取工作流失败 (${response.status})`);
  }

  return (await response.json()) as WorkflowRecord;
}

export async function createWorkflow(payload: {
  name: string;
  description?: string;
  status?: WorkflowStatus;
  definition: WorkflowApiDefinition;
  schedule?: WorkflowSchedulePayload;
  alerts?: WorkflowAlertPayload;
}) {
  const response = await fetch(`${API_BASE_URL}/workflows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`创建工作流失败 (${response.status})`);
  }

  return (await response.json()) as WorkflowRecord;
}

export async function updateWorkflow(
  id: string,
  payload: {
    name?: string;
    description?: string;
    status?: WorkflowStatus;
    definition?: WorkflowApiDefinition;
    schedule?: WorkflowSchedulePayload;
    alerts?: WorkflowAlertPayload;
  },
) {
  const response = await fetch(`${API_BASE_URL}/workflows/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`保存工作流失败 (${response.status})`);
  }

  return (await response.json()) as WorkflowRecord;
}

export async function deleteWorkflow(id: string) {
  const response = await fetch(`${API_BASE_URL}/workflows/${id}`, {
    method: "DELETE",
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`删除工作流失败 (${response.status})`);
  }

  return (await response.json()) as { id: string; deletedAt: string };
}

export async function duplicateWorkflow(id: string) {
  const response = await fetch(`${API_BASE_URL}/workflows/${id}/duplicate`, {
    method: "POST",
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`复制工作流失败 (${response.status})`);
  }

  return (await response.json()) as WorkflowRecord;
}

export async function listWorkflowSchedules(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  lastStatus?: TaskRecord["status"] | "never" | "all";
}) {
  const query = new URLSearchParams();

  if (params?.page) {
    query.set("page", String(params.page));
  }

  if (params?.pageSize) {
    query.set("pageSize", String(params.pageSize));
  }

  if (params?.search?.trim()) {
    query.set("search", params.search.trim());
  }

  if (params?.lastStatus && params.lastStatus !== "all") {
    query.set("lastStatus", params.lastStatus);
  }

  const response = await fetch(`${API_BASE_URL}/workflows/schedules${query.toString() ? `?${query.toString()}` : ""}`, {
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`读取调度列表失败 (${response.status})`);
  }

  return (await response.json()) as PaginatedResponse<WorkflowScheduleRecord>;
}

export async function listStoreTemplates(params?: {
  search?: string;
  category?: string;
}) {
  const query = new URLSearchParams();

  if (params?.search?.trim()) {
    query.set("search", params.search.trim());
  }

  if (params?.category?.trim()) {
    query.set("category", params.category.trim());
  }

  const response = await fetch(`${API_BASE_URL}/store/templates${query.toString() ? `?${query.toString()}` : ""}`);

  if (!response.ok) {
    throw new Error(`读取商店模板失败 (${response.status})`);
  }

  return (await response.json()) as WorkflowTemplateRecord[];
}

export async function markStoreTemplateInstalled(id: string) {
  const response = await fetch(`${API_BASE_URL}/store/templates/${id}/install`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`更新模板安装量失败 (${response.status})`);
  }

  return (await response.json()) as WorkflowTemplateRecord;
}

export async function getAdminOverview() {
  const response = await fetch(`${API_BASE_URL}/admin/overview`, {
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`读取管理后台总览失败 (${response.status})`);
  }

  return (await response.json()) as AdminOverviewRecord;
}

export async function getHealthStatus() {
  const response = await fetch(`${API_BASE_URL}/admin/health`, {
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`读取系统健康状态失败 (${response.status})`);
  }

  return (await response.json()) as HealthRecord;
}

export async function getSystemConfig() {
  const response = await fetch(`${API_BASE_URL}/admin/system-config`, {
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`读取系统配置失败 (${response.status})`);
  }

  return (await response.json()) as SystemConfigRecord;
}

export async function updateSystemConfig(payload: Partial<SystemConfigRecord>) {
  const response = await fetch(`${API_BASE_URL}/admin/system-config`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`保存系统配置失败 (${response.status})`);
  }

  return (await response.json()) as SystemConfigRecord;
}

export async function testSystemSmtpConnection(payload: Partial<SystemConfigRecord>) {
  const response = await fetch(`${API_BASE_URL}/admin/system-config/test-smtp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `SMTP 测试连接失败 (${response.status})`;

    try {
      const data = (await response.json()) as { message?: string | string[] };
      const nextMessage = Array.isArray(data.message) ? data.message.join("；") : data.message;
      if (nextMessage) {
        message = nextMessage;
      }
    } catch {
      // ignore json parse errors and keep the fallback message
    }

    throw new Error(message);
  }

  const result = (await response.json()) as SmtpTestResult;

  return {
    ...result,
    message: `SMTP 连接成功：${result.host}:${result.port}${result.secure ? "（SSL/TLS）" : ""}${
      result.ignoreTlsCertificate ? "，已忽略证书校验" : ""
    }`,
  };
}

export async function testSystemMinioConnection(payload: Partial<SystemConfigRecord>) {
  const response = await fetch(`${API_BASE_URL}/admin/system-config/test-minio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `MinIO 测试连接失败 (${response.status})`;

    try {
      const data = (await response.json()) as { message?: string | string[] };
      const nextMessage = Array.isArray(data.message) ? data.message.join("；") : data.message;
      if (nextMessage) {
        message = nextMessage;
      }
    } catch {
      // ignore json parse errors and keep the fallback message
    }

    throw new Error(message);
  }

  return (await response.json()) as MinioTestResult;
}

export async function listCredentials() {
  const response = await fetch(`${API_BASE_URL}/credentials`, {
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`读取凭据列表失败 (${response.status})`);
  }

  return (await response.json()) as CredentialRecord[];
}

export async function createCredential(payload: CredentialUpsertPayload) {
  const response = await fetch(`${API_BASE_URL}/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`创建凭据失败 (${response.status})`);
  }

  return (await response.json()) as CredentialRecord;
}

export async function updateCredential(id: string, payload: CredentialUpsertPayload) {
  const response = await fetch(`${API_BASE_URL}/credentials/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`更新凭据失败 (${response.status})`);
  }

  return (await response.json()) as CredentialRecord;
}

export async function deleteCredential(id: string) {
  const response = await fetch(`${API_BASE_URL}/credentials/${id}`, {
    method: "DELETE",
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`删除凭据失败 (${response.status})`);
  }

  return (await response.json()) as { id: string; deleted: boolean };
}

export async function listAdminTemplates(params?: {
  search?: string;
  published?: "true" | "false" | "all";
}) {
  const query = new URLSearchParams();

  if (params?.search?.trim()) {
    query.set("search", params.search.trim());
  }

  if (params?.published && params.published !== "all") {
    query.set("published", params.published);
  }

  const response = await fetch(`${API_BASE_URL}/admin/templates${query.toString() ? `?${query.toString()}` : ""}`, {
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`读取模板列表失败 (${response.status})`);
  }

  return (await response.json()) as WorkflowTemplateRecord[];
}

export async function createAdminTemplate(payload: {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  definition: WorkflowApiDefinition;
  authorName?: string;
  published?: boolean;
  featured?: boolean;
  rating?: number;
}) {
  const response = await fetch(`${API_BASE_URL}/admin/templates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`创建模板失败 (${response.status})`);
  }

  return (await response.json()) as WorkflowTemplateRecord;
}

export async function publishWorkflowTemplate(payload: {
  workflowId: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  authorName?: string;
  published?: boolean;
  featured?: boolean;
}) {
  const response = await fetch(`${API_BASE_URL}/admin/templates/publish-from-workflow`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`发布模板失败 (${response.status})`);
  }

  return (await response.json()) as WorkflowTemplateRecord;
}

export async function updateAdminTemplate(
  id: string,
  payload: Partial<{
    slug: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
    definition: WorkflowApiDefinition;
    authorName: string;
    published: boolean;
    featured: boolean;
    rating: number;
  }>,
) {
  const response = await fetch(`${API_BASE_URL}/admin/templates/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`更新模板失败 (${response.status})`);
  }

  return (await response.json()) as WorkflowTemplateRecord;
}

export async function listTasks(params?: {
  page?: number;
  pageSize?: number;
  status?: TaskRecord["status"];
  triggerSource?: TaskRecord["triggerSource"];
  workflowId?: string;
  activeOnly?: boolean;
  search?: string;
}) {
  const query = new URLSearchParams();

  if (params?.page) {
    query.set("page", String(params.page));
  }

  if (params?.pageSize) {
    query.set("pageSize", String(params.pageSize));
  }

  if (params?.status) {
    query.set("status", params.status);
  }

  if (params?.triggerSource) {
    query.set("triggerSource", params.triggerSource);
  }

  if (params?.workflowId) {
    query.set("workflowId", params.workflowId);
  }

  if (params?.activeOnly) {
    query.set("activeOnly", "true");
  }

  if (params?.search?.trim()) {
    query.set("search", params.search.trim());
  }

  const response = await fetch(`${API_BASE_URL}/tasks${query.toString() ? `?${query.toString()}` : ""}`, {
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`读取任务列表失败 (${response.status})`);
  }

  return (await response.json()) as PaginatedResponse<TaskRecord>;
}

export async function getTaskSummary(params?: {
  status?: TaskRecord["status"];
  triggerSource?: TaskRecord["triggerSource"];
  workflowId?: string;
  activeOnly?: boolean;
  search?: string;
}) {
  const query = new URLSearchParams();

  if (params?.status) {
    query.set("status", params.status);
  }

  if (params?.triggerSource) {
    query.set("triggerSource", params.triggerSource);
  }

  if (params?.workflowId) {
    query.set("workflowId", params.workflowId);
  }

  if (params?.activeOnly) {
    query.set("activeOnly", "true");
  }

  if (params?.search?.trim()) {
    query.set("search", params.search.trim());
  }

  const response = await fetch(`${API_BASE_URL}/tasks/summary${query.toString() ? `?${query.toString()}` : ""}`, {
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`读取任务统计失败 (${response.status})`);
  }

  return (await response.json()) as TaskSummaryRecord;
}

export async function getTask(id: string) {
  const response = await fetch(`${API_BASE_URL}/tasks/${id}`, {
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`读取任务详情失败 (${response.status})`);
  }

  return (await response.json()) as TaskRecord;
}

export async function listAlerts(params?: {
  page?: number;
  pageSize?: number;
  level?: AlertRecord["level"];
}) {
  const query = new URLSearchParams();

  if (params?.page) {
    query.set("page", String(params.page));
  }

  if (params?.pageSize) {
    query.set("pageSize", String(params.pageSize));
  }

  if (params?.level) {
    query.set("level", params.level);
  }

  const response = await fetch(`${API_BASE_URL}/alerts${query.toString() ? `?${query.toString()}` : ""}`, {
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`读取告警列表失败 (${response.status})`);
  }

  return (await response.json()) as PaginatedResponse<AlertRecord>;
}

export async function runTask(
  workflowId: string,
  inputs?: Record<string, string>,
  credentialBindings?: Record<string, string>,
) {
  const response = await fetch(`${API_BASE_URL}/tasks/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify({ workflowId, inputs, credentialBindings }),
  });

  if (!response.ok) {
    throw new Error(`创建任务失败 (${response.status})`);
  }

  return (await response.json()) as TaskRecord;
}

export async function cancelTask(taskId: string) {
  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/cancel`, {
    method: "POST",
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`停止任务失败 (${response.status})`);
  }

  return (await response.json()) as TaskRecord;
}

export async function retryTask(taskId: string) {
  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/retry`, {
    method: "POST",
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`重试任务失败 (${response.status})`);
  }

  return (await response.json()) as TaskRecord;
}

export async function login(payload: { email: string; password: string }) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`登录失败 (${response.status})`);
  }

  return (await response.json()) as {
    token: string;
    user: UserRecord;
  };
}

export async function getCurrentUser() {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`读取当前用户失败 (${response.status})`);
  }

  return (await response.json()) as UserRecord;
}

export async function updateCurrentUserProfile(payload: { name: string }) {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`更新个人资料失败 (${response.status})`);
  }

  return (await response.json()) as UserRecord;
}

export async function changeCurrentUserPassword(payload: {
  currentPassword: string;
  newPassword: string;
}) {
  const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`修改密码失败 (${response.status})`);
  }

  return (await response.json()) as { success: boolean };
}

export async function listUsers() {
  const response = await fetch(`${API_BASE_URL}/admin/users`, {
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`读取用户列表失败 (${response.status})`);
  }

  return (await response.json()) as UserRecord[];
}

export async function createAdminUser(payload: {
  email: string;
  name: string;
  role?: "admin" | "user";
  status?: "active" | "suspended";
  password: string;
}) {
  const response = await fetch(`${API_BASE_URL}/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`创建用户失败 (${response.status})`);
  }

  return (await response.json()) as UserRecord;
}

export async function updateAdminUser(
  id: string,
  payload: Partial<{
    name: string;
    role: "admin" | "user";
    status: "active" | "suspended";
  }>,
) {
  const response = await fetch(`${API_BASE_URL}/admin/users/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`更新用户失败 (${response.status})`);
  }

  return (await response.json()) as UserRecord;
}

export async function resetAdminUserPassword(id: string, newPassword?: string) {
  const response = await fetch(`${API_BASE_URL}/admin/users/${id}/reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(newPassword ? { newPassword } : {}),
  });

  if (!response.ok) {
    throw new Error(`重置密码失败 (${response.status})`);
  }

  return (await response.json()) as ResetUserPasswordResult;
}

export function buildWorkflowDefinition(
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
  options?: {
    inputSchema?: WorkflowInputField[];
    credentialRequirements?: WorkflowCredentialRequirement[];
  },
): WorkflowApiDefinition {
  const supportedTypes = new Set([
    "open_page",
    "click",
    "input",
    "hover",
    "press_key",
    "select_option",
    "check",
    "uncheck",
    "set_variable",
    "condition",
    "wait",
    "wait_for_element",
    "wait_for_text",
    "wait_for_class",
    "wait_for_url",
    "switch_iframe",
    "switch_main_frame",
    "scroll",
    "extract",
    "screenshot",
  ]);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incomingCounts = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  nodes.forEach((node) => {
    incomingCounts.set(node.id, 0);
    outgoing.set(node.id, []);
  });

  edges.forEach((edge) => {
    incomingCounts.set(edge.target, (incomingCounts.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  });

  const startNodes = nodes
    .filter((node) => (incomingCounts.get(node.id) ?? 0) === 0)
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

  const visited = new Set<string>();
  const orderedNodes: Node<CanvasNodeData>[] = [];

  const walk = (nodeId: string) => {
    if (visited.has(nodeId)) {
      return;
    }

    const node = nodeById.get(nodeId);
    if (!node) {
      return;
    }

    visited.add(nodeId);
    orderedNodes.push(node);

    const nextNodes = (outgoing.get(nodeId) ?? [])
      .map((id) => nodeById.get(id))
      .filter((candidate): candidate is Node<CanvasNodeData> => Boolean(candidate))
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

    nextNodes.forEach((nextNode) => walk(nextNode.id));
  };

  startNodes.forEach((node) => walk(node.id));

  nodes
    .filter((node) => !visited.has(node.id))
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    .forEach((node) => orderedNodes.push(node));

  const unsupportedNodes = orderedNodes.filter((node) => !supportedTypes.has(String(node.data.type)));
  if (unsupportedNodes.length > 0) {
    const labels = unsupportedNodes.map((node) => node.data.label || node.id).join("、");
    throw new Error(`当前存在后端尚未支持的节点，请先移除：${labels}`);
  }

  return {
    nodes: orderedNodes.map((node) => {
      const type = String(node.data.type);
      const baseNode = {
        clientNodeId: node.id,
        type,
      } as Record<string, unknown>;

      if (type === "open_page") {
        baseNode.url = String(node.data.url ?? "");
      } else if (type === "click") {
        baseNode.selector = String(node.data.selector ?? "");
      } else if (type === "input") {
        baseNode.selector = String(node.data.selector ?? "");
        baseNode.value = String(node.data.value ?? "");
      } else if (type === "hover") {
        baseNode.selector = String(node.data.selector ?? "");
      } else if (type === "press_key") {
        baseNode.key = String(node.data.key ?? "");
      } else if (type === "select_option") {
        baseNode.selector = String(node.data.selector ?? "");
        baseNode.value = String(node.data.value ?? "");
      } else if (type === "check" || type === "uncheck") {
        baseNode.selector = String(node.data.selector ?? "");
      } else if (type === "set_variable") {
        baseNode.key = String(node.data.key ?? "");
        baseNode.value = String(node.data.value ?? "");
      } else if (type === "condition") {
        baseNode.left = String(node.data.left ?? "");
        baseNode.operator = String(node.data.operator ?? "equals");
        baseNode.right = String(node.data.right ?? "");
      } else if (type === "wait") {
        baseNode.time = Number(node.data.time ?? 1000);
      } else if (type === "wait_for_element") {
        baseNode.selector = String(node.data.selector ?? "");
        baseNode.state = String(node.data.state ?? "visible");
        baseNode.timeout = Number(node.data.timeout ?? 10000);
      } else if (type === "wait_for_text") {
        baseNode.selector = String(node.data.selector ?? "");
        baseNode.text = String(node.data.text ?? "");
        baseNode.matchMode = String(node.data.matchMode ?? "contains");
        baseNode.timeout = Number(node.data.timeout ?? 10000);
      } else if (type === "wait_for_class") {
        baseNode.selector = String(node.data.selector ?? "");
        baseNode.className = String(node.data.className ?? "");
        baseNode.condition = String(node.data.condition ?? "contains");
        baseNode.timeout = Number(node.data.timeout ?? 10000);
      } else if (type === "wait_for_url") {
        baseNode.urlIncludes = String(node.data.urlIncludes ?? "");
        baseNode.waitUntil = String(node.data.waitUntil ?? "load");
        baseNode.timeout = Number(node.data.timeout ?? 10000);
      } else if (type === "switch_iframe") {
        baseNode.selector = String(node.data.selector ?? "");
        baseNode.name = String(node.data.name ?? "");
        baseNode.urlIncludes = String(node.data.urlIncludes ?? "");
        baseNode.timeout = Number(node.data.timeout ?? 10000);
      } else if (type === "switch_main_frame") {
        // No extra config needed.
      } else if (type === "scroll") {
        baseNode.direction = String(node.data.direction ?? "down");
        baseNode.distance = Number(node.data.distance ?? 500);
      } else if (type === "extract") {
        baseNode.selector = String(node.data.selector ?? "");
        baseNode.property = String(node.data.property ?? "text");
        baseNode.attributeName = String(node.data.attributeName ?? "");
        baseNode.saveAs = String(node.data.saveAs ?? "");
      } else if (type === "screenshot") {
        baseNode.scope = String(node.data.scope ?? "viewport");
        baseNode.selector = String(node.data.selector ?? "");
      }

      return baseNode;
    }),
    canvas: {
      nodes: sanitizeCanvasNodes(nodes),
      edges: sanitizeCanvasEdges(edges),
    },
    inputSchema: options?.inputSchema ?? [],
    credentialRequirements: options?.credentialRequirements ?? [],
  };
}

export function hydrateCanvasFromWorkflow(definition?: WorkflowApiDefinition | null): WorkflowCanvasSnapshot {
  if (definition?.canvas?.nodes?.length) {
    return {
      nodes: definition.canvas.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          params: buildNodeParams(node.data),
          status: "idle",
        } as CanvasNodeData,
      })),
      edges: definition.canvas.edges.map((edge) => ({ ...edge })),
    };
  }

  if (!definition?.nodes?.length) {
    return createEmptyCanvasGraph();
  }

  const nodes: SanitizedCanvasNode[] = definition.nodes.map((node, index) => {
    const type = String(node.type ?? "unknown");
    const nodeId = String(node.clientNodeId ?? index + 1);
    const data = createNodeData(type, {
      ...node,
      type,
    });

    return {
      id: nodeId,
      type: "custom",
      position: {
        x: 250,
        y: 50 + index * 150,
      },
      data,
    };
  });

  const edges: SanitizedCanvasEdge[] = nodes.slice(1).map((node, index) => ({
    id: `e${nodes[index].id}-${node.id}`,
    source: nodes[index].id,
    target: node.id,
  }));

  return { nodes, edges };
}

export function sanitizeCanvasNodes(nodes: Node<CanvasNodeData>[]): SanitizedCanvasNode[] {
  return nodes.map((node) => {
    const data = {
      ...node.data,
      status: undefined,
    };

    return {
      id: node.id,
      type: node.type,
      position: {
        x: node.position.x,
        y: node.position.y,
      },
      data: {
        ...data,
        params: buildNodeParams(data),
      },
    };
  });
}

export function sanitizeCanvasEdges(edges: Edge[]): SanitizedCanvasEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
  }));
}
