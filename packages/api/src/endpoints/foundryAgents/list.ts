import { logger } from '@librechat/data-schemas';
import { Tools } from 'librechat-data-provider';

import type { Agent, FileInfo, ToolDefinitionUnion } from '@azure/ai-agents';
import type {
  Assistant,
  AssistantListParams,
  AssistantListResponse,
  File as AssistantFile,
  FunctionTool,
} from 'librechat-data-provider';

import { getFoundryAgentsClient } from './initialize';
import {
  extractFoundryProjectCodeInterpreterFileIds,
  extractFoundryProjectFileSearchVectorStoreIds,
  extractFoundryProjectToolDefinitionTools,
  getFoundryProjectAgent,
  getFoundryProjectAgentName,
  getLatestFoundryProjectAgentVersion,
  type FoundryProjectAgentCache,
  type FoundryProjectAgentTool,
} from './project';

type FoundryAgentsClient = ReturnType<typeof getFoundryAgentsClient>;
type ListFoundryAgentsParams = Omit<AssistantListParams, 'endpoint'>;
type AssistantFileCache = Map<string, Promise<AssistantFile | null>>;

function normalizeListLimit(limit?: number): number {
  if (limit == null || Number.isNaN(limit)) {
    return 100;
  }

  return Math.min(Math.max(limit, 1), 100);
}

function normalizeAssistantFilePurpose(purpose: FileInfo['purpose']): AssistantFile['purpose'] {
  if (purpose === 'assistants_output') {
    return purpose;
  }

  return 'assistants';
}

function mapFoundryFileToAssistantFile(file: FileInfo): AssistantFile {
  return {
    id: file.id,
    file_id: file.id,
    bytes: file.bytes,
    filename: file.filename,
    object: file.object,
    purpose: normalizeAssistantFilePurpose(file.purpose),
    created_at: Math.floor(file.createdAt.getTime() / 1000),
  };
}

