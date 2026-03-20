import { AgentsClient } from '@azure/ai-agents';
import type { TokenCredential } from '@azure/core-auth';
import { DefaultAzureCredential } from '@azure/identity';
import { FoundryServicePrincipalCredential, getFoundryServicePrincipalConfig } from './credential';

const foundryProjectEndpointEnvKeys = [
  'AZURE_FOUNDRY_PROJECT_ENDPOINT',
  'AZURE_AI_PROJECT_ENDPOINT',
] as const;

let cachedClient: AgentsClient | null = null;
let cachedEndpoint: string | null = null;
let cachedCredentialKey: string | null = null;

function getCredentialCacheKey(): string {
  const servicePrincipalConfig = getFoundryServicePrincipalConfig();

  if (!servicePrincipalConfig) {
    return 'default';
  }

  return `service-principal:${servicePrincipalConfig.tenantId}:${servicePrincipalConfig.clientId}`;
}

function getFoundryTokenCredential(): TokenCredential {
  const servicePrincipalConfig = getFoundryServicePrincipalConfig();

  if (!servicePrincipalConfig) {
    return new DefaultAzureCredential();
  }

  return new FoundryServicePrincipalCredential(servicePrincipalConfig);
}

function resolveFoundryProjectEndpoint(): string | null {
  for (let i = 0; i < foundryProjectEndpointEnvKeys.length; i += 1) {
    const endpoint = process.env[foundryProjectEndpointEnvKeys[i]]?.trim();
    if (endpoint) {
      return endpoint;
    }
  }

  return null;
}

export function getFoundryProjectEndpoint(): string | null {
  return resolveFoundryProjectEndpoint();
}

export function isFoundryAgentsConfigured(): boolean {
  return getFoundryProjectEndpoint() != null;
}

export function getFoundryAgentsClient(): AgentsClient {
  const endpoint = getFoundryProjectEndpoint();
  const credentialKey = getCredentialCacheKey();

  if (!endpoint) {
    throw new Error(
      'Foundry Agents is not configured. Set AZURE_FOUNDRY_PROJECT_ENDPOINT or AZURE_AI_PROJECT_ENDPOINT.',
    );
  }

  if (cachedClient && cachedEndpoint === endpoint && cachedCredentialKey === credentialKey) {
    return cachedClient;
  }

  cachedEndpoint = endpoint;
  cachedCredentialKey = credentialKey;
  cachedClient = new AgentsClient(endpoint, getFoundryTokenCredential());
  return cachedClient;
}
