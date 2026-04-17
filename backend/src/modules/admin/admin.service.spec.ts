import { describe, expect, it, vi } from 'vitest';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  it('encrypts secret fields and records an audit entry when system config changes', async () => {
    const now = new Date('2026-04-17T00:00:00.000Z');
    const existingConfig = {
      id: 'cfg-1',
      platformName: 'CloudFlow',
      supportEmail: null,
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'demo@example.com',
      smtpPass: null,
      smtpSecure: false,
      smtpIgnoreTlsCertificate: false,
      smtpFrom: null,
      minioEndpoint: null,
      minioPort: 9000,
      minioUseSSL: false,
      minioAccessKey: null,
      minioSecretKey: null,
      minioBucket: 'cloudflow-task-artifacts',
      screenshotIntervalMs: 500,
      screenshotPersistIntervalMs: 3000,
      taskRetentionDays: 30,
      monitorPageSize: 10,
      globalTaskConcurrency: 2,
      perUserTaskConcurrency: 1,
      manualTaskPriority: 1,
      scheduledTaskPriority: 10,
      createdAt: now,
      updatedAt: now,
    };

    const prismaService = {
      systemConfig: {
        findFirst: vi.fn(async () => existingConfig),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...existingConfig,
          ...data,
          updatedAt: now,
        })),
      },
      systemConfigAudit: {
        create: vi.fn(async () => ({ id: 'audit-1' })),
      },
    };

    const configService = {
      get: vi.fn((key: string, fallback?: string) =>
        key === 'SECRET_ENCRYPTION_KEY' ? 'test-secret-key' : fallback,
      ),
    };

    const service = new AdminService(
      prismaService as never,
      {} as never,
      configService as never,
      {} as never,
      {} as never,
    );

    const updated = await service.updateSystemConfig(
      {
        smtpPass: 'smtp-password',
        minioSecretKey: 'minio-secret',
      },
      { id: 'user-1' } as never,
    );

    const updateCall = prismaService.systemConfig.update.mock.calls[0] as unknown as [
      { data: Record<string, unknown> },
    ];
    const auditCall = prismaService.systemConfigAudit.create.mock.calls[0] as unknown as [
      { data: Record<string, unknown> },
    ];

    expect(updateCall).toBeDefined();
    expect(auditCall).toBeDefined();

    const updateData = updateCall[0].data;
    const auditData = auditCall[0].data;

    expect(String(updateData.smtpPass)).toMatch(/^enc:v1:/);
    expect(String(updateData.minioSecretKey)).toMatch(/^enc:v1:/);
    expect(updated.smtpPass).toBe('smtp-password');
    expect(updated.minioSecretKey).toBe('minio-secret');
    expect(auditData.actorId).toBe('user-1');
    expect(auditData.changedFields).toEqual(['smtpPass', 'minioSecretKey']);
    expect((auditData.afterSnapshot as Record<string, string>).smtpPass).not.toBe(
      'smtp-password',
    );
  });
});
