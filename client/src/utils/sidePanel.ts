import { EModelEndpoint } from 'librechat-data-provider';

export const activateAgentBuilderEvent = 'librechat:activate-agent-builder';

export function dispatchActivateAgentBuilder(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(activateAgentBuilderEvent));
}

export function subscribeToAgentBuilderActivation(handler: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const listener = () => {
    handler();
  };

  window.addEventListener(activateAgentBuilderEvent, listener);

  return () => {
    window.removeEventListener(activateAgentBuilderEvent, listener);
  };
}

export function getAgentBuilderPanelId(): string {
  return EModelEndpoint.agents;
}
