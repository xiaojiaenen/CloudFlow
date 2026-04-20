import { buildAuthHeaders, requestJson } from "./core";
import type {
  AlertRecord,
  PaginatedResponse,
  TaskElementPickerResult,
  TaskRecord,
  TaskSummaryRecord,
} from "./types";

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

  return requestJson<PaginatedResponse<TaskRecord>>(
    `/tasks${query.toString() ? `?${query.toString()}` : ""}`,
    {
      headers: buildAuthHeaders(),
    },
    "加载任务列表失败。",
  );
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

  return requestJson<TaskSummaryRecord>(
    `/tasks/summary${query.toString() ? `?${query.toString()}` : ""}`,
    {
      headers: buildAuthHeaders(),
    },
    "加载任务概览失败。",
  );
}

export async function getTask(id: string) {
  return requestJson<TaskRecord>(
    `/tasks/${id}`,
    {
      headers: buildAuthHeaders(),
    },
    "加载任务详情失败。",
  );
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

  return requestJson<PaginatedResponse<AlertRecord>>(
    `/alerts${query.toString() ? `?${query.toString()}` : ""}`,
    {
      headers: buildAuthHeaders(),
    },
    "加载告警列表失败。",
  );
}

export async function runTask(
  workflowId: string,
  inputs?: Record<string, string>,
  credentialBindings?: Record<string, string>,
) {
  return requestJson<TaskRecord>(
    "/tasks/run",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify({ workflowId, inputs, credentialBindings }),
    },
    "启动任务失败。",
  );
}

export async function cancelTask(taskId: string) {
  return requestJson<TaskRecord>(
    `/tasks/${taskId}/cancel`,
    {
      method: "POST",
      headers: buildAuthHeaders(),
    },
    "取消任务失败。",
  );
}

export async function retryTask(taskId: string) {
  return requestJson<TaskRecord>(
    `/tasks/${taskId}/retry`,
    {
      method: "POST",
      headers: buildAuthHeaders(),
    },
    "重试任务失败。",
  );
}

export async function pickTaskElement(
  taskId: string,
  payload: {
    xRatio: number;
    yRatio: number;
  },
) {
  return requestJson<TaskElementPickerResult>(
    `/tasks/${taskId}/pick-element`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "从当前页面选取元素失败。",
  );
}
