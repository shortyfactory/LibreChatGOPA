import { useState, useEffect, useMemo } from 'react';
import {
  SystemRoles,
  defaultAssistantsVersion,
  resolveAssistantsConfigEndpoint,
  EModelEndpoint,
} from 'librechat-data-provider';
import type { Action, TEndpointsConfig, AssistantsEndpoint } from 'librechat-data-provider';
import type { ActionsEndpoint } from '~/common';
import {
  useGetActionsQuery,
  useGetEndpointsQuery,
  useGetAssistantDocsQuery,
} from '~/data-provider';
import { getAssistantBuilderEndpoint } from '~/utils/assistantBuilder';
import AssistantPanel from './AssistantPanel';
import { useChatContext } from '~/Providers';
import ActionsPanel from './ActionsPanel';
import { useAuthContext } from '~/hooks';
import { Panel } from '~/common';

export default function PanelSwitch() {
  const { conversation, index } = useChatContext();
  const { user } = useAuthContext();
  const [activePanel, setActivePanel] = useState(Panel.builder);
  const [action, setAction] = useState<Action | undefined>(undefined);
  const [currentAssistantId, setCurrentAssistantId] = useState<string | undefined>(
    conversation?.assistant_id,
  );

  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const assistantEndpoint = useMemo(
    () =>
      getAssistantBuilderEndpoint({
        currentEndpoint: conversation?.endpoint,
        endpointsConfig,
      }),
    [conversation?.endpoint, endpointsConfig],
  );
  const { data: actions = [] } = useGetActionsQuery(
    (assistantEndpoint ?? EModelEndpoint.assistants) as ActionsEndpoint,
    {
      enabled: assistantEndpoint != null,
    },
  );
  const { data: documentsMap = null } = useGetAssistantDocsQuery(assistantEndpoint ?? '', {
    enabled: assistantEndpoint != null,
    select: (data) => new Map(data.map((dbA) => [dbA.assistant_id, dbA])),
  });
  const configEndpoint = useMemo(
    () => (assistantEndpoint ? resolveAssistantsConfigEndpoint(assistantEndpoint) : undefined),
    [assistantEndpoint],
  );

  const assistantsConfig = useMemo(
    () => (configEndpoint ? endpointsConfig?.[configEndpoint] : undefined),
    [configEndpoint, endpointsConfig],
  );
  const canEditAssistants = user?.role === SystemRoles.ADMIN;

  useEffect(() => {
    const currentId = conversation?.assistant_id ?? '';
    if (currentId) {
      setCurrentAssistantId(currentId);
    }
  }, [conversation?.assistant_id]);

  useEffect(() => {
    if (canEditAssistants) {
      return;
    }

    if (action) {
      setAction(undefined);
    }

    if (activePanel === Panel.actions) {
      setActivePanel(Panel.builder);
    }
  }, [action, activePanel, canEditAssistants]);

  if (!assistantEndpoint) {
    return null;
  }

  const version =
    assistantsConfig?.version ??
    defaultAssistantsVersion[assistantEndpoint] ??
    defaultAssistantsVersion[configEndpoint ?? assistantEndpoint];

  if (activePanel === Panel.actions || action) {
    return (
      <ActionsPanel
        index={index}
        action={action}
        actions={actions}
        setAction={setAction}
        activePanel={activePanel}
        documentsMap={documentsMap}
        setActivePanel={setActivePanel}
        assistant_id={currentAssistantId}
        setCurrentAssistantId={setCurrentAssistantId}
        endpoint={assistantEndpoint as AssistantsEndpoint}
        version={version}
      />
    );
  } else if (activePanel === Panel.builder) {
    return (
      <AssistantPanel
        index={index}
        activePanel={activePanel}
        action={action}
        actions={actions}
        setAction={setAction}
        documentsMap={documentsMap}
        setActivePanel={setActivePanel}
        assistant_id={currentAssistantId}
        setCurrentAssistantId={setCurrentAssistantId}
        endpoint={assistantEndpoint as AssistantsEndpoint}
        assistantsConfig={assistantsConfig}
        version={version}
      />
    );
  }
}
