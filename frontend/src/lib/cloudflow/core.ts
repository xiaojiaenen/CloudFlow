import type { TaskExecutionRecord } from "./types";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:3001/api";
const WS_BASE_URL =
  (import.meta.env.VITE_WS_BASE_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:3001";
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
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, fallbackMessage));
  }

  return (await response.json()) as T;
}

export async function parseErrorMessage(response: Response, fallbackMessage: string) {
  try {
    const data = (await response.json()) as { message?: string | string[] };
    const message = Array.isArray(data.message) ? data.message.join(", ") : data.message;
    return message?.trim() || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}
