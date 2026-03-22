import { ToolUtility } from '@azure/ai-agents';

import type {
  Agent,
  AgentThreadCreationOptions,
  FileInfo,
  MessageAttachment,
  MessageAttachmentToolDefinition,
  RunCompletionUsage,
  ToolDefinitionUnion,
  ThreadMessage,
} from '@azure/ai-agents';
import { getFoundryAgentsClient } from './initialize';
import {
  extractFoundryResponseText,
  normalizeFoundryMessagesForProcessing,
  type FoundryProcessableThreadMessage,
} from './messages';
import {
  buildFoundryRunToolDefinitions,
  buildFoundryThreadCreationOptions,
  extractFoundryProjectCodeInterpreterFileIds,
  extractFoundryProjectFileSearchVectorStoreIds,
  extractFoundryProjectToolDefinitionTools,
  getFoundryProjectAgent,
  getFoundryProjectAgentName,
  type FoundryProjectAgent,
  type FoundryProjectAgentCache,
} from './project';

export type FoundryAgentUsage = Pick<
  RunCompletionUsage,
  'completionTokens' | 'promptTokens' | 'totalTokens'
>;

export type FoundryAgentChatParams = {
  text: string;
  assistantId: string;
  threadId?: string | null;
  instructions?: string | null;
  additionalInstructions?: string | null;
  attachments?: Array<{ file_id?: string | null }> | null;
};

export type FoundryAgentChatResult = {
  runId: string;
  model: string;
  threadId: string;
  assistantId: string;
  responseText: string;
  responseMessages: FoundryProcessableThreadMessage[];
  usage: FoundryAgentUsage | null;
};

type FoundryAgentsClient = ReturnType<typeof getFoundryAgentsClient>;
type FoundryThreadClient = {
  threads: Pick<FoundryAgentsClient['threads'], 'create' | 'update'>;
};
type FoundryRunToolResources = NonNullable<AgentThreadCreationOptions['toolResources']>;
type FoundryRunOptions = {
  pollingOptions: {
    intervalInMs: number;
  };
  instructions?: string;
  additionalInstructions?: string;
  tools?: ToolDefinitionUnion[];
  toolResources?: FoundryRunToolResources;
};
type FoundryAttachmentToolType = 'code_interpreter' | 'file_search';
type FoundryToolFileSource = 'code_interpreter' | 'file_search';
type FoundryFileInfoCache = Map<string, Promise<FileInfo | null>>;
type FoundryAvailableToolFile = {
  fileId: string;
  filename: string;
  source: FoundryToolFileSource;
};

function getMessageCreatedAtValue(message: ThreadMessage): number {
  return message.createdAt instanceof Date ? message.createdAt.getTime() : 0;
}

function normalizeFoundryChatFileIds(fileIds?: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      (fileIds ?? []).filter(
        (fileId): fileId is string => typeof fileId === 'string' && !!fileId.trim(),
      ),
    ),
  );
}

function getRunErrorMessage(status: string, fallback?: string | null): string {
  if (fallback) {
    return fallback;
  }

  if (status === 'requires_action') {
    return 'Foundry Agents MVP does not support required_action tool loops yet.';
  }

  if (status === 'incomplete') {
    return 'Foundry Agents run was incomplete.';
  }

  return `Foundry Agents run ended with status "${status}".`;
}

function getFoundrySourceLabel(source: FoundryToolFileSource): string {
  return source === 'code_interpreter' ? 'Code interpreter files' : 'Knowledge files';
}

function normalizeFoundryAdditionalInstructions(
  additionalInstructions?: string | null,
): string | undefined {
  const normalizedInstructions = additionalInstructions?.trim();
  return normalizedInstructions ? normalizedInstructions : undefined;
}

async function getFoundryFileInfo({
  client,
  fileId,
  fileInfoCache,
}: {
  client: FoundryAgentsClient;
  fileId: string;
  fileInfoCache: FoundryFileInfoCache;
}): Promise<FileInfo | null> {
  const cachedFile = fileInfoCache.get(fileId);

  if (cachedFile) {
    return cachedFile;
  }

  const filePromise = client.files.get(fileId).catch(() => null);
  fileInfoCache.set(fileId, filePromise);
  return filePromise;
}

