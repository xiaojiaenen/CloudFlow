import type { TaskExecutionRecord } from "./types";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ??
  "/api";
const WS_BASE_URL =
  (import.meta.env.VITE_WS_BASE_URL as string | undefined)?.replace(/\/$/, "") ??
  "";
const AUTH_STORAGE_KEY = "cloudflow:auth-token";

export const WORKFLOW_SAVED_EVENT = "cloudflow:workflow-saved";
export const WORKFLOW_OPEN_BLANK_EVENT = "cloudflow:open-blank-workflow";

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

export function buildAuthHeaders(headers?: HeadersInit) {
  const token = getAuthToken();
  if (!token) {
    return headers;
  }

  return {
    ...(headers ?? {}),
    Authorization: `Bearer ${token}`,
  };
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

export async function requestJson<T>(
  path: string,
  init: RequestInit | undefined,
  fallbackMessage: string,
) {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (error) {
    throw new Error(formatRequestFailure(error, fallbackMessage));
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, getHttpFallbackMessage(response.status, fallbackMessage)));
  }

  return (await response.json()) as T;
}

export async function parseErrorMessage(response: Response, fallbackMessage: string) {
  try {
    const rawText = await response.text();
    if (!rawText.trim()) {
      return fallbackMessage;
    }

    try {
      const data = JSON.parse(rawText) as {
        message?: string | string[];
        error?: string;
      };
      const message = Array.isArray(data.message) ? data.message.join(", ") : data.message;
      return message?.trim() || data.error?.trim() || fallbackMessage;
    } catch {
      return rawText.trim() || fallbackMessage;
    }
  } catch {
    return fallbackMessage;
  }
}

function formatRequestFailure(error: unknown, fallbackMessage: string) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "请求已取消，请稍后重试。";
  }

  if (error instanceof TypeError) {
    return "无法连接到后端服务，请检查服务是否已启动或网络是否可达。";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallbackMessage;
}

function getHttpFallbackMessage(status: number, fallbackMessage: string) {
  if (status === 401) {
    return "登录状态已失效，请重新登录。";
  }

  if (status === 403) {
    return "当前账号没有权限执行该操作。";
  }

  if (status === 404) {
    return "请求的资源不存在或已被删除。";
  }

  if (status === 409) {
    return "当前数据已发生变化，请刷新后重试。";
  }

  if (status === 422) {
    return "提交的数据格式不正确，请检查后重试。";
  }

  if (status >= 500) {
    return "后端服务暂时不可用，请稍后重试。";
  }

  return fallbackMessage;
}
