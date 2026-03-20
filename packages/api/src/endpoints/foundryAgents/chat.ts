import type { RunCompletionUsage, ThreadMessage } from '@azure/ai-agents';
import { getFoundryAgentsClient } from './initialize';
import {
  extractFoundryResponseText,
  normalizeFoundryMessagesForProcessing,
  type FoundryProcessableThreadMessage,
} from './messages';

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

function getMessageCreatedAtValue(message: ThreadMessage): number {
  return message.createdAt instanceof Date ? message.createdAt.getTime() : 0;
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

  if (attachments?.some((attachment) => attachment?.file_id)) {
    throw new Error('Foundry Agents MVP does not support file attachments yet.');
  }

  const client = getFoundryAgentsClient();
  const assistant = await client.getAgent(assistantId);
  const currentThreadId = threadId ?? (await client.threads.create()).id;

  await client.messages.create(currentThreadId, 'user', text);

  const run = await client.runs.createAndPoll(currentThreadId, assistantId, {
    pollingOptions: {
      intervalInMs: 1000,
    },
    instructions: instructions ?? undefined,
    additionalInstructions: additionalInstructions ?? undefined,
  });

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
