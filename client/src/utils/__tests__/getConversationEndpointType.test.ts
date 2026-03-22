import { AzureAssistantsNewEndpoint, EModelEndpoint } from 'librechat-data-provider';
import type { TEndpointsConfig } from 'librechat-data-provider';
import { getConversationEndpointType } from '../endpoints';

describe('getConversationEndpointType', () => {
  const endpointsConfig = {
    [EModelEndpoint.azureAssistants]: {
      type: EModelEndpoint.azureAssistants,
    },
  } as TEndpointsConfig;

  it('should prefer the conversation endpointType for assistant aliases', () => {
    const endpointType = getConversationEndpointType({
      endpoint: AzureAssistantsNewEndpoint,
      endpointType: EModelEndpoint.azureAssistants,
      endpointsConfig,
    });

    expect(endpointType).toBe(EModelEndpoint.azureAssistants);
  });

  it('should fall back to the config type when the conversation endpointType is missing', () => {
    const endpointType = getConversationEndpointType({
      endpoint: AzureAssistantsNewEndpoint,
      endpointsConfig,
    });

    expect(endpointType).toBe(EModelEndpoint.azureAssistants);
  });
});
