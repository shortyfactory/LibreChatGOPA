import type * as t from './types';
import { EndpointURLs } from './config';
import * as s from './schemas';

export default function createPayload(submission: t.TSubmission) {
  const {
    isEdited,
    addedConvo,
    userMessage,
    isContinued,
    isTemporary,
    isRegenerate,
    conversation,
    editedContent,
    ephemeralAgent,
    endpointOption,
  } = submission;
  const { conversationId } = s.tConvoUpdateSchema.parse(conversation);
  const { endpoint: _e, endpointType } = endpointOption as {
    endpoint: s.EModelEndpoint;
    endpointType?: s.EModelEndpoint;
  };

  const endpoint = _e as s.EModelEndpoint;
  let server = `${EndpointURLs[s.EModelEndpoint.agents]}/${endpoint}`;
  if (s.isAssistantsEndpoint(endpoint)) {
    const configEndpoint = s.resolveAssistantsConfigEndpoint(endpointType ?? endpoint);
    server =
      EndpointURLs[
        configEndpoint as s.EModelEndpoint.assistants | s.EModelEndpoint.azureAssistants
      ] + (isEdited ? '/modify' : '');
  }

  const payload: t.TPayload = {
    ...userMessage,
    ...endpointOption,
    endpoint,
    addedConvo,
    isTemporary,
    isRegenerate,
    editedContent,
    conversationId,
    isContinued: !!(isEdited && isContinued),
    ephemeralAgent: s.isAssistantsEndpoint(endpoint) ? undefined : ephemeralAgent,
  };

  return { server, payload };
}
