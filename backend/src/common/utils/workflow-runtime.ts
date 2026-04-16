import { BadRequestException } from '@nestjs/common';
import {
  WorkflowCredentialRequirement,
  WorkflowCredentialRequirementType,
  WorkflowDefinition,
  WorkflowInputField,
  WorkflowRuntimeCredentialMeta,
} from '../types/workflow.types';

export interface ResolvableCredentialRecord {
  id: string;
  name: string;
  type: string;
  provider?: string | null;
  payload: unknown;
}

function normalizeInputValue(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function maskInputValue(value: string) {
  if (!value) {
    return '';
  }

  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }

  return `${'*'.repeat(Math.max(4, value.length - 2))}${value.slice(-2)}`;
}

function normalizeCredentialType(
  value: string,
): WorkflowCredentialRequirementType {
  if (['account', 'api_key', 'cookie', 'smtp', 'custom'].includes(value)) {
    return value as WorkflowCredentialRequirementType;
  }

  return 'custom';
}

function normalizeCredentialPayload(payload: unknown) {
  const entries =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? Object.entries(payload as Record<string, unknown>)
      : [];

  const normalized = entries.reduce<Record<string, string>>((acc, [key, value]) => {
    if (!key.trim()) {
      return acc;
    }

    acc[key] = normalizeInputValue(value);
    return acc;
  }, {});

  if (normalized.username && !normalized.user) {
    normalized.user = normalized.username;
  }

  if (normalized.user && !normalized.username) {
    normalized.username = normalized.user;
  }

  if (normalized.password && !normalized.pass) {
    normalized.pass = normalized.password;
  }

  if (normalized.pass && !normalized.password) {
    normalized.password = normalized.pass;
  }

  if (normalized.apiKey) {
    normalized.value = normalized.value || normalized.apiKey;
    normalized.secret = normalized.secret || normalized.apiKey;
  }

  if (normalized.cookie) {
    normalized.value = normalized.value || normalized.cookie;
    normalized.secret = normalized.secret || normalized.cookie;
  }

  if (normalized.password) {
    normalized.secret = normalized.secret || normalized.password;
  }

  if (normalized.pass) {
    normalized.secret = normalized.secret || normalized.pass;
  }

  return normalized;
}

function buildMaskedCredentialPayload(payload: Record<string, string>) {
  return Object.entries(payload).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = maskInputValue(value);
    return acc;
  }, {});
}

function ensureCredentialMatchesRequirement(
  requirement: WorkflowCredentialRequirement,
  credential: ResolvableCredentialRecord,
) {
  const credentialType = normalizeCredentialType(credential.type);

  if (requirement.type !== 'custom' && credentialType !== requirement.type) {
    throw new BadRequestException(
      `凭据“${credential.name}”类型不匹配，要求为 ${requirement.type}。`,
    );
  }

  const expectedProvider = requirement.provider?.trim().toLowerCase();
  const actualProvider = credential.provider?.trim().toLowerCase();

  if (expectedProvider && actualProvider && expectedProvider !== actualProvider) {
    throw new BadRequestException(
      `凭据“${credential.name}”提供方不匹配，要求为 ${requirement.provider}。`,
    );
  }
}

export function resolveWorkflowRuntimeInputs(
  inputSchema: WorkflowInputField[] = [],
  providedInputs?: Record<string, unknown>,
) {
  const runtimeInputs: Record<string, string> = {};
  const maskedInputs: Record<string, string> = {};

  for (const field of inputSchema) {
    const rawValue = providedInputs?.[field.key];
    const normalizedValue =
      normalizeInputValue(rawValue) || normalizeInputValue(field.defaultValue);

    if (field.required && !normalizedValue.trim()) {
      throw new BadRequestException(`运行参数“${field.label}”不能为空。`);
    }

    if (
      field.type === 'select' &&
      normalizedValue &&
      field.options?.length &&
      !field.options.some((option) => option.value === normalizedValue)
    ) {
      throw new BadRequestException(`运行参数“${field.label}”的值不在可选范围内。`);
    }

    runtimeInputs[field.key] = normalizedValue;
    maskedInputs[field.key] = field.sensitive
      ? maskInputValue(normalizedValue)
      : normalizedValue;
  }

  return {
    inputs: runtimeInputs,
    maskedInputs,
  };
}

export function resolveWorkflowCredentialBindings(
  credentialRequirements: WorkflowCredentialRequirement[] = [],
  providedBindings?: Record<string, unknown>,
  availableCredentials: ResolvableCredentialRecord[] = [],
) {
  const credentialMap = new Map(
    availableCredentials.map((credential) => [credential.id, credential]),
  );
  const bindings: Record<string, string> = {};
  const credentials: Record<string, Record<string, string>> = {};
  const maskedCredentials: Record<string, Record<string, string>> = {};
  const credentialMetadata: Record<string, WorkflowRuntimeCredentialMeta> = {};

  for (const requirement of credentialRequirements) {
    const bindingId = normalizeInputValue(providedBindings?.[requirement.key]).trim();

    if (!bindingId) {
      if (requirement.required) {
        throw new BadRequestException(`请先为“${requirement.label}”选择凭据。`);
      }
      continue;
    }

    const credential = credentialMap.get(bindingId);
    if (!credential) {
      throw new BadRequestException(
        `绑定到“${requirement.label}”的凭据不存在，可能已经被删除。`,
      );
    }

    ensureCredentialMatchesRequirement(requirement, credential);

    const normalizedPayload = normalizeCredentialPayload(credential.payload);
    if (requirement.required && Object.keys(normalizedPayload).length === 0) {
      throw new BadRequestException(`凭据“${credential.name}”内容为空，无法用于运行。`);
    }

    bindings[requirement.key] = credential.id;
    credentials[requirement.key] = normalizedPayload;
    maskedCredentials[requirement.key] =
      buildMaskedCredentialPayload(normalizedPayload);
    credentialMetadata[requirement.key] = {
      credentialId: credential.id,
      credentialName: credential.name,
      type: normalizeCredentialType(credential.type),
      provider: credential.provider?.trim() || undefined,
    };
  }

  return {
    bindings,
    credentials,
    maskedCredentials,
    credentialMetadata,
  };
}

export function buildWorkflowExecutionSnapshot(
  definition: WorkflowDefinition,
  runtimeInputs: Record<string, string>,
  inputSchema: WorkflowInputField[] = definition.inputSchema ?? [],
  credentialRequirements: WorkflowCredentialRequirement[] =
    definition.credentialRequirements ?? [],
  runtimeCredentials?: {
    bindings?: Record<string, string>;
    maskedCredentials?: Record<string, Record<string, string>>;
    credentialMetadata?: Record<string, WorkflowRuntimeCredentialMeta>;
  },
): WorkflowDefinition {
  const { maskedInputs } = resolveWorkflowRuntimeInputs(inputSchema, runtimeInputs);

  return {
    ...definition,
    inputSchema,
    credentialRequirements,
    runtime: {
      inputs: runtimeInputs,
      maskedInputs,
      credentialBindings: runtimeCredentials?.bindings ?? {},
      maskedCredentials: runtimeCredentials?.maskedCredentials ?? {},
      credentialMetadata: runtimeCredentials?.credentialMetadata ?? {},
    },
  };
}
