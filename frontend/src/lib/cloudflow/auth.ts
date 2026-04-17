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
    "Login failed.",
  );
}

export async function getCurrentUser() {
  return requestJson<UserRecord>(
    "/auth/me",
    {
      headers: buildAuthHeaders(),
    },
    "Failed to load the current user.",
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
    "Failed to update the profile.",
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
    "Failed to change the password.",
  );
}
