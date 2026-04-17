import { buildAuthHeaders, requestJson } from "./core";
import type { CredentialRecord, CredentialUpsertPayload } from "./types";

export async function listCredentials() {
  return requestJson<CredentialRecord[]>(
    "/credentials",
    {
      headers: buildAuthHeaders(),
    },
    "加载凭据列表失败。",
  );
}

export async function createCredential(payload: CredentialUpsertPayload) {
  return requestJson<CredentialRecord>(
    "/credentials",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "创建凭据失败。",
  );
}

export async function updateCredential(id: string, payload: CredentialUpsertPayload) {
  return requestJson<CredentialRecord>(
    `/credentials/${id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify(payload),
    },
    "更新凭据失败。",
  );
}

export async function deleteCredential(id: string) {
  return requestJson<{ id: string; deleted: boolean }>(
    `/credentials/${id}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(),
    },
    "删除凭据失败。",
  );
}
