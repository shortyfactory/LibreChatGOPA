import { EModelEndpoint } from 'librechat-data-provider';

export const activateAgentBuilderEvent = 'librechat:activate-agent-builder';
export const activateAssistantBuilderEvent = 'librechat:activate-assistant-builder';
let agentBuilderActivationPending = false;
let assistantBuilderActivationPending = false;

export function dispatchActivateAgentBuilder(): void {
  if (typeof window === 'undefined') {
    return;
  }

  agentBuilderActivationPending = true;
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

export function dispatchActivateAssistantBuilder(): void {
  if (typeof window === 'undefined') {
    return;
  }

  assistantBuilderActivationPending = true;
  window.dispatchEvent(new Event(activateAssistantBuilderEvent));
}

export function subscribeToAssistantBuilderActivation(handler: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const listener = () => {
    handler();
  };

  window.addEventListener(activateAssistantBuilderEvent, listener);

  return () => {
    window.removeEventListener(activateAssistantBuilderEvent, listener);
  };
}

export function getAgentBuilderPanelId(): string {
  return EModelEndpoint.agents;
}

export function getAssistantBuilderPanelId(): string {
  return EModelEndpoint.assistants;
}

export function hasPendingAgentBuilderActivation(): boolean {
  return agentBuilderActivationPending;
}

export function hasPendingAssistantBuilderActivation(): boolean {
  return assistantBuilderActivationPending;
}

export function clearPendingAgentBuilderActivation(): void {
  agentBuilderActivationPending = false;
}

export function clearPendingAssistantBuilderActivation(): void {
  assistantBuilderActivationPending = false;
}
