import { buildAuthHeaders, requestJson } from "./core";
import type {
  RecorderFinishResult,
  RecorderSessionSnapshot,
} from "./types";

export async function createRecorderSession(payload: {
  url?: string;
  name?: string;
}) {
  return requestJson<RecorderSessionSnapshot>(
    "/recorder/sessions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "创建录制会话失败。",
  );
}

export async function getRecorderSession(sessionId: string) {
  return requestJson<RecorderSessionSnapshot>(
    `/recorder/sessions/${sessionId}`,
    {
      headers: buildAuthHeaders(),
    },
    "加载录制会话失败。",
  );
}

export async function navigateRecorderSession(sessionId: string, payload: { url: string }) {
  return requestJson<{ ok: boolean; pageUrl?: string }>(
    `/recorder/sessions/${sessionId}/navigate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "录制器页面跳转失败。",
  );
}

export async function clickRecorderSession(
  sessionId: string,
  payload: { xRatio: number; yRatio: number },
) {
  return requestJson<{ ok: boolean; pageUrl?: string }>(
    `/recorder/sessions/${sessionId}/click`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "录制点击失败。",
  );
}

export async function inputRecorderSession(
  sessionId: string,
  payload: { xRatio: number; yRatio: number; value: string },
) {
  return requestJson<{ ok: boolean; pageUrl?: string }>(
    `/recorder/sessions/${sessionId}/input`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "录制输入失败。",
  );
}

export async function pressKeyRecorderSession(
  sessionId: string,
  payload: { key: string },
) {
  return requestJson<{ ok: boolean; pageUrl?: string }>(
    `/recorder/sessions/${sessionId}/press-key`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "录制按键失败。",
  );
}

export async function scrollRecorderSession(
  sessionId: string,
  payload: { direction: "up" | "down" | "top" | "bottom"; distance?: number },
) {
  return requestJson<{ ok: boolean; pageUrl?: string }>(
    `/recorder/sessions/${sessionId}/scroll`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "录制滚动失败。",
  );
}

export async function finishRecorderSession(
  sessionId: string,
  payload?: { name?: string },
) {
  return requestJson<RecorderFinishResult>(
    `/recorder/sessions/${sessionId}/finish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload ?? {}),
    },
    "结束录制失败。",
  );
}

export async function closeRecorderSession(sessionId: string) {
  return requestJson<{ ok: boolean; sessionId: string }>(
    `/recorder/sessions/${sessionId}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(),
    },
    "关闭录制会话失败。",
  );
}
