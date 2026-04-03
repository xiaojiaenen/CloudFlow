export interface TaskExecutionPolicySnapshot {
  screenshotIntervalMs: number;
  globalTaskConcurrency: number;
  perUserTaskConcurrency: number;
  manualTaskPriority: number;
  scheduledTaskPriority: number;
}

export const DEFAULT_TASK_EXECUTION_POLICY: TaskExecutionPolicySnapshot = {
  screenshotIntervalMs: 500,
  globalTaskConcurrency: 2,
  perUserTaskConcurrency: 1,
  manualTaskPriority: 1,
  scheduledTaskPriority: 10,
};
