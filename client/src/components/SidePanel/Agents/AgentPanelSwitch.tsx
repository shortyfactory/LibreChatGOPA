import { useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { SystemRoles } from 'librechat-data-provider';
import { AgentPanelProvider, useAgentPanelContext } from '~/Providers/AgentPanelContext';
import { useAuthContext } from '~/hooks';
import { Panel, isEphemeralAgent } from '~/common';
import VersionPanel from './Version/VersionPanel';
import ActionsPanel from './ActionsPanel';
import AgentPanel from './AgentPanel';
import store from '~/store';

export default function AgentPanelSwitch() {
  return (
    <AgentPanelProvider>
      <AgentPanelSwitchWithContext />
    </AgentPanelProvider>
  );
}

function AgentPanelSwitchWithContext() {
  const { user } = useAuthContext();
  const { activePanel, setCurrentAgentId } = useAgentPanelContext();
  const agentId = useRecoilValue(store.conversationAgentIdByIndex(0));

  useEffect(() => {
    const agent_id = agentId ?? '';
    if (!isEphemeralAgent(agent_id)) {
      setCurrentAgentId(agent_id);
    }
  }, [setCurrentAgentId, agentId]);

  if (user?.role === SystemRoles.ADMIN && activePanel === Panel.actions) {
    return <ActionsPanel />;
  }
  if (user?.role === SystemRoles.ADMIN && activePanel === Panel.version) {
    return <VersionPanel />;
  }
  return <AgentPanel />;
}