async function getFoundryFileMetadata({
  client,
  fileId,
  fileCache,
}: {
  client: FoundryAgentsClient;
  fileId: string;
  fileCache: AssistantFileCache;
}): Promise<AssistantFile | null> {
  const cachedFile = fileCache.get(fileId);
  if (cachedFile) {
    return cachedFile;
  }

  const filePromise = client.files
    .get(fileId)
    .then((file) => mapFoundryFileToAssistantFile(file))
    .catch((error: unknown) => {
      logger.warn('[listFoundryAgents] Failed to retrieve Foundry file metadata', {
        fileId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

  fileCache.set(fileId, filePromise);
  return filePromise;
}

async function listFoundryVectorStoreFiles({
  client,
  vectorStoreId,
  fileCache,
}: {
  client: FoundryAgentsClient;
  vectorStoreId: string;
  fileCache: AssistantFileCache;
}): Promise<AssistantFile[]> {
  try {
    const files: AssistantFile[] = [];

    for await (const vectorStoreFile of client.vectorStoreFiles.list(vectorStoreId)) {
      if (vectorStoreFile.status !== 'completed') {
        continue;
      }

      const file = await getFoundryFileMetadata({
        client,
        fileId: vectorStoreFile.id,
        fileCache,
      });

      if (file) {
        files.push(file);
      }
    }

    return files;
  } catch (error: unknown) {
    logger.warn('[listFoundryAgents] Failed to retrieve Foundry vector store files', {
      vectorStoreId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function mapFoundryTool(tool: ToolDefinitionUnion): FunctionTool | null {
  if (tool.type === Tools.code_interpreter || tool.type === Tools.file_search) {
    return { type: tool.type };
  }

  if (tool.type === Tools.function && 'function' in tool && tool.function) {
    return {
      type: Tools.function,
      function: {
        name: tool.function.name,
        description: tool.function.description ?? '',
        parameters:
          tool.function.parameters != null && typeof tool.function.parameters === 'object'
            ? (tool.function.parameters as Record<string, unknown>)
            : {},
      },
    };
  }

  return null;
}

function mapFoundryProjectTool(tool: FoundryProjectAgentTool): FunctionTool | null {
  if (tool.type === Tools.code_interpreter || tool.type === Tools.file_search) {
    return { type: tool.type };
  }

  if (tool.type === Tools.function && tool.function?.name) {
    return {
      type: Tools.function,
      function: {
        name: tool.function.name,
        description: tool.function.description ?? '',
        parameters:
          tool.function.parameters != null && typeof tool.function.parameters === 'object'
            ? tool.function.parameters
            : {},
      },
    };
  }

  return null;
}

async function getFoundryAgentDetails({
  client,
  agent,
}: {
  client: FoundryAgentsClient;
  agent: Agent;
}): Promise<Agent> {
  try {
    return await client.getAgent(agent.id);
  } catch (error: unknown) {
    logger.warn('[listFoundryAgents] Failed to retrieve full Foundry agent details', {
      agentId: agent.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return agent;
  }
}

export async function mapFoundryAgentToAssistant({
  client,
  agent,
  fileCache,
  projectAgentCache,
}: {
  client: FoundryAgentsClient;
  agent: Agent;
  fileCache: AssistantFileCache;
  projectAgentCache: FoundryProjectAgentCache;
}): Promise<Assistant> {
  const detailedAgent = await getFoundryAgentDetails({ client, agent });
  const foundryAgentName = getFoundryProjectAgentName(detailedAgent);
  const projectAgent = foundryAgentName
    ? await getFoundryProjectAgent({
        foundryAgentId: foundryAgentName,
        projectAgentCache,
      })
    : null;
  const projectAgentTools = extractFoundryProjectToolDefinitionTools(projectAgent);
  const latestProjectAgentVersion = getLatestFoundryProjectAgentVersion(projectAgent);
  const projectCodeInterpreterFileIds =
    extractFoundryProjectCodeInterpreterFileIds(projectAgentTools);
  const projectFileSearchVectorStoreIds =
    extractFoundryProjectFileSearchVectorStoreIds(projectAgentTools);
  const codeInterpreterFileIds =
    projectCodeInterpreterFileIds.length > 0
      ? projectCodeInterpreterFileIds
      : (detailedAgent.toolResources?.codeInterpreter?.fileIds ?? []);
  const vectorStoreIds =
    projectFileSearchVectorStoreIds.length > 0
      ? projectFileSearchVectorStoreIds
      : (detailedAgent.toolResources?.fileSearch?.vectorStoreIds ?? []);
  const codeInterpreterFiles = (
    await Promise.all(
      codeInterpreterFileIds.map((fileId) =>
        getFoundryFileMetadata({
          client,
          fileId,
          fileCache,
        }),
      ),
    )
  ).filter((file): file is AssistantFile => file !== null);
  const fileSearchFiles = (
    await Promise.all(
      vectorStoreIds.map((vectorStoreId) =>
        listFoundryVectorStoreFiles({
          client,
          vectorStoreId,
          fileCache,
        }),
      ),
    )
  ).flat();
  const uniqueFileSearchFiles = Array.from(
    new Map(fileSearchFiles.map((file) => [file.file_id, file] as const)).values(),
  );
  const tools =
    projectAgentTools.length > 0
      ? projectAgentTools
          .map((tool) => mapFoundryProjectTool(tool))
          .filter((tool): tool is FunctionTool => tool !== null)
      : detailedAgent.tools
          .map((tool) => mapFoundryTool(tool))
          .filter((tool): tool is FunctionTool => tool !== null);
  const toolResources: NonNullable<Assistant['tool_resources']> = {};

  if (codeInterpreterFileIds.length > 0 || codeInterpreterFiles.length > 0) {
    toolResources.code_interpreter = {
      file_ids: codeInterpreterFileIds,
      ...(codeInterpreterFiles.length > 0 ? { files: codeInterpreterFiles } : {}),
    };
  }

  if (vectorStoreIds.length > 0 || uniqueFileSearchFiles.length > 0) {
    toolResources.file_search = {
      vector_store_ids: vectorStoreIds,
      file_ids: uniqueFileSearchFiles.map((file) => file.file_id),
      ...(uniqueFileSearchFiles.length > 0 ? { files: uniqueFileSearchFiles } : {}),
    };
  }

  return {
    id: detailedAgent.id,
    object: detailedAgent.object,
    model: latestProjectAgentVersion?.definition?.model ?? detailedAgent.model,
    name: latestProjectAgentVersion?.name ?? detailedAgent.name,
    metadata: latestProjectAgentVersion?.metadata ?? detailedAgent.metadata ?? null,
    created_at: Math.floor(detailedAgent.createdAt.getTime() / 1000),
    description: latestProjectAgentVersion?.description ?? detailedAgent.description,
    instructions: latestProjectAgentVersion?.definition?.instructions ?? detailedAgent.instructions,
    ...(tools.length > 0 ? { tools } : {}),
    ...(Object.keys(toolResources).length > 0 ? { tool_resources: toolResources } : {}),
  };
}

export async function listFoundryAgents({
  limit,
  order = 'desc',
  after,
  before,
}: ListFoundryAgentsParams = {}): Promise<AssistantListResponse> {
  const client = getFoundryAgentsClient();
  const normalizedLimit = normalizeListLimit(limit);
  const fileCache: AssistantFileCache = new Map();
  const projectAgentCache: FoundryProjectAgentCache = new Map();
  const agentTasks: Array<Promise<Assistant>> = [];

  const iterator = client.listAgents({
    order,
    after: after ?? undefined,
    before: before ?? undefined,
    limit: normalizedLimit,
  });

  for await (const agent of iterator) {
    agentTasks.push(
      mapFoundryAgentToAssistant({
        client,
        agent,
        fileCache,
        projectAgentCache,
      }),
    );

    if (agentTasks.length >= normalizedLimit) {
      break;
    }
  }

  const agents = await Promise.all(agentTasks);

  return {
    object: 'list',
    data: agents,
    has_more: false,
    first_id: agents[0]?.id ?? '',
    last_id: agents[agents.length - 1]?.id ?? '',
  };
}
