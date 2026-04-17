import { buildAuthHeaders, getApiBaseUrl, parseErrorMessage, requestJson } from "./core";
import type {
  AdminOverviewRecord,
  HealthRecord,
  MinioTestResult,
  ResetUserPasswordResult,
  SmtpTestResult,
  SystemConfigRecord,
  UserRecord,
  WorkflowApiDefinition,
  WorkflowTemplateRecord,
} from "./types";

export async function getAdminOverview() {
  return requestJson<AdminOverviewRecord>(
    "/admin/overview",
    {
      headers: buildAuthHeaders(),
    },
    "Failed to load the admin overview.",
  );
}

export async function getHealthStatus() {
  return requestJson<HealthRecord>(
    "/admin/health",
    {
      headers: buildAuthHeaders(),
    },
    "Failed to load system health.",
  );
}

export async function getSystemConfig() {
  return requestJson<SystemConfigRecord>(
    "/admin/system-config",
    {
      headers: buildAuthHeaders(),
    },
    "Failed to load system config.",
  );
}

export async function updateSystemConfig(payload: Partial<SystemConfigRecord>) {
  return requestJson<SystemConfigRecord>(
    "/admin/system-config",
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "Failed to update system config.",
  );
}

export async function testSystemSmtpConnection(payload: Partial<SystemConfigRecord>) {
  const actualResponse = await fetch(`${getApiBaseUrl()}/admin/system-config/test-smtp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!actualResponse.ok) {
    throw new Error(await parseErrorMessage(actualResponse, "SMTP test failed."));
  }

  const result = (await actualResponse.json()) as SmtpTestResult;
  return {
    ...result,
    message: `SMTP connected: ${result.host}:${result.port}${result.secure ? " (SSL/TLS)" : ""}${
      result.ignoreTlsCertificate ? " with certificate bypass" : ""
    }`,
  };
}

export async function testSystemMinioConnection(payload: Partial<SystemConfigRecord>) {
  const response = await fetch(`${getApiBaseUrl()}/admin/system-config/test-minio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "MinIO test failed."));
  }

  return (await response.json()) as MinioTestResult;
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

  return requestJson<WorkflowTemplateRecord[]>(
    `/admin/templates${query.toString() ? `?${query.toString()}` : ""}`,
    {
      headers: buildAuthHeaders(),
    },
    "Failed to load templates.",
  );
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
  return requestJson<WorkflowTemplateRecord>(
    "/admin/templates",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "Failed to create the template.",
  );
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
  return requestJson<WorkflowTemplateRecord>(
    "/admin/templates/publish-from-workflow",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "Failed to publish the template.",
  );
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
  return requestJson<WorkflowTemplateRecord>(
    `/admin/templates/${id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "Failed to update the template.",
  );
}

export async function listUsers() {
  return requestJson<UserRecord[]>(
    "/admin/users",
    {
      headers: buildAuthHeaders(),
    },
    "Failed to load users.",
  );
}

export async function createAdminUser(payload: {
  email: string;
  name: string;
  role?: "admin" | "user";
  status?: "active" | "suspended";
  password: string;
}) {
  return requestJson<UserRecord>(
    "/admin/users",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "Failed to create the user.",
  );
}

export async function updateAdminUser(
  id: string,
  payload: Partial<{
    name: string;
    role: "admin" | "user";
    status: "active" | "suspended";
  }>,
) {
  return requestJson<UserRecord>(
    `/admin/users/${id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "Failed to update the user.",
  );
}

export async function resetAdminUserPassword(id: string, newPassword?: string) {
  return requestJson<ResetUserPasswordResult>(
    `/admin/users/${id}/reset-password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(newPassword ? { newPassword } : {}),
    },
    "Failed to reset the password.",
  );
}
