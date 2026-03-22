const { createRunBody, getDateStr, getTimeStr } = require('./createRunBody');

describe('createRunBody', () => {
  test('always appends assistant execution instructions', () => {
    const body = createRunBody({
      assistant_id: 'asst_123',
      model: 'gpt-4.1',
    });

    expect(body).toEqual({
      assistant_id: 'asst_123',
      model: 'gpt-4.1',
      additional_instructions: expect.stringContaining(
        "When the user's request about attached files, knowledge files, retrieved documents, or code interpreter files is clear",
      ),
    });
  });

  test('combines datetime, prompt prefix, artifacts prompt, and execution instructions', () => {
    const body = createRunBody({
      assistant_id: 'asst_123',
      model: 'gpt-4.1',
      promptPrefix: 'Use French.',
      endpointOption: {
        assistant: {
          append_current_datetime: true,
        },
        artifactsPrompt: 'Artifacts are enabled.',
      },
      clientTimestamp: '2026-03-21T13:14:15.000Z',
    });

    expect(body.additional_instructions).toBe(
      [
        `Current date and time: ${getDateStr('2026-03-21T13:14:15.000Z')} ${getTimeStr('2026-03-21T13:14:15.000Z')}`,
        'Use French.',
        'Artifacts are enabled.',
        'When the user\'s request about attached files, knowledge files, retrieved documents, or code interpreter files is clear, do the work immediately and return the requested result in the same response whenever possible.\nDefault to a concise final answer when the user does not specify a detail level. Do not ask whether the user wants a short, detailed, or later version before giving the result.\nDo not say that you will analyze the files later, do not ask unnecessary follow-up questions about whether to continue, and do not stop after listing or identifying files.\nDo not narrate your internal workflow, do not show analysis stages, and do not output placeholder progress messages such as "I will analyze", "I am starting", or "I will come back with the summary".\nNever expose internal file identifiers, vector store identifiers, search queries, sandbox paths, tool names, tool calls, or intermediate retrieval/code output unless the user explicitly asks for them.\nRefer to files by filename only. If filenames are not available, use neutral labels such as "File 1", "File 2", and so on.\nOnly send the final user-facing result once you have enough information to answer the request.',
      ].join('\n'),
    );
  });

  test('preserves explicit assistant instructions', () => {
    const body = createRunBody({
      assistant_id: 'asst_123',
      model: 'gpt-4.1',
      instructions: 'Original assistant instructions.',
    });

    expect(body.instructions).toBe('Original assistant instructions.');
    expect(body.additional_instructions).toContain(
      'return the requested result in the same response',
    );
  });
});
