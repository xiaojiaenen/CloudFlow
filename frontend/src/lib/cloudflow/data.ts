import { buildAuthHeaders, requestJson } from "./core";
import type {
  DataBatchRowsResponse,
  DataCollectionRecord,
  DataCollectionRecordsResponse,
  DataWriteBatchRecord,
  PaginatedResponse,
} from "./types";

export async function listDataCollections(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  workflowId?: string;
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
  if (params?.workflowId?.trim()) {
    query.set("workflowId", params.workflowId.trim());
  }

  return requestJson<PaginatedResponse<DataCollectionRecord>>(
    `/data/collections${query.toString() ? `?${query.toString()}` : ""}`,
    {
      headers: buildAuthHeaders(),
    },
    "加载数据集失败。",
  );
}

export async function getDataCollection(id: string) {
  return requestJson<DataCollectionRecord>(
    `/data/collections/${id}`,
    {
      headers: buildAuthHeaders(),
    },
    "加载数据集详情失败。",
  );
}

export async function listDataCollectionRecords(
  id: string,
  params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    workflowId?: string;
    taskId?: string;
  },
) {
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
  if (params?.workflowId?.trim()) {
    query.set("workflowId", params.workflowId.trim());
  }
  if (params?.taskId?.trim()) {
    query.set("taskId", params.taskId.trim());
  }

  return requestJson<DataCollectionRecordsResponse>(
    `/data/collections/${id}/records${query.toString() ? `?${query.toString()}` : ""}`,
    {
      headers: buildAuthHeaders(),
    },
    "加载数据记录失败。",
  );
}

export async function listTaskDataBatches(taskId: string) {
  return requestJson<DataWriteBatchRecord[]>(
    `/data/tasks/${taskId}/batches`,
    {
      headers: buildAuthHeaders(),
    },
    "加载任务数据输出失败。",
  );
}

export async function listDataBatchRows(
  batchId: string,
  params?: {
    page?: number;
    pageSize?: number;
    operation?: "insert" | "update" | "skip" | "error";
  },
) {
  const query = new URLSearchParams();

  if (params?.page) {
    query.set("page", String(params.page));
  }
  if (params?.pageSize) {
    query.set("pageSize", String(params.pageSize));
  }
  if (params?.operation) {
    query.set("operation", params.operation);
  }

  return requestJson<DataBatchRowsResponse>(
    `/data/batches/${batchId}/rows${query.toString() ? `?${query.toString()}` : ""}`,
    {
      headers: buildAuthHeaders(),
    },
    "加载批次明细失败。",
  );
}
