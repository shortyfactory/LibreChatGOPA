/**
 * @jest-environment jsdom
 */
import React from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { PermissionBits } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import { expect, describe, it, beforeEach, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import type { QueryObserverResult, UseMutationResult } from '@tanstack/react-query';
import type { Agent, AgentCreateParams } from 'librechat-data-provider';
import AgentSelect from '../AgentSelect';

type AgentSelectFormValues = {
  agent?: {
    icon?: ReactNode;
    label?: string;
    value?: string;
  };
};

type ControlComboboxProps = {
  items: { icon?: ReactNode; label: string; value: string }[];
  selectedValue?: string;
};

const mockUseListAgentsQuery = jest.fn();
const mockUseAgentDefaultPermissionLevel = jest.fn();

jest.mock('~/data-provider', () => ({
  useListAgentsQuery: (...args: unknown[]) => mockUseListAgentsQuery(...args),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAgentDefaultPermissionLevel: () => mockUseAgentDefaultPermissionLevel(),
}));

jest.mock('@librechat/client', () => ({
  ControlCombobox: ({ items, selectedValue }: ControlComboboxProps) => (
    <div data-testid="agent-select-combobox" data-selected-value={selectedValue ?? ''}>
      {items.map((item) => (
        <span key={item.value}>{item.label}</span>
      ))}
    </div>
  ),
}));

const agentQuery = {
  data: undefined,
  isSuccess: false,
} as QueryObserverResult<Agent>;

const createMutation = {
  data: undefined,
  isLoading: false,
  reset: jest.fn(),
} as UseMutationResult<Agent, Error, AgentCreateParams>;

function TestHarness() {
  const methods = useForm<AgentSelectFormValues>({
    defaultValues: {
      agent: undefined,
    },
  });

  return (
    <FormProvider {...methods}>
      <AgentSelect
        agentQuery={agentQuery}
        selectedAgentId={null}
        setCurrentAgentId={jest.fn()}
        createMutation={createMutation}
      />
    </FormProvider>
  );
}

describe('AgentSelect', () => {
  beforeEach(() => {
    mockUseListAgentsQuery.mockReset();
    mockUseAgentDefaultPermissionLevel.mockReset();
    mockUseAgentDefaultPermissionLevel.mockReturnValue(PermissionBits.VIEW);
    mockUseListAgentsQuery.mockReturnValue({
      data: [],
    });
  });

  it('requests agents using the default permission level for the current user', () => {
    render(<TestHarness />);

    expect(mockUseListAgentsQuery).toHaveBeenCalledWith(
      { requiredPermission: PermissionBits.VIEW },
      expect.objectContaining({
        select: expect.any(Function),
      }),
    );
    expect(screen.getByTestId('agent-select-combobox')).toBeInTheDocument();
  });
});
