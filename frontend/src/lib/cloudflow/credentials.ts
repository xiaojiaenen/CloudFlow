import { buildAuthHeaders, requestJson } from "./core";
import type { CredentialRecord, CredentialUpsertPayload } from "./types";

export async function listCredentials() {
  return requestJson<CredentialRecord[]>(
    "/credentials",
    {
      headers: buildAuthHeaders(),
    },
    "Failed to load credentials.",
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
    "Failed to create the credential.",
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
    "Failed to update the credential.",
  );
}

export async function deleteCredential(id: string) {
  return requestJson<{ id: string; deleted: boolean }>(
    `/credentials/${id}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(),
    },
    "Failed to delete the credential.",
  );
}
