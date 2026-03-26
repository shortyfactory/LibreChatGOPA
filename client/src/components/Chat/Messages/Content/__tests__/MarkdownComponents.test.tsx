/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockRefetch = jest.fn();
const mockShowToast = jest.fn();

jest.mock('recoil', () => ({
  useRecoilValue: jest.fn(() => ({ id: 'user-123' })),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({
    showToast: mockShowToast,
  }),
}));

jest.mock('librechat-data-provider', () => {
  const actualModule = jest.requireActual(
    'librechat-data-provider',
  ) as typeof import('librechat-data-provider');
  return {
    ...actualModule,
    apiBaseUrl: () => '',
    PermissionTypes: {
      RUN_CODE: 'RUN_CODE',
    },
    Permissions: {
      USE: 'USE',
    },
  };
});

jest.mock('~/components/Messages/Content/MermaidErrorBoundary', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('~/components/Messages/Content/CodeBlock', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('~/components/Messages/Content/Mermaid', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('~/hooks/Roles/useHasAccess', () => ({
  __esModule: true,
  default: () => false,
}));

jest.mock('~/Providers', () => ({
  ArtifactProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  CodeBlockProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useCodeBlockContext: () => ({
    getNextIndex: () => 0,
    resetCounter: () => undefined,
  }),
}));

jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils'),
  handleDoubleClick: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useFileDownload: () => ({
    refetch: mockRefetch,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    user: 'user',
  },
}));

import { a as MarkdownAnchor } from '../MarkdownComponents';
import MarkdownLite from '../MarkdownLite';

describe('MarkdownComponents anchor', () => {
  const generatedFileLabel = 'tableau_3x3.xlsx';
  const externalLinkLabel = 'external link';

  beforeEach(() => {
    jest.clearAllMocks();
    mockRefetch.mockResolvedValue({ data: 'blob:mock-download-url' });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
      configurable: true,
      value: jest.fn(),
    });
  });

  it('normalizes legacy assistant file links to the download route', () => {
    render(
      <MarkdownAnchor href="https://api.openai.com/v1/files/user-123/assistant-file-123/tableau_3x3.xlsx">
        {generatedFileLabel}
      </MarkdownAnchor>,
    );

    const link = screen.getByRole('link', { name: generatedFileLabel });

    expect(link).toHaveAttribute('href', '/api/files/download/user-123/assistant-file-123');
    expect(link).not.toHaveAttribute('target');
  });

  it('downloads assistant files through the authenticated file download hook', async () => {
    render(
      <MarkdownAnchor href="/api/files/download/user-123/assistant-file-123">
        {generatedFileLabel}
      </MarkdownAnchor>,
    );

    fireEvent.click(screen.getByRole('link', { name: generatedFileLabel }));

    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-download-url');
  });

  it('keeps external links opening in a new tab', () => {
    render(<MarkdownAnchor href="https://example.com">{externalLinkLabel}</MarkdownAnchor>);

    const link = screen.getByRole('link', { name: externalLinkLabel });

    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('repairs malformed assistant download markdown links before rendering', () => {
    render(
      <MarkdownLite content="👉 [Reporting_GOPA_GBE_AVEC_CHARTS.xlsx]/api/files/download/user-123/assistant-file-123)" />,
    );

    const link = screen.getByRole('link', {
      name: 'Reporting_GOPA_GBE_AVEC_CHARTS.xlsx',
    });

    expect(link).toHaveAttribute('href', '/api/files/download/user-123/assistant-file-123');
  });
});
