import { buildAuthHeaders, requestJson } from "./core";
import type {
  PaginatedResponse,
  TaskRecord,
  WorkflowAlertPayload,
  WorkflowApiDefinition,
  WorkflowRecord,
  WorkflowSchedulePayload,
  WorkflowScheduleRecord,
  WorkflowStatus,
  WorkflowTemplateRecord,
} from "./types";

type CreateWorkflowPayload = {
  name: string;
  description?: string;
  status?: WorkflowStatus;
  installedFromTemplateId?: string;
  definition: WorkflowApiDefinition;
  schedule?: WorkflowSchedulePayload;
  alerts?: WorkflowAlertPayload;
};

type UpdateWorkflowPayload = Partial<CreateWorkflowPayload>;

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

  return requestJson<WorkflowRecord[]>(
    `/workflows${query.toString() ? `?${query.toString()}` : ""}`,
    {
      headers: buildAuthHeaders(),
    },
    "Failed to load workflows.",
  );
}

export async function getWorkflow(id: string) {
  return requestJson<WorkflowRecord>(
    `/workflows/${id}`,
    {
      headers: buildAuthHeaders(),
    },
    "Failed to load the workflow.",
  );
}

export async function createWorkflow(payload: CreateWorkflowPayload) {
  return requestJson<WorkflowRecord>(
    "/workflows",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "Failed to create the workflow.",
  );
}

export async function updateWorkflow(id: string, payload: UpdateWorkflowPayload) {
  return requestJson<WorkflowRecord>(
    `/workflows/${id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "Failed to update the workflow.",
  );
}

export async function deleteWorkflow(id: string) {
  return requestJson<{ id: string; deletedAt: string }>(
    `/workflows/${id}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(),
    },
    "Failed to delete the workflow.",
  );
}

export async function duplicateWorkflow(id: string) {
  return requestJson<WorkflowRecord>(
    `/workflows/${id}/duplicate`,
    {
      method: "POST",
      headers: buildAuthHeaders(),
    },
    "Failed to duplicate the workflow.",
  );
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

  return requestJson<PaginatedResponse<WorkflowScheduleRecord>>(
    `/workflows/schedules${query.toString() ? `?${query.toString()}` : ""}`,
    {
      headers: buildAuthHeaders(),
    },
    "Failed to load workflow schedules.",
  );
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

  return requestJson<WorkflowTemplateRecord[]>(
    `/store/templates${query.toString() ? `?${query.toString()}` : ""}`,
    undefined,
    "Failed to load store templates.",
  );
}

export async function markStoreTemplateInstalled(id: string) {
  return requestJson<WorkflowTemplateRecord>(
    `/store/templates/${id}/install`,
    {
      method: "POST",
    },
    "Failed to update the template install count.",
  );
}
