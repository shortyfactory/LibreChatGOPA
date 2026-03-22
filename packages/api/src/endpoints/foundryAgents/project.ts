import { ToolUtility } from '@azure/ai-agents';
import { logger } from '@librechat/data-schemas';
import { Tools } from 'librechat-data-provider';

import type { Agent, AgentThreadCreationOptions, ToolDefinitionUnion } from '@azure/ai-agents';

import { getFoundryProjectEndpoint, getFoundryTokenCredential } from './initialize';

export type FoundryProjectAgentTool = {
  type?: string;
  function?: {
    name?: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
  container?: {
    file_ids?: string[];
    type?: string;
  };
  file_ids?: string[];
  vector_store_ids?: string[];
  vector_stores?: Array<{ id?: string } | string>;
  resources?: {
    vector_store_ids?: string[];
  };
};

export type FoundryProjectAgentDefinition = {
  model?: string;
  instructions?: string;
  tools?: FoundryProjectAgentTool[];
};

export type FoundryProjectAgentVersion = {
  id?: string;
  name?: string;
  version?: string;
  description?: string;
  created_at?: number;
  metadata?: Agent['metadata'];
  definition?: FoundryProjectAgentDefinition;
};

export type FoundryProjectAgent = {
  id?: string;
  name?: string;
  object?: string;
  versions?: {
    latest?: FoundryProjectAgentVersion;
  };
};

export type FoundryProjectAgentCache = Map<string, Promise<FoundryProjectAgent | null>>;

function normalizeFoundryProjectFileIds(fileIds?: string[]): string[] {
  if (!Array.isArray(fileIds)) {
    return [];
  }

  return Array.from(
    new Set(fileIds.filter((fileId) => typeof fileId === 'string' && fileId.trim())),
  );
}

function normalizeFoundryProjectVectorStoreIds(
  vectorStoreIds?: string[],
  vectorStores?: Array<{ id?: string } | string>,
  resourceVectorStoreIds?: string[],
): string[] {
  const idsFromVectorStores = (vectorStores ?? []).flatMap((vectorStore) => {
    if (typeof vectorStore === 'string') {
      return vectorStore.trim() ? [vectorStore] : [];
    }

    if (typeof vectorStore?.id === 'string' && vectorStore.id.trim()) {
      return [vectorStore.id];
    }

    return [];
  });

  return Array.from(
    new Set(
      [...(vectorStoreIds ?? []), ...idsFromVectorStores, ...(resourceVectorStoreIds ?? [])].filter(
        (vectorStoreId) => typeof vectorStoreId === 'string' && vectorStoreId.trim(),
      ),
    ),
  );
}

export function getFoundryProjectAgentName(agent: Agent): string | null {
  const foundryAgentId = agent.metadata?.foundry_agent_id;

  if (typeof foundryAgentId === 'string' && foundryAgentId.trim()) {
    return foundryAgentId;
  }

  if (typeof agent.name === 'string' && agent.name.trim()) {
    return agent.name;
  }

  return null;
}

export function getLatestFoundryProjectAgentVersion(
  projectAgent: FoundryProjectAgent | null,
): FoundryProjectAgentVersion | null {
  return projectAgent?.versions?.latest ?? null;
}

export function extractFoundryProjectToolDefinitionTools(
  projectAgent: FoundryProjectAgent | null,
): FoundryProjectAgentTool[] {
  return getLatestFoundryProjectAgentVersion(projectAgent)?.definition?.tools ?? [];
}

export function extractFoundryProjectCodeInterpreterFileIds(
  tools: FoundryProjectAgentTool[],
): string[] {
  return Array.from(
    new Set(
      tools.flatMap((tool) => {
        if (tool.type !== Tools.code_interpreter) {
          return [];
        }

        return normalizeFoundryProjectFileIds(tool.container?.file_ids ?? tool.file_ids);
      }),
    ),
  );
}

export function extractFoundryProjectFileSearchVectorStoreIds(
  tools: FoundryProjectAgentTool[],
): string[] {
  return Array.from(
    new Set(
      tools.flatMap((tool) => {
        if (tool.type !== Tools.file_search) {
          return [];
        }

        return normalizeFoundryProjectVectorStoreIds(
          tool.vector_store_ids,
          tool.vector_stores,
          tool.resources?.vector_store_ids,
        );
      }),
    ),
  );
}

function mapFoundryProjectToolToDefinition(
  tool: FoundryProjectAgentTool,
): ToolDefinitionUnion | null {
  if (tool.type === Tools.code_interpreter) {
    return ToolUtility.createCodeInterpreterTool().definition;
  }

  if (tool.type === Tools.file_search) {
    return ToolUtility.createFileSearchTool().definition;
  }

  if (tool.type !== Tools.function) {
    return null;
  }

  if (!tool.function?.name?.trim()) {
    return null;
  }

  return {
    type: 'function',
    function: {
      name: tool.function.name,
      ...(tool.function.description?.trim() ? { description: tool.function.description } : {}),
      parameters: tool.function.parameters ?? {
        type: 'object',
        properties: {},
      },
    },
  };
}

export function buildFoundryRunToolDefinitions({
  assistant,
  projectAgent,
}: {
  assistant: Agent;
  projectAgent: FoundryProjectAgent | null;
}): ToolDefinitionUnion[] | undefined {
  const projectAgentTools = extractFoundryProjectToolDefinitionTools(projectAgent)
    .map(mapFoundryProjectToolToDefinition)
    .filter((tool): tool is ToolDefinitionUnion => tool !== null);
  const assistantTools = assistant.tools ?? [];
  const tools = projectAgentTools.length > 0 ? projectAgentTools : assistantTools;

  if (tools.length === 0) {
    return undefined;
  }

  const seenToolKeys = new Set<string>();

  return tools.filter((tool) => {
    const toolKey =
      tool.type === 'function' && 'function' in tool
        ? `${tool.type}:${tool.function.name}`
        : tool.type;

    if (seenToolKeys.has(toolKey)) {
      return false;
    }

    seenToolKeys.add(toolKey);
    return true;
  });
}

export async function getFoundryProjectAgent({
  foundryAgentId,
  projectAgentCache,
}: {
  foundryAgentId: string;
  projectAgentCache: FoundryProjectAgentCache;
}): Promise<FoundryProjectAgent | null> {
  const cachedProjectAgent = projectAgentCache.get(foundryAgentId);

  if (cachedProjectAgent) {
    return cachedProjectAgent;
  }

  const projectAgentPromise = (async () => {
    const endpoint = getFoundryProjectEndpoint();

    if (!endpoint) {
      throw new Error('Foundry project endpoint is not configured.');
    }

    const token = await getFoundryTokenCredential().getToken('https://ai.azure.com/.default');

    if (!token?.token) {
      throw new Error('Foundry token credential did not return an access token.');
    }

    const response = await fetch(
      `${endpoint}/agents/${encodeURIComponent(foundryAgentId)}?api-version=v1`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token.token}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Unexpected status ${String(response.status)}`);
    }

    return (await response.json()) as FoundryProjectAgent;
  })().catch((error: unknown) => {
    logger.warn('[foundryProject] Failed to retrieve Foundry project agent details', {
      foundryAgentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  projectAgentCache.set(foundryAgentId, projectAgentPromise);
  return projectAgentPromise;
}

export function buildFoundryThreadCreationOptions({
  assistant,
  projectAgent,
}: {
  assistant: Agent;
  projectAgent: FoundryProjectAgent | null;
}): AgentThreadCreationOptions | undefined {
  const projectAgentTools = extractFoundryProjectToolDefinitionTools(projectAgent);
  const codeInterpreterFileIds =
    extractFoundryProjectCodeInterpreterFileIds(projectAgentTools).length > 0
      ? extractFoundryProjectCodeInterpreterFileIds(projectAgentTools)
      : (assistant.toolResources?.codeInterpreter?.fileIds ?? []);
  const fileSearchVectorStoreIds =
    extractFoundryProjectFileSearchVectorStoreIds(projectAgentTools).length > 0
      ? extractFoundryProjectFileSearchVectorStoreIds(projectAgentTools)
      : (assistant.toolResources?.fileSearch?.vectorStoreIds ?? []);

  if (codeInterpreterFileIds.length === 0 && fileSearchVectorStoreIds.length === 0) {
    return undefined;
  }

  return {
    toolResources: {
      ...(codeInterpreterFileIds.length > 0
        ? {
            codeInterpreter: {
              fileIds: codeInterpreterFileIds,
            },
          }
        : {}),
      ...(fileSearchVectorStoreIds.length > 0
        ? {
            fileSearch: {
              vectorStoreIds: fileSearchVectorStoreIds,
            },
          }
        : {}),
    },
  };
}
