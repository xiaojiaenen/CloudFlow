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
    "加载管理总览失败。",
  );
}

export async function getHealthStatus() {
  return requestJson<HealthRecord>(
    "/admin/health",
    {
      headers: buildAuthHeaders(),
    },
    "加载系统健康状态失败。",
  );
}

export async function getSystemConfig() {
  return requestJson<SystemConfigRecord>(
    "/admin/system-config",
    {
      headers: buildAuthHeaders(),
    },
    "加载系统配置失败。",
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
    "保存系统配置失败。",
  );
}

export async function testSystemSmtpConnection(payload: Partial<SystemConfigRecord>) {
  const result = await requestJson<SmtpTestResult>(
    "/admin/system-config/test-smtp",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "SMTP 连接测试失败。",
  );

  return {
    ...result,
    message: `SMTP 连接成功：${result.host}:${result.port}${result.secure ? "（SSL/TLS）" : ""}${
      result.ignoreTlsCertificate ? "，已忽略证书校验" : ""
    }`,
  };
}

export async function testSystemMinioConnection(payload: Partial<SystemConfigRecord>) {
  return requestJson<MinioTestResult>(
    "/admin/system-config/test-minio",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "MinIO 测试失败。",
  );
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
    "加载模板列表失败。",
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
    "创建模板失败。",
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
    "发布模板失败。",
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
    "更新模板失败。",
  );
}

export async function listUsers() {
  return requestJson<UserRecord[]>(
    "/admin/users",
    {
      headers: buildAuthHeaders(),
    },
    "加载用户列表失败。",
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
    "创建用户失败。",
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
    "更新用户失败。",
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
    "重置密码失败。",
  );
}
