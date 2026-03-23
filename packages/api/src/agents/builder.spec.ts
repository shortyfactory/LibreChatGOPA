import { SystemRoles } from 'librechat-data-provider';
import type { AgentCreateParams, AgentUpdateParams } from 'librechat-data-provider';
import { sanitizeAgentCreatePayload, sanitizeAgentUpdatePayload } from './builder';

describe('sanitizeAgentCreatePayload', () => {
  it('keeps admin-only fields for admins', () => {
    const payload: AgentCreateParams = {
      name: 'Agent',
      description: 'Description',
      instructions: 'Instructions',
      provider: 'openAI',
      model: 'gpt-5',
      category: 'general_support',
      tools: ['execute_code'],
      artifacts: 'default',
      support_contact: { name: 'Support', email: 'support@example.com' },
      model_parameters: { temperature: 0.2 },
    };

    expect(sanitizeAgentCreatePayload(payload, SystemRoles.ADMIN)).toEqual(payload);
  });

  it('removes admin-only fields for non-admin users', () => {
    const payload: AgentCreateParams = {
      name: 'Agent',
      description: 'Description',
      instructions: 'Instructions',
      provider: 'openAI',
      model: 'gpt-5',
      category: 'general_support',
      tools: ['execute_code'],
      artifacts: 'default',
      support_contact: { name: 'Support', email: 'support@example.com' },
      model_parameters: { temperature: 0.2 },
    };

    expect(sanitizeAgentCreatePayload(payload, SystemRoles.USER)).toEqual({
      name: 'Agent',
      description: 'Description',
      instructions: 'Instructions',
      provider: 'openAI',
      model: 'gpt-5',
      category: 'general_support',
    });
  });
});

describe('sanitizeAgentUpdatePayload', () => {
  it('keeps admin-only fields for admins', () => {
    const payload: AgentUpdateParams = {
      name: 'Updated Agent',
      description: 'Updated description',
      instructions: 'Updated instructions',
      category: 'general_support',
      provider: 'openAI',
      model: 'gpt-5',
      tools: ['execute_code'],
      artifacts: 'default',
      avatar: null,
      support_contact: { name: 'Support', email: 'support@example.com' },
      model_parameters: { temperature: 0.2 },
    };

    expect(sanitizeAgentUpdatePayload(payload, SystemRoles.ADMIN)).toEqual(payload);
  });

  it('removes admin-only fields for non-admin users while preserving editable fields', () => {
    const payload: AgentUpdateParams = {
      name: 'Updated Agent',
      description: 'Updated description',
      instructions: 'Updated instructions',
      category: 'general_support',
      provider: 'openAI',
      model: 'gpt-5',
      tools: ['execute_code'],
      artifacts: 'default',
      avatar: null,
      support_contact: { name: 'Support', email: 'support@example.com' },
      model_parameters: { temperature: 0.2 },
    };

    expect(sanitizeAgentUpdatePayload(payload, SystemRoles.USER)).toEqual({
      name: 'Updated Agent',
      description: 'Updated description',
      instructions: 'Updated instructions',
      category: 'general_support',
      avatar: null,
    });
  });
});
