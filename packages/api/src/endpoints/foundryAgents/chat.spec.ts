import type { AgentThreadCreationOptions, ToolDefinitionUnion } from '@azure/ai-agents';

import {
  buildFoundryMessageAttachments,
  buildFoundryRunAdditionalInstructions,
  buildFoundryRunOptions,
  ensureFoundryThread,
} from './chat';

type EnsureFoundryThreadParams = Parameters<typeof ensureFoundryThread>[0];
type EnsureFoundryThreadClient = EnsureFoundryThreadParams['client'];

function createEnsureFoundryThreadClient(): {
  client: EnsureFoundryThreadClient;
  create: jest.Mock<Promise<{ id: string }>, [AgentThreadCreationOptions | undefined]>;
  update: jest.Mock<
    Promise<void>,
    [string, { toolResources: NonNullable<AgentThreadCreationOptions['toolResources']> }]
  >;
} {
  const create = jest.fn<Promise<{ id: string }>, [AgentThreadCreationOptions | undefined]>();
  const update = jest.fn<
    Promise<void>,
    [string, { toolResources: NonNullable<AgentThreadCreationOptions['toolResources']> }]
  >();

  return {
    client: {
      threads: {
        create,
        update,
      },
    },
    create,
    update,
  };
}

describe('ensureFoundryThread', () => {
  it('creates a new thread when no thread id is provided', async () => {
    const { client, create, update } = createEnsureFoundryThreadClient();
    const threadCreationOptions: AgentThreadCreationOptions = {
      toolResources: {
        codeInterpreter: {
          fileIds: ['file_ci_1'],
        },
      },
    };

    create.mockResolvedValue({
      id: 'thread_new',
    });

    await expect(
      ensureFoundryThread({
        client,
        threadCreationOptions,
      }),
    ).resolves.toBe('thread_new');

    expect(create).toHaveBeenCalledWith(threadCreationOptions);
    expect(update).not.toHaveBeenCalled();
  });

  it('updates an existing thread with tool resources before reuse', async () => {
    const { client, create, update } = createEnsureFoundryThreadClient();
    const threadCreationOptions: AgentThreadCreationOptions = {
      toolResources: {
        codeInterpreter: {
          fileIds: ['file_ci_1'],
        },
        fileSearch: {
          vectorStoreIds: ['vs_1'],
        },
      },
    };

    update.mockResolvedValue();

    await expect(
      ensureFoundryThread({
        client,
        threadId: 'thread_existing',
        threadCreationOptions,
      }),
    ).resolves.toBe('thread_existing');

    expect(update).toHaveBeenCalledWith('thread_existing', {
      toolResources: threadCreationOptions.toolResources,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('reuses an existing thread without updating it when no tool resources exist', async () => {
    const { client, create, update } = createEnsureFoundryThreadClient();

    update.mockResolvedValue();

    await expect(
      ensureFoundryThread({
        client,
        threadId: 'thread_existing',
      }),
    ).resolves.toBe('thread_existing');

    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('buildFoundryRunAdditionalInstructions', () => {
  it('returns the original instructions when no files are available', () => {
    expect(
      buildFoundryRunAdditionalInstructions({
        additionalInstructions: 'Existing instructions',
        availableToolFiles: [],
      }),
    ).toBe('Existing instructions');
  });

  it('injects the available file names for code interpreter and knowledge tools', () => {
    const instructions = buildFoundryRunAdditionalInstructions({
      additionalInstructions: 'Existing instructions',
      availableToolFiles: [
        {
          source: 'code_interpreter',
          fileId: 'file_ci_1',
          filename: '28MICHEL_FR_en-US_en-GB.pdf',
        },
        {
          source: 'file_search',
          fileId: 'file_fs_1',
          filename: 'GIZ_Copilot_Agent_Overview_English.docx',
        },
      ],
    });

    expect(instructions).toContain('Existing instructions');
    expect(instructions).toContain('already available to your tools');
    expect(instructions).toContain('All available files for this conversation:');
    expect(instructions).toContain('Code interpreter files:');
    expect(instructions).toContain('Knowledge files:');
    expect(instructions).toContain('- 28MICHEL_FR_en-US_en-GB.pdf');
    expect(instructions).toContain('- GIZ_Copilot_Agent_Overview_English.docx');
    expect(instructions).toContain('every available file exactly once');
    expect(instructions).toContain('do not invent generic placeholders');
    expect(instructions).toContain('Do not say that you cannot see attached files');
    expect(instructions).toContain('never expose internal file identifiers');
  });
});

describe('buildFoundryMessageAttachments', () => {
  it('does not attach assistant-owned tool files to the message when the user did not upload files', async () => {
    await expect(
      buildFoundryMessageAttachments({
        assistant: {
          id: 'asst_1',
          tools: [{ type: 'code_interpreter' }],
          toolResources: {
            codeInterpreter: {
              fileIds: ['file_ci_1'],
            },
          },
        } as never,
        projectAgent: null,
      }),
    ).resolves.toEqual([]);
  });

  it('attaches only explicit user file ids with the enabled tools', async () => {
    const attachments = await buildFoundryMessageAttachments({
      assistant: {
        id: 'asst_1',
        tools: [{ type: 'code_interpreter' }, { type: 'file_search' }],
        toolResources: {
          codeInterpreter: {
            fileIds: ['assistant_file_1'],
          },
          fileSearch: {
            vectorStoreIds: ['vs_1'],
          },
        },
      } as never,
      attachments: [{ file_id: 'user_file_1' }],
      projectAgent: null,
    });

    expect(attachments).toHaveLength(1);
    expect(attachments[0].fileId).toBe('user_file_1');
    expect(attachments[0].tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'code_interpreter' }),
        expect.objectContaining({ type: 'file_search' }),
      ]),
    );
  });
});

describe('buildFoundryRunOptions', () => {
  it('includes thread tool resources in the Foundry run options', () => {
    const tools: ToolDefinitionUnion[] = [
      {
        type: 'code_interpreter',
      },
      {
        type: 'file_search',
      },
    ];
    const runOptions = buildFoundryRunOptions({
      instructions: 'Summarize the available files.',
      additionalInstructions: 'Use the files directly.',
      availableToolFiles: [
        {
          source: 'code_interpreter',
          fileId: 'file_ci_1',
          filename: '28MICHEL_FR_en-US_en-GB.pdf',
        },
      ],
      tools,
      threadCreationOptions: {
        toolResources: {
          codeInterpreter: {
            fileIds: ['file_ci_1'],
          },
        },
      },
    });

    expect(runOptions).toEqual({
      pollingOptions: {
        intervalInMs: 1000,
      },
      instructions: 'Summarize the available files.',
      additionalInstructions: expect.stringContaining('Use the files directly.'),
      tools,
      toolResources: {
        codeInterpreter: {
          fileIds: ['file_ci_1'],
        },
      },
    });
    expect(runOptions.additionalInstructions).toContain('28MICHEL_FR_en-US_en-GB.pdf');
  });
});