async function listFoundryVectorStoreFiles({
  client,
  vectorStoreId,
  fileInfoCache,
}: {
  client: FoundryAgentsClient;
  vectorStoreId: string;
  fileInfoCache: FoundryFileInfoCache;
}): Promise<FoundryAvailableToolFile[]> {
  const files: FoundryAvailableToolFile[] = [];

  for await (const vectorStoreFile of client.vectorStoreFiles.list(vectorStoreId)) {
    if (vectorStoreFile.status !== 'completed' || !vectorStoreFile.id?.trim()) {
      continue;
    }

    const file = await getFoundryFileInfo({
      client,
      fileId: vectorStoreFile.id,
      fileInfoCache,
    });

    if (!file?.filename?.trim()) {
      continue;
    }

    files.push({
      source: 'file_search',
      fileId: file.id,
      filename: file.filename,
    });
  }

  return files;
}

async function getFoundryAvailableToolFiles({
  client,
  assistant,
  projectAgent,
}: {
  client: FoundryAgentsClient;
  assistant: Agent;
  projectAgent: FoundryProjectAgent | null;
}): Promise<FoundryAvailableToolFile[]> {
  const projectAgentTools = extractFoundryProjectToolDefinitionTools(projectAgent);
  const codeInterpreterFileIds =
    extractFoundryProjectCodeInterpreterFileIds(projectAgentTools).length > 0
      ? extractFoundryProjectCodeInterpreterFileIds(projectAgentTools)
      : (assistant.toolResources?.codeInterpreter?.fileIds ?? []);
  const fileSearchVectorStoreIds =
    extractFoundryProjectFileSearchVectorStoreIds(projectAgentTools).length > 0
      ? extractFoundryProjectFileSearchVectorStoreIds(projectAgentTools)
      : (assistant.toolResources?.fileSearch?.vectorStoreIds ?? []);
  const fileInfoCache: FoundryFileInfoCache = new Map();
  const codeInterpreterFiles = (
    await Promise.all(
      codeInterpreterFileIds.map((fileId) =>
        getFoundryFileInfo({
          client,
          fileId,
          fileInfoCache,
        }),
      ),
    )
  )
    .filter((file): file is FileInfo => file?.filename?.trim() != null)
    .map((file) => ({
      source: 'code_interpreter' as const,
      fileId: file.id,
      filename: file.filename,
    }));
  const fileSearchFiles = (
    await Promise.all(
      fileSearchVectorStoreIds.map((vectorStoreId) =>
        listFoundryVectorStoreFiles({
          client,
          vectorStoreId,
          fileInfoCache,
        }),
      ),
    )
  ).flat();
  const filesBySourceAndId = new Map<string, FoundryAvailableToolFile>();

  for (const file of [...codeInterpreterFiles, ...fileSearchFiles]) {
    filesBySourceAndId.set(`${file.source}:${file.fileId}`, file);
  }

  return Array.from(filesBySourceAndId.values());
}

export function buildFoundryRunAdditionalInstructions({
  additionalInstructions,
  availableToolFiles,
}: {
  additionalInstructions?: string | null;
  availableToolFiles: FoundryAvailableToolFile[];
}): string | undefined {
  if (availableToolFiles.length === 0) {
    return normalizeFoundryAdditionalInstructions(additionalInstructions);
  }

  const codeInterpreterFiles = availableToolFiles.filter(
    (file) => file.source === 'code_interpreter',
  );
  const fileSearchFiles = availableToolFiles.filter((file) => file.source === 'file_search');
  const sections = [
    codeInterpreterFiles.length > 0
      ? [
          `${getFoundrySourceLabel('code_interpreter')}:`,
          ...codeInterpreterFiles.map((file) => `- ${file.filename}`),
        ].join('\n')
      : null,
    fileSearchFiles.length > 0
      ? [
          `${getFoundrySourceLabel('file_search')}:`,
          ...fileSearchFiles.map((file) => `- ${file.filename}`),
        ].join('\n')
      : null,
  ].filter((section): section is string => section !== null);
  const fileInstructions = [
    'The following files are already available to your tools for this conversation.',
    'Do not say that you cannot see attached files and do not ask the user to upload them again unless they are truly unavailable.',
    'Use these files directly when the user asks to summarize, analyze, compare, extract, or translate the attached documents.',
    'Refer to the files by their filenames only, and never expose internal file identifiers in your answer.',
    ...sections,
  ].join('\n\n');
  const instructions = [
    normalizeFoundryAdditionalInstructions(additionalInstructions),
    fileInstructions,
  ]
    .filter((instruction): instruction is string => !!instruction)
    .join('\n\n');

  return instructions || undefined;
}

