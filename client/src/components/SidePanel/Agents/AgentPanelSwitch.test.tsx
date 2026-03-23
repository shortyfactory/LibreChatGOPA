/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { SystemRoles } from 'librechat-data-provider';

let mockCurrentRole = SystemRoles.USER;
let mockActivePanel = 'builder';
const mockSetCurrentAgentId = jest.fn();

jest.mock('recoil', () => ({
  useRecoilValue: () => 'agent_123',
}));

jest.mock('~/Providers/AgentPanelContext', () => ({
  AgentPanelProvider: ({ children }: { children: React.ReactNode }) => children,
  useAgentPanelContext: () => ({
    activePanel: mockActivePanel,
    setCurrentAgentId: mockSetCurrentAgentId,
  }),
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({
    user: {
      role: mockCurrentRole,
    },
  }),
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/common', () => ({
  Panel: {
    builder: 'builder',
    actions: 'actions',
    version: 'version',
  },
  isEphemeralAgent: () => false,
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    conversationAgentIdByIndex: () => 'agent-panel-selector',
  },
}));

jest.mock('./AgentPanel', () => ({
  __esModule: true,
  default: () => <div>{`Agent Panel`}</div>,
}));

jest.mock('./ActionsPanel', () => ({
  __esModule: true,
  default: () => <div>{`Actions Panel`}</div>,
}));

jest.mock('./Version/VersionPanel', () => ({
  __esModule: true,
  default: () => <div>{`Version Panel`}</div>,
}));

import AgentPanelSwitch from './AgentPanelSwitch';

describe('AgentPanelSwitch', () => {
  beforeEach(() => {
    mockCurrentRole = SystemRoles.USER;
    mockActivePanel = 'builder';
    mockSetCurrentAgentId.mockReset();
  });

  it('renders the agent panel for non-admin users', () => {
    render(<AgentPanelSwitch />);

    expect(screen.getByText('Agent Panel')).toBeInTheDocument();
    expect(screen.queryByText('Actions Panel')).not.toBeInTheDocument();
  });

  it('keeps non-admin users out of admin-only panels', () => {
    mockActivePanel = 'actions';

    render(<AgentPanelSwitch />);

    expect(screen.getByText('Agent Panel')).toBeInTheDocument();
    expect(screen.queryByText('Actions Panel')).not.toBeInTheDocument();
  });

  it('renders the admin action panel for admins', () => {
    mockCurrentRole = SystemRoles.ADMIN;
    mockActivePanel = 'actions';

    render(<AgentPanelSwitch />);

    expect(screen.getByText('Actions Panel')).toBeInTheDocument();
    expect(screen.queryByText('Agent Panel')).not.toBeInTheDocument();
  });
});
