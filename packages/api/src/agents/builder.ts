import { SystemRoles, Tools } from 'librechat-data-provider';
import type { AgentCreateParams, AgentUpdateParams, FunctionTool } from 'librechat-data-provider';

const nonAdminCreateKeys = [
  'name',
  'description',
  'instructions',
  'provider',
  'model',
  'category',
  'tools',
] as const satisfies readonly (keyof AgentCreateParams)[];

const nonAdminUpdateKeys = [
  'name',
  'description',
  'instructions',
  'category',
  'avatar',
  'tools',
] as const satisfies readonly (keyof AgentUpdateParams)[];

const isAdminAgentBuilderUser = (role?: string | null): boolean => role === SystemRoles.ADMIN;

const getToolName = (tool: string | FunctionTool): string =>
  typeof tool === 'string' ? tool : tool.type;

const normalizeToolNames = (
  tools?: readonly (string | FunctionTool)[] | null,
): string[] | undefined => {
  if (tools == null) {
    return undefined;
  }

  return tools.reduce<string[]>((acc, tool) => {
    const toolName = getToolName(tool);

    if (!toolName || acc.includes(toolName)) {
      return acc;
    }

    acc.push(toolName);
    return acc;
  }, []);
};

export const mergeAgentBuilderTools = ({
  requestedTools,
  existingTools,
  role,
}: {
  requestedTools?: readonly (string | FunctionTool)[] | null;
  existingTools?: readonly (string | FunctionTool)[] | null;
  role?: string | null;
}): string[] | undefined => {
  const normalizedRequestedTools = normalizeToolNames(requestedTools);
  if (isAdminAgentBuilderUser(role)) {
    return normalizedRequestedTools;
  }

  if (normalizedRequestedTools === undefined) {
    return undefined;
  }

  const mergedTools = (normalizeToolNames(existingTools) ?? []).filter(
    (tool) => tool !== Tools.file_search,
  );

  if (normalizedRequestedTools.includes(Tools.file_search)) {
    mergedTools.push(Tools.file_search);
  }

  return mergedTools;
};

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