export function buildFoundryRunOptions({
  instructions,
  additionalInstructions,
  availableToolFiles,
  tools,
  threadCreationOptions,
}: {
  instructions?: string | null;
  additionalInstructions?: string | null;
  availableToolFiles: FoundryAvailableToolFile[];
  tools?: ToolDefinitionUnion[];
  threadCreationOptions?: AgentThreadCreationOptions;
}): FoundryRunOptions {
  const normalizedInstructions = instructions?.trim() || undefined;
  const normalizedAdditionalInstructions = buildFoundryRunAdditionalInstructions({
    additionalInstructions,
    availableToolFiles,
  });

  return {
    pollingOptions: {
      intervalInMs: 1000,
    },
    ...(normalizedInstructions ? { instructions: normalizedInstructions } : {}),
    ...(normalizedAdditionalInstructions
      ? {
          additionalInstructions: normalizedAdditionalInstructions,
        }
      : {}),
    ...(tools?.length ? { tools } : {}),
    ...(threadCreationOptions?.toolResources
      ? {
          toolResources: threadCreationOptions.toolResources,
        }
      : {}),
  };
}

async function listRunAssistantMessages(threadId: string, runId: string): Promise<ThreadMessage[]> {
  const client = getFoundryAgentsClient();
  const messages: ThreadMessage[] = [];

  for await (const message of client.messages.list(threadId, {
    runId,
    order: 'asc',
    limit: 100,
  })) {
    if (message.role !== 'assistant') {
      continue;
    }

    messages.push(message);
  }

  messages.sort((a, b) => getMessageCreatedAtValue(a) - getMessageCreatedAtValue(b));
  return messages;
}

async function getFoundryProjectAssistantContext(assistant: Agent): Promise<{
  projectAgent: FoundryProjectAgent | null;
  threadCreationOptions: AgentThreadCreationOptions | undefined;
}> {
  const foundryAgentName = getFoundryProjectAgentName(assistant);

  if (!foundryAgentName) {
    return {
      projectAgent: null,
      threadCreationOptions: buildFoundryThreadCreationOptions({
        assistant,
        projectAgent: null,
      }),
    };
  }

  const projectAgentCache: FoundryProjectAgentCache = new Map();
  const projectAgent = await getFoundryProjectAgent({
    foundryAgentId: foundryAgentName,
    projectAgentCache,
  });

  return {
    projectAgent,
    threadCreationOptions: buildFoundryThreadCreationOptions({
      assistant,
      projectAgent,
    }),
  };
}

export async function ensureFoundryThread({
  client,
  threadId,
  threadCreationOptions,
}: {
  client: FoundryThreadClient;
  threadId?: string | null;
  threadCreationOptions?: AgentThreadCreationOptions;
}): Promise<string> {
  if (!threadId?.trim()) {
    return (await client.threads.create(threadCreationOptions)).id;
  }

  if (threadCreationOptions?.toolResources) {
    await client.threads.update(threadId, {
      toolResources: threadCreationOptions.toolResources,
    });
  }

  return threadId;
}

function addFoundryAttachmentTool(
  attachmentTools: Map<string, MessageAttachmentToolDefinition>,
  toolType: FoundryAttachmentToolType,
): void {
  if (attachmentTools.has(toolType)) {
    return;
  }

  if (toolType === 'code_interpreter') {
    attachmentTools.set(toolType, ToolUtility.createCodeInterpreterTool().definition);
    return;
  }

  attachmentTools.set(toolType, ToolUtility.createFileSearchTool().definition);
}

function upsertFoundryMessageAttachment(
  attachmentsByFileId: Map<string, Map<string, MessageAttachmentToolDefinition>>,
  fileId: string,
  toolType: FoundryAttachmentToolType,
): void {
  const attachmentTools = attachmentsByFileId.get(fileId) ?? new Map();
  addFoundryAttachmentTool(attachmentTools, toolType);
  attachmentsByFileId.set(fileId, attachmentTools);
}

async function listFoundryVectorStoreFileIds({
  client,
  vectorStoreId,
}: {
  client: FoundryAgentsClient;
  vectorStoreId: string;
}): Promise<string[]> {
  const fileIds: string[] = [];

  for await (const vectorStoreFile of client.vectorStoreFiles.list(vectorStoreId)) {
    if (vectorStoreFile.status !== 'completed' || !vectorStoreFile.id?.trim()) {
      continue;
    }

    fileIds.push(vectorStoreFile.id);
  }

  return normalizeFoundryChatFileIds(fileIds);
}

