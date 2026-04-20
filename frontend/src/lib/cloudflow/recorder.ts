import { buildAuthHeaders, requestJson } from "./core";
import type {
  RecorderExtractSuggestion,
  RecorderFinishResult,
  RecorderPrecheckIssue,
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
  return requestJson<{ ok: boolean; pageUrl?: string; snapshot?: RecorderSessionSnapshot }>(
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
  return requestJson<{ ok: boolean; pageUrl?: string; snapshot?: RecorderSessionSnapshot }>(
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
  return requestJson<{ ok: boolean; pageUrl?: string; snapshot?: RecorderSessionSnapshot }>(
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
  return requestJson<{ ok: boolean; pageUrl?: string; snapshot?: RecorderSessionSnapshot }>(
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
  return requestJson<{ ok: boolean; pageUrl?: string; snapshot?: RecorderSessionSnapshot }>(
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

export async function updateRecorderSessionAction(
  sessionId: string,
  actionId: string,
  payload: {
    label?: string;
    selector?: string;
    value?: string;
    url?: string;
    key?: string;
    direction?: "up" | "down" | "top" | "bottom";
    distance?: number;
    useRuntimeInput?: boolean;
    parameterKey?: string;
    parameterLabel?: string;
    parameterDescription?: string;
  },
) {
  return requestJson<{ ok: boolean; pageUrl?: string; snapshot?: RecorderSessionSnapshot }>(
    `/recorder/sessions/${sessionId}/actions/${actionId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "更新录制步骤失败。",
  );
}

export async function moveRecorderSessionAction(
  sessionId: string,
  actionId: string,
  payload: { direction: "up" | "down" },
) {
  return requestJson<{ ok: boolean; pageUrl?: string; snapshot?: RecorderSessionSnapshot }>(
    `/recorder/sessions/${sessionId}/actions/${actionId}/move`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "调整录制步骤顺序失败。",
  );
}

export async function deleteRecorderSessionAction(sessionId: string, actionId: string) {
  return requestJson<{ ok: boolean; pageUrl?: string; snapshot?: RecorderSessionSnapshot }>(
    `/recorder/sessions/${sessionId}/actions/${actionId}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(),
    },
    "删除录制步骤失败。",
  );
}

export async function clearRecorderSessionActions(sessionId: string) {
  return requestJson<{ ok: boolean; pageUrl?: string; snapshot?: RecorderSessionSnapshot }>(
    `/recorder/sessions/${sessionId}/actions`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(),
    },
    "清空录制步骤失败。",
  );
}

export async function resumeRecorderSessionFromAction(sessionId: string, actionId: string) {
  return requestJson<{ ok: boolean; pageUrl?: string; snapshot?: RecorderSessionSnapshot }>(
    `/recorder/sessions/${sessionId}/actions/${actionId}/resume`,
    {
      method: "POST",
      headers: buildAuthHeaders(),
    },
    "断点重录失败。",
  );
}

export async function analyzeRecorderSession(sessionId: string) {
  return requestJson<{
    ok: boolean;
    sessionId: string;
    suggestions?: RecorderExtractSuggestion[];
    snapshot?: RecorderSessionSnapshot;
  }>(
    `/recorder/sessions/${sessionId}/analyze`,
    {
      method: "POST",
      headers: buildAuthHeaders(),
    },
    "智能提取分析失败。",
  );
}

export async function precheckRecorderSession(sessionId: string) {
  return requestJson<{
    ok: boolean;
    sessionId: string;
    precheckIssues?: RecorderPrecheckIssue[];
    snapshot?: RecorderSessionSnapshot;
  }>(
    `/recorder/sessions/${sessionId}/precheck`,
    {
      method: "POST",
      headers: buildAuthHeaders(),
    },
    "录制预检失败。",
  );
}

export async function finishRecorderSession(
  sessionId: string,
  payload?: { name?: string; mode?: "workflow" | "template" },
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
