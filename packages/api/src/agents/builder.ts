import { SystemRoles } from 'librechat-data-provider';
import type { AgentCreateParams, AgentUpdateParams } from 'librechat-data-provider';

const nonAdminCreateKeys = [
  'name',
  'description',
  'instructions',
  'provider',
  'model',
  'category',
] as const satisfies readonly (keyof AgentCreateParams)[];

const nonAdminUpdateKeys = [
  'name',
  'description',
  'instructions',
  'category',
  'avatar',
] as const satisfies readonly (keyof AgentUpdateParams)[];

const isAdminAgentBuilderUser = (role?: string | null): boolean => role === SystemRoles.ADMIN;

const pickAllowedKeys = <T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Pick<T, K> => {
  const result = {} as Pick<T, K>;

  for (const key of keys) {
    if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }

  return result;
};

export const sanitizeAgentCreatePayload = (
  payload: AgentCreateParams,
  role?: string | null,
): Partial<AgentCreateParams> => {
  if (isAdminAgentBuilderUser(role)) {
    return payload;
  }

  return pickAllowedKeys(payload, nonAdminCreateKeys);
};

export const sanitizeAgentUpdatePayload = (
  payload: AgentUpdateParams,
  role?: string | null,
): Partial<AgentUpdateParams> => {
  if (isAdminAgentBuilderUser(role)) {
    return payload;
  }

  return pickAllowedKeys(payload, nonAdminUpdateKeys);
};
