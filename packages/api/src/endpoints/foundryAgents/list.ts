import type { Agent } from '@azure/ai-agents';
import type {
  Assistant,
  AssistantListParams,
  AssistantListResponse,
} from 'librechat-data-provider';
import { getFoundryAgentsClient } from './initialize';

type ListFoundryAgentsParams = Omit<AssistantListParams, 'endpoint'>;

function normalizeListLimit(limit?: number): number {
  if (limit == null || Number.isNaN(limit)) {
    return 100;
  }

  return Math.min(Math.max(limit, 1), 100);
}

export function mapFoundryAgentToAssistant(agent: Agent): Assistant {
  return {
    id: agent.id,
    object: agent.object,
    model: agent.model,
    name: agent.name,
    metadata: agent.metadata ?? null,
    created_at: Math.floor(agent.createdAt.getTime() / 1000),
    description: agent.description,
    instructions: agent.instructions,
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
  const agents: Assistant[] = [];

  const iterator = client.listAgents({
    order,
    after: after ?? undefined,
    before: before ?? undefined,
    limit: normalizedLimit,
  });

  for await (const agent of iterator) {
    agents.push(mapFoundryAgentToAssistant(agent));

    if (agents.length >= normalizedLimit) {
      break;
    }
  }

  return {
    object: 'list',
    data: agents,
    has_more: false,
    first_id: agents[0]?.id ?? '',
    last_id: agents[agents.length - 1]?.id ?? '',
  };
}
