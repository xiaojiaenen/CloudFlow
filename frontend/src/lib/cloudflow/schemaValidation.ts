import type {
  WorkflowCredentialRequirement,
  WorkflowInputField,
  WorkflowInputFieldOption,
} from "./types";

export interface WorkflowSchemaValidationResult {
  hasErrors: boolean;
  totalIssues: number;
  messages: string[];
  inputFieldIssues: Record<number, string[]>;
  credentialRequirementIssues: Record<number, string[]>;
}

function isBlank(value?: string) {
  return !value?.trim();
}

function pushIssue(target: Record<number, string[]>, index: number, message: string) {
  target[index] = [...(target[index] ?? []), message];
}

function collectDuplicateValues(values: string[]) {
  const counts = new Map<string, number>();

  values.forEach((value) => {
    if (!value.trim()) {
      return;
    }

    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([value]) => value),
  );
}

function getInputDisplayName(field: WorkflowInputField, index: number) {
  return field.label?.trim() || field.key?.trim() || `参数 ${index + 1}`;
}

function getCredentialDisplayName(requirement: WorkflowCredentialRequirement, index: number) {
  return requirement.label?.trim() || requirement.key?.trim() || `凭据需求 ${index + 1}`;
}

function validateSelectOptions(
  field: WorkflowInputField,
  index: number,
  issues: Record<number, string[]>,
) {
  const options = field.options ?? [];
  if (options.length === 0) {
    pushIssue(issues, index, "下拉参数至少需要 1 个选项。");
    return;
  }

  const duplicateOptionValues = collectDuplicateValues(
    options.map((option) => option.value ?? ""),
  );

  options.forEach((option: WorkflowInputFieldOption, optionIndex) => {
    if (isBlank(option.label)) {
      pushIssue(issues, index, `第 ${optionIndex + 1} 个选项的显示名不能为空。`);
    }

    if (isBlank(option.value)) {
      pushIssue(issues, index, `第 ${optionIndex + 1} 个选项的实际值不能为空。`);
      return;
    }

    if (duplicateOptionValues.has(option.value)) {
      pushIssue(issues, index, `选项值“${option.value}”重复，用户无法准确区分。`);
    }
  });

  if (
    field.defaultValue &&
    !options.some((option) => option.value === field.defaultValue)
  ) {
    pushIssue(issues, index, "默认值不在下拉选项里。");
  }
}

export function validateWorkflowSchema(
  inputSchema: WorkflowInputField[],
  credentialRequirements: WorkflowCredentialRequirement[],
): WorkflowSchemaValidationResult {
  const inputFieldIssues: Record<number, string[]> = {};
  const credentialRequirementIssues: Record<number, string[]> = {};
  const messages: string[] = [];

  const duplicateInputKeys = collectDuplicateValues(inputSchema.map((field) => field.key ?? ""));
  const duplicateCredentialKeys = collectDuplicateValues(
    credentialRequirements.map((item) => item.key ?? ""),
  );

  inputSchema.forEach((field, index) => {
    if (isBlank(field.label)) {
      pushIssue(inputFieldIssues, index, "参数标题不能为空。");
    }

    if (isBlank(field.key)) {
      pushIssue(inputFieldIssues, index, "参数 key 不能为空。");
    } else if (duplicateInputKeys.has(field.key)) {
      pushIssue(inputFieldIssues, index, `参数 key “${field.key}”重复。`);
    }

    if (field.type === "select") {
      validateSelectOptions(field, index, inputFieldIssues);
    }

    if (inputFieldIssues[index]?.length) {
      messages.push(`${getInputDisplayName(field, index)}：${inputFieldIssues[index][0]}`);
    }
  });

  credentialRequirements.forEach((requirement, index) => {
    if (isBlank(requirement.label)) {
      pushIssue(credentialRequirementIssues, index, "凭据标题不能为空。");
    }

    if (isBlank(requirement.key)) {
      pushIssue(credentialRequirementIssues, index, "凭据 key 不能为空。");
    } else if (duplicateCredentialKeys.has(requirement.key)) {
      pushIssue(credentialRequirementIssues, index, `凭据 key “${requirement.key}”重复。`);
    }

    if (credentialRequirementIssues[index]?.length) {
      messages.push(
        `${getCredentialDisplayName(requirement, index)}：${credentialRequirementIssues[index][0]}`,
      );
    }
  });

  const totalIssues =
    Object.values(inputFieldIssues).reduce((sum, current) => sum + current.length, 0) +
    Object.values(credentialRequirementIssues).reduce((sum, current) => sum + current.length, 0);

  return {
    hasErrors: totalIssues > 0,
    totalIssues,
    messages,
    inputFieldIssues,
    credentialRequirementIssues,
  };
}