async function buildFoundryMessageAttachments({
  client,
  assistant,
  attachments,
  projectAgent,
}: {
  client: FoundryAgentsClient;
  assistant: Agent;
  attachments?: Array<{ file_id?: string | null }> | null;
  projectAgent: FoundryProjectAgent | null;
}): Promise<MessageAttachment[]> {
  const projectAgentTools = extractFoundryProjectToolDefinitionTools(projectAgent);
  const codeInterpreterFileIds =
    extractFoundryProjectCodeInterpreterFileIds(projectAgentTools).length > 0
      ? extractFoundryProjectCodeInterpreterFileIds(projectAgentTools)
      : (assistant.toolResources?.codeInterpreter?.fileIds ?? []);
  const fileSearchVectorStoreIds =
    extractFoundryProjectFileSearchVectorStoreIds(projectAgentTools).length > 0
      ? extractFoundryProjectFileSearchVectorStoreIds(projectAgentTools)
      : (assistant.toolResources?.fileSearch?.vectorStoreIds ?? []);
  const explicitFileIds = normalizeFoundryChatFileIds(
    (attachments ?? []).map((attachment) => attachment?.file_id),
  );
  const hasCodeInterpreter =
    projectAgentTools.some((tool) => tool.type === 'code_interpreter') ||
    assistant.tools.some((tool) => tool.type === 'code_interpreter') ||
    codeInterpreterFileIds.length > 0;
  const hasFileSearch =
    projectAgentTools.some((tool) => tool.type === 'file_search') ||
    assistant.tools.some((tool) => tool.type === 'file_search') ||
    fileSearchVectorStoreIds.length > 0;
  const attachmentsByFileId = new Map<string, Map<string, MessageAttachmentToolDefinition>>();

  for (const fileId of codeInterpreterFileIds) {
    upsertFoundryMessageAttachment(attachmentsByFileId, fileId, 'code_interpreter');
  }

  if (hasFileSearch) {
    const vectorStoreFileIds = (
      await Promise.all(
        fileSearchVectorStoreIds.map((vectorStoreId) =>
          listFoundryVectorStoreFileIds({
            client,
            vectorStoreId,
          }),
        ),
      )
    ).flat();

    for (const fileId of vectorStoreFileIds) {
      upsertFoundryMessageAttachment(attachmentsByFileId, fileId, 'file_search');
    }
  }

  for (const fileId of explicitFileIds) {
    if (hasCodeInterpreter) {
      upsertFoundryMessageAttachment(attachmentsByFileId, fileId, 'code_interpreter');
    }

    if (hasFileSearch) {
      upsertFoundryMessageAttachment(attachmentsByFileId, fileId, 'file_search');
    }
  }

  return Array.from(attachmentsByFileId.entries()).map(([fileId, toolDefinitions]) => ({
    fileId,
    tools: Array.from(toolDefinitions.values()),
  }));
}

export async function chatWithFoundryAgent({
  text,
  assistantId,
  threadId,
  instructions,
  additionalInstructions,
  attachments,
}: FoundryAgentChatParams): Promise<FoundryAgentChatResult> {
  if (!assistantId?.trim()) {
    throw new Error('Missing assistant_id');
  }

  if (!text?.trim()) {
    throw new Error('Foundry Agents MVP requires a text prompt.');
  }

  const client = getFoundryAgentsClient();
  const assistant = await client.getAgent(assistantId);
  const { projectAgent, threadCreationOptions } =
    await getFoundryProjectAssistantContext(assistant);
  const availableToolFiles = await getFoundryAvailableToolFiles({
    client,
    assistant,
    projectAgent,
  });
  const runTools = buildFoundryRunToolDefinitions({
    assistant,
    projectAgent,
  });
  const currentThreadId = await ensureFoundryThread({
    client,
    threadId,
    threadCreationOptions,
  });
  const messageAttachments = await buildFoundryMessageAttachments({
    client,
    assistant,
    attachments,
    projectAgent,
  });

  await client.messages.create(currentThreadId, 'user', text, {
    attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
  });

  const run = await client.runs.createAndPoll(
    currentThreadId,
    assistantId,
    buildFoundryRunOptions({
      instructions,
      additionalInstructions,
      availableToolFiles,
      tools: runTools,
      threadCreationOptions,
    }),
  );

  if (run.status !== 'completed') {
    throw new Error(getRunErrorMessage(run.status, run.lastError?.message));
  }

  const messages = await listRunAssistantMessages(currentThreadId, run.id);
  const responseMessages = normalizeFoundryMessagesForProcessing(messages);
  const responseText = extractFoundryResponseText(responseMessages);

  if (!responseText.trim()) {
    throw new Error('Foundry agent completed without returning assistant text.');
  }

  return {
    usage: run.usage
      ? {
          totalTokens: run.usage.totalTokens,
          promptTokens: run.usage.promptTokens,
          completionTokens: run.usage.completionTokens,
        }
      : null,
    responseText,
    responseMessages,
    assistantId,
    model: run.model ?? assistant.model,
    runId: run.id,
    threadId: currentThreadId,
  };
}
