import {
  EModelEndpoint,
  AzureAssistantsNewEndpoint,
  AzureAssistantsOldEndpoint,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type { AssistantsEndpoint, TEndpointsConfig } from 'librechat-data-provider';

function hasAssistantBuilder(
  endpointsConfig: TEndpointsConfig | null | undefined,
  endpoint: EModelEndpoint.assistants | EModelEndpoint.azureAssistants,
): boolean {
  return !!endpointsConfig?.[endpoint] && endpointsConfig[endpoint].disableBuilder !== true;
}

export function isAzureAssistantBuilderEndpoint(
  endpoint: AssistantsEndpoint | null | undefined,
): boolean {
  return (
    endpoint === EModelEndpoint.azureAssistants ||
    endpoint === AzureAssistantsNewEndpoint ||
    endpoint === AzureAssistantsOldEndpoint
  );
}

export function getAssistantBuilderEndpoint({
  currentEndpoint,
  endpointsConfig,
}: {
  currentEndpoint?: string | null;
  endpointsConfig: TEndpointsConfig | null | undefined;
}): AssistantsEndpoint | null {
  if (currentEndpoint != null && isAssistantsEndpoint(currentEndpoint)) {
    return currentEndpoint;
  }

  const hasAzureBuilder = hasAssistantBuilder(endpointsConfig, EModelEndpoint.azureAssistants);
  const hasOpenAIAssistantBuilder = hasAssistantBuilder(endpointsConfig, EModelEndpoint.assistants);

  if (currentEndpoint === EModelEndpoint.azureOpenAI && hasAzureBuilder) {
    return EModelEndpoint.azureAssistants;
  }

  if (currentEndpoint === EModelEndpoint.openAI && hasOpenAIAssistantBuilder) {
    return EModelEndpoint.assistants;
  }

  if (hasAzureBuilder) {
    return EModelEndpoint.azureAssistants;
  }

  if (hasOpenAIAssistantBuilder) {
    return EModelEndpoint.assistants;
  }

  return null;
}
