const {
  applyAssistantRunFileNameContext,
  applyAssistantRunToolAccess,
  buildAssistantRunFileInstructions,
  buildAssistantAttachmentTools,
  buildRuntimeAssistantPayload,
  getAssistantToolAvailability,
  requiresTemporaryAssistant,
} = require('./toolAccess');

describe('assistant tool access helpers', () => {
  test('detects enabled assistant tools and attached resources', () => {
    const availability = getAssistantToolAvailability({
      file_ids: ['knowledge-file-1'],
      tools: [{ type: 'code_interpreter' }, { type: 'retrieval' }],
      tool_resources: {
        code_interpreter: {
          file_ids: ['code-file-1'],
        },
      },
    });

    expect(availability).toEqual({
      hasCodeInterpreter: true,
      hasFileSearch: true,
      hasCodeInterpreterFiles: true,
      hasAssistantFileIds: true,
      hasKnowledgeFiles: true,
    });
  });

  test('builds only the attachment tools that are enabled for the assistant', () => {
    expect(
      buildAssistantAttachmentTools({
        hasCodeInterpreter: true,
        hasFileSearch: true,
      }),
    ).toEqual([{ type: 'code_interpreter' }, { type: 'file_search' }]);

    expect(
      buildAssistantAttachmentTools({
        hasCodeInterpreter: false,
        hasFileSearch: false,
      }),
    ).toEqual([]);
  });

  test('adds run guard instructions for disabled tools with attached resources', () => {
    const body = {
      additional_instructions: 'Base instructions.',
    };

    const availability = applyAssistantRunToolAccess({
      assistant: {
        tools: [],
        file_ids: ['knowledge-file-1'],
        tool_resources: {
          code_interpreter: {
            file_ids: ['code-file-1'],
          },
        },
      },
      body,
    });

    expect(availability).toEqual({
      hasCodeInterpreter: false,
      hasFileSearch: false,
      hasCodeInterpreterFiles: true,
      hasAssistantFileIds: true,
      hasKnowledgeFiles: true,
    });
    expect(body.tools).toEqual([]);
    expect(body.file_ids).toEqual([]);
    expect(body.additional_instructions).toContain('Base instructions.');
    expect(body.additional_instructions).toContain('Code interpreter is disabled');
    expect(body.additional_instructions).toContain('Knowledge retrieval is disabled');
  });

  test('does not add legacy file_ids override when only vector stores are attached', () => {
    const body = {};

    const availability = applyAssistantRunToolAccess({
      assistant: {
        tools: [],
        tool_resources: {
          file_search: {
            vector_store_ids: ['vs_123'],
          },
        },
      },
      body,
    });

    expect(availability).toEqual({
      hasCodeInterpreter: false,
      hasFileSearch: false,
      hasCodeInterpreterFiles: false,
      hasAssistantFileIds: false,
      hasKnowledgeFiles: true,
    });
    expect(body.file_ids).toBeUndefined();
    expect(body.additional_instructions).toContain('Knowledge retrieval is disabled');
  });

  test('marks disabled attached resources as requiring a temporary runtime assistant', () => {
    expect(
      requiresTemporaryAssistant({
        hasCodeInterpreter: false,
        hasFileSearch: true,
        hasCodeInterpreterFiles: true,
        hasKnowledgeFiles: true,
      }),
    ).toBe(true);

    expect(
      requiresTemporaryAssistant({
        hasCodeInterpreter: true,
        hasFileSearch: true,
        hasCodeInterpreterFiles: true,
        hasKnowledgeFiles: true,
      }),
    ).toBe(false);
  });

  test('builds assistant file instructions with human-readable filenames only', () => {
    const instructions = buildAssistantRunFileInstructions([
      {
        fileId: 'assistant-file-1',
        filename: '8MICHEL_FR.pdf',
        source: 'code_interpreter',
      },
      {
        fileId: 'assistant-file-2',
        filename: 'GIZ_Copilot_Agent_Overview.pdf',
        source: 'file_search',
      },
    ]);

    expect(instructions).toContain('already available to your tools');
    expect(instructions).toContain('Code interpreter files:');
    expect(instructions).toContain('- 8MICHEL_FR.pdf');
    expect(instructions).toContain('Knowledge files:');
    expect(instructions).toContain('- GIZ_Copilot_Agent_Overview.pdf');
    expect(instructions).not.toContain('assistant-file-1');
  });

  test('adds assistant filename context to run instructions for enabled tools', async () => {
    const body = {
      additional_instructions: 'Base instructions.',
    };
    const openai = {
      files: {
        retrieve: jest.fn(async (file_id) => ({
          id: file_id,
          filename: {
            'assistant-code-1': '8MICHEL_FR.pdf',
            'assistant-code-2': '6MICHEL_FR.pdf',
            'knowledge-file-1': 'GIZ_Copilot_Agent_Overview.pdf',
          }[file_id],
        })),
      },
      vectorStores: {
        files: {
          list: jest.fn(async function* () {
            yield { id: 'knowledge-file-1' };
          }),
        },
      },
    };

    await applyAssistantRunFileNameContext({
      openai,
      body,
      availability: {
        hasCodeInterpreter: true,
        hasFileSearch: true,
      },
      assistant: {
        file_ids: ['knowledge-file-1'],
        tool_resources: {
          code_interpreter: {
            file_ids: ['assistant-code-1', 'assistant-code-2'],
          },
          file_search: {
            vector_store_ids: ['vs_123'],
          },
        },
      },
    });

    expect(openai.files.retrieve).toHaveBeenCalledTimes(3);
    expect(body.additional_instructions).toContain('Base instructions.');
    expect(body.additional_instructions).toContain('Code interpreter files:');
    expect(body.additional_instructions).toContain('- 8MICHEL_FR.pdf');
    expect(body.additional_instructions).toContain('- 6MICHEL_FR.pdf');
    expect(body.additional_instructions).toContain('Knowledge files:');
    expect(body.additional_instructions).toContain('- GIZ_Copilot_Agent_Overview.pdf');
    expect(body.additional_instructions).not.toContain('assistant-code-1');
    expect(body.additional_instructions).not.toContain('knowledge-file-1');
  });

  test('builds a runtime assistant payload without disabled tool resources', () => {
    const payload = buildRuntimeAssistantPayload({
      userId: 'user_123',
      endpoint: 'azureOldAssistants',
      availability: {
        hasCodeInterpreter: false,
        hasFileSearch: true,
        hasCodeInterpreterFiles: true,
        hasAssistantFileIds: true,
        hasKnowledgeFiles: true,
      },
      assistant: {
        id: 'asst_parent',
        model: 'gpt-4.1-deployment',
        name: 'Assistant487',
        description: 'desc',
        instructions: 'instr',
        file_ids: ['knowledge-file-1'],
        tools: [{ type: 'file_search' }],
        metadata: {
          author: 'original_author',
        },
        tool_resources: {
          code_interpreter: {
            file_ids: ['code-file-1'],
          },
          file_search: {
            vector_store_ids: ['vs_1'],
          },
        },
      },
    });

    expect(payload).toEqual({
      model: 'gpt-4.1-deployment',
      name: 'Assistant487',
      description: 'desc',
      instructions: 'instr',
      file_ids: ['knowledge-file-1'],
      tools: [{ type: 'file_search' }],
      metadata: {
        author: 'user_123',
        endpoint: 'azureOldAssistants',
        parent_assistant_id: 'asst_parent',
        runtime_clone: 'true',
      },
      tool_resources: {
        file_search: {
          vector_store_ids: ['vs_1'],
        },
      },
    });
  });
});
