import { BadRequestException } from '@nestjs/common';
import {
  WorkflowCredentialRequirement,
  WorkflowDefinition,
  WorkflowInputField,
} from '../types/workflow.types';

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
      throw new BadRequestException(`运行参数“${field.label}”不能为空`);
    }

    if (
      field.type === 'select' &&
      normalizedValue &&
      field.options?.length &&
      !field.options.some((option) => option.value === normalizedValue)
    ) {
      throw new BadRequestException(`运行参数“${field.label}”的值不合法`);
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

export function buildWorkflowExecutionSnapshot(
  definition: WorkflowDefinition,
  runtimeInputs: Record<string, string>,
  inputSchema: WorkflowInputField[] = definition.inputSchema ?? [],
  credentialRequirements: WorkflowCredentialRequirement[] =
    definition.credentialRequirements ?? [],
): WorkflowDefinition {
  const { maskedInputs } = resolveWorkflowRuntimeInputs(inputSchema, runtimeInputs);

  return {
    ...definition,
    inputSchema,
    credentialRequirements,
    runtime: {
      inputs: runtimeInputs,
      maskedInputs,
    },
  };
}
