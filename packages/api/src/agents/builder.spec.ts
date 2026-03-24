import { SystemRoles, Tools } from 'librechat-data-provider';
import type { AgentCreateParams, AgentUpdateParams } from 'librechat-data-provider';
import {
  mergeAgentBuilderTools,
  sanitizeAgentCreatePayload,
  sanitizeAgentUpdatePayload,
} from './builder';

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
      tools: ['execute_code'],
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
      tools: ['execute_code'],
    });
  });
});

describe('mergeAgentBuilderTools', () => {
  it('preserves all requested tools for admins', () => {
    expect(
      mergeAgentBuilderTools({
        requestedTools: [Tools.execute_code, Tools.file_search, 'search_mcp_docs'],
        role: SystemRoles.ADMIN,
      }),
    ).toEqual([Tools.execute_code, Tools.file_search, 'search_mcp_docs']);
  });

  it('allows non-admin users to enable file_search without touching other existing tools', () => {
    expect(
      mergeAgentBuilderTools({
        requestedTools: [Tools.file_search],
        existingTools: [Tools.execute_code, 'search_mcp_docs'],
        role: SystemRoles.USER,
      }),
    ).toEqual([Tools.execute_code, 'search_mcp_docs', Tools.file_search]);
  });

  it('allows non-admin users to disable file_search without touching other existing tools', () => {
    expect(
      mergeAgentBuilderTools({
        requestedTools: [],
        existingTools: [Tools.execute_code, Tools.file_search, 'search_mcp_docs'],
        role: SystemRoles.USER,
      }),
    ).toEqual([Tools.execute_code, 'search_mcp_docs']);
  });

  it('ignores non-file-search tool requests from non-admin users', () => {
    expect(
      mergeAgentBuilderTools({
        requestedTools: [Tools.execute_code, 'search_mcp_docs'],
        existingTools: [Tools.execute_code],
        role: SystemRoles.USER,
      }),
    ).toEqual([Tools.execute_code]);
  });

  it('returns undefined for non-admin users when tools were not part of the payload', () => {
    expect(
      mergeAgentBuilderTools({
        existingTools: [Tools.file_search],
        role: SystemRoles.USER,
      }),
    ).toBeUndefined();
  });
});
