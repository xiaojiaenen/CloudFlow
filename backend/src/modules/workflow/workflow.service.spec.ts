import { describe, expect, it, vi } from 'vitest';
import { WorkflowService } from './workflow.service';

describe('WorkflowService', () => {
  it('stores installedFromTemplateId and increments template install count on create', async () => {
    const createdWorkflow = {
      id: 'wf-1',
      ownerId: 'user-1',
      installedFromTemplateId: 'tpl-1',
      name: 'Installed workflow',
      description: 'Imported from store',
      definition: { nodes: [] },
      status: 'active',
      scheduleEnabled: false,
      scheduleCron: null,
      scheduleTimezone: null,
      alertEmail: null,
      alertOnFailure: false,
      alertOnSuccess: false,
    };

    const tx = {
      workflow: {
        create: vi.fn(async () => createdWorkflow),
      },
      workflowTemplate: {
        update: vi.fn(async () => ({ id: 'tpl-1' })),
      },
    };

    const prismaService = {
      workflowTemplate: {
        findFirst: vi.fn(async () => ({ id: 'tpl-1' })),
      },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    const queueService = {
      validateWorkflowSchedule: vi.fn(async () => undefined),
      syncWorkflowSchedule: vi.fn(async () => undefined),
    };

    const service = new WorkflowService(prismaService as never, queueService as never);

    const workflow = await service.create(
      {
        name: 'Installed workflow',
        description: 'Imported from store',
        installedFromTemplateId: 'tpl-1',
        definition: { nodes: [] },
      } as never,
      { id: 'user-1', role: 'user' } as never,
    );

    expect(prismaService.workflowTemplate.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'tpl-1',
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    expect(tx.workflow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: 'user-1',
        installedFromTemplateId: 'tpl-1',
      }),
    });
    expect(tx.workflowTemplate.update).toHaveBeenCalledWith({
      where: {
        id: 'tpl-1',
      },
      data: {
        installCount: {
          increment: 1,
        },
      },
    });
    expect(queueService.syncWorkflowSchedule).toHaveBeenCalledWith(createdWorkflow);
    expect(workflow.installedFromTemplateId).toBe('tpl-1');
  });
});
