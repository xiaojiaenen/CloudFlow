import { buildAuthHeaders, requestJson } from "./core";
import type {
  DataBatchRowsResponse,
  DataCollectionRecord,
  DataCollectionRecordsResponse,
  DataRecordRow,
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

export async function deleteDataCollection(id: string) {
  return requestJson<{ success: boolean }>(
    `/data/collections/${id}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(),
    },
    "删除数据集失败。",
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
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    fieldFilters?: Record<string, string>;
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
  if (params?.sortBy?.trim()) {
    query.set("sortBy", params.sortBy.trim());
  }
  if (params?.sortOrder) {
    query.set("sortOrder", params.sortOrder);
  }
  if (params?.fieldFilters && Object.keys(params.fieldFilters).length > 0) {
    query.set("fieldFilters", JSON.stringify(params.fieldFilters));
  }

  return requestJson<DataCollectionRecordsResponse>(
    `/data/collections/${id}/records${query.toString() ? `?${query.toString()}` : ""}`,
    {
      headers: buildAuthHeaders(),
    },
    "加载数据记录失败。",
  );
}

export async function exportAllCollectionRecords(id: string) {
  return requestJson<{
    collection: DataCollectionRecord;
    columns: string[];
    items: DataRecordRow[];
    total: number;
  }>(
    `/data/collections/${id}/export`,
    {
      headers: buildAuthHeaders(),
    },
    "导出数据失败。",
  );
}

export async function deleteDataRecord(recordId: string) {
  return requestJson<{ success: boolean }>(
    `/data/records/${recordId}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(),
    },
    "删除记录失败。",
  );
}

export async function updateDataRecord(
  recordId: string,
  dataJson: Record<string, unknown>,
) {
  return requestJson<DataRecordRow>(
    `/data/records/${recordId}`,
    {
      method: "PATCH",
      headers: buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ dataJson }),
    },
    "更新记录失败。",
  );
}

export async function batchDeleteDataRecords(
  collectionId: string,
  recordIds: string[],
) {
  return requestJson<{ deletedCount: number }>(
    `/data/collections/${collectionId}/records/batch-delete`,
    {
      method: "POST",
      headers: buildAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ recordIds }),
    },
    "批量删除记录失败。",
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
