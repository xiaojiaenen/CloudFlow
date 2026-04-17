import { describe, expect, it } from 'vitest';
import {
  resolveWorkflowCredentialBindings,
  resolveWorkflowRuntimeInputs,
} from './workflow-runtime';

describe('workflow-runtime', () => {
  it('masks sensitive runtime inputs', () => {
    const result = resolveWorkflowRuntimeInputs(
      [
        {
          key: 'password',
          label: 'Password',
          type: 'password',
          required: true,
          sensitive: true,
        },
      ],
      {
        password: 'secret-123',
      },
    );

    expect(result.inputs.password).toBe('secret-123');
    expect(result.maskedInputs.password).not.toBe('secret-123');
    expect(result.maskedInputs.password.endsWith('23')).toBe(true);
  });

  it('normalizes credential payload aliases and builds masked runtime bindings', () => {
    const result = resolveWorkflowCredentialBindings(
      [
        {
          key: 'account',
          label: 'Account',
          type: 'account',
          required: true,
          provider: 'github',
        },
      ],
      {
        account: 'cred-1',
      },
      [
        {
          id: 'cred-1',
          name: 'GitHub Login',
          type: 'account',
          provider: 'github',
          payload: {
            username: 'octocat',
            password: 'token-123456',
          },
        },
      ],
    );

    expect(result.bindings.account).toBe('cred-1');
    expect(result.credentials.account.user).toBe('octocat');
    expect(result.credentials.account.secret).toBe('token-123456');
    expect(result.maskedCredentials.account.secret).not.toBe('token-123456');
    expect(result.credentialMetadata.account.provider).toBe('github');
  });
});
