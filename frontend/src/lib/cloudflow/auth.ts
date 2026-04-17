import { buildAuthHeaders, requestJson } from "./core";
import type { UserRecord } from "./types";

export async function login(payload: { email: string; password: string }) {
  return requestJson<{ token: string; user: UserRecord }>(
    "/auth/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "登录失败，请检查账号和密码后重试。",
  );
}

export async function getCurrentUser() {
  return requestJson<UserRecord>(
    "/auth/me",
    {
      headers: buildAuthHeaders(),
    },
    "加载当前用户信息失败。",
  );
}

export async function updateCurrentUserProfile(payload: { name: string }) {
  return requestJson<UserRecord>(
    "/auth/me",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "更新个人资料失败。",
  );
}

export async function changeCurrentUserPassword(payload: {
  currentPassword: string;
  newPassword: string;
}) {
  return requestJson<{ success: boolean }>(
    "/auth/change-password",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "修改密码失败。",
  );
}
