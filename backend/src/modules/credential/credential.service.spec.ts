import { describe, expect, it, vi } from 'vitest';
import { CredentialService } from './credential.service';

describe('CredentialService', () => {
  it('encrypts payloads on create and decrypts them on read', async () => {
    const createdAt = new Date('2026-04-17T00:00:00.000Z');
    const prismaService = {
      credential: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'cred-1',
          ownerId: 'user-1',
          ...data,
          createdAt,
          updatedAt: createdAt,
        })),
        findMany: vi.fn(async () => [
          {
            id: 'cred-1',
            name: 'GitHub',
            key: 'github',
            type: 'account',
            provider: 'github',
            description: null,
            payload: {},
            payloadCiphertext:
              prismaService.credential.create.mock.calls[0]?.[0]?.data?.payloadCiphertext,
            createdAt,
            updatedAt: createdAt,
          },
        ]),
      },
    };

    const configService = {
      get: vi.fn((_key: string, fallback?: string) => fallback ?? 'test-secret-key'),
    };

    const service = new CredentialService(prismaService as never, configService as never);

    const created = await service.create(
      {
        name: 'GitHub',
        key: 'github',
        type: 'account',
        provider: 'github',
        payload: {
          username: 'octocat',
          password: 'ghp_demo_token',
        },
      },
      { id: 'user-1' } as never,
    );

    const createdData = prismaService.credential.create.mock.calls[0][0].data as Record<
      string,
      unknown
    >;

    expect(createdData.payload).toEqual({});
    expect(String(createdData.payloadCiphertext)).toMatch(/^enc:v1:/);
    expect(created.payload.username).toBe('octocat');
    expect(created.maskedPayload?.password).not.toBe('ghp_demo_token');

    const listed = await service.findAll({ id: 'user-1' } as never);

    expect(listed[0].payload.password).toBe('ghp_demo_token');
    expect(listed[0].maskedPayload?.password).not.toBe('ghp_demo_token');
  });
});
