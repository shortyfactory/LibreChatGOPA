import type { TPreset, TConversation, TEndpointsConfig } from 'librechat-data-provider';
import { resolveAssistantsConfigEndpoint } from 'librechat-data-provider';
import { getLocalStorageItems } from './localStorage';
import { mapEndpoints } from './endpoints';

type TConvoSetup = Partial<TPreset> | Partial<TConversation>;

type TDefaultEndpoint = { convoSetup: TConvoSetup; endpointsConfig: TEndpointsConfig };

const getEndpointFromSetup = (
  convoSetup: TConvoSetup | null,
  endpointsConfig: TEndpointsConfig,
): string | null => {
  let { endpoint: targetEndpoint = '' } = convoSetup || {};
  targetEndpoint = targetEndpoint ?? '';
  const configEndpoint = resolveAssistantsConfigEndpoint(targetEndpoint);

  if (targetEndpoint && endpointsConfig?.[configEndpoint] != null) {
    return targetEndpoint;
  } else if (targetEndpoint) {
    console.warn(`Illegal target endpoint ${targetEndpoint}`, endpointsConfig);
  }
  return null;
};

const getEndpointFromLocalStorage = (endpointsConfig: TEndpointsConfig) => {
  try {
    const { lastConversationSetup } = getLocalStorageItems();
    const { endpoint } = lastConversationSetup ?? { endpoint: null };
    const isDefaultConfig = Object.values(endpointsConfig ?? {}).every((value) => !value);
    const configEndpoint = resolveAssistantsConfigEndpoint(endpoint);

    if (isDefaultConfig && endpoint) {
      return endpoint;
    }

    return endpoint && endpointsConfig?.[configEndpoint] != null ? endpoint : null;
  } catch (error) {
    console.error(error);
    return null;
  }
};

const getDefinedEndpoint = (endpointsConfig: TEndpointsConfig) => {
  const endpoints = mapEndpoints(endpointsConfig);
  return endpoints.find((e) => Object.hasOwn(endpointsConfig ?? {}, e));
};

const getDefaultEndpoint = ({
  convoSetup,
  endpointsConfig,
}: TDefaultEndpoint): string | undefined => {
  return (
    getEndpointFromSetup(convoSetup, endpointsConfig) ||
    getEndpointFromLocalStorage(endpointsConfig) ||
    getDefinedEndpoint(endpointsConfig)
  );
};

export default getDefaultEndpoint;
