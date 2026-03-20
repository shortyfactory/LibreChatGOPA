import type { ThreadMessage } from '@azure/ai-agents';
import { extractFoundryResponseText, normalizeFoundryMessagesForProcessing } from './messages';

function createThreadMessage(content: ThreadMessage['content']): ThreadMessage {
  return {
    id: 'msg_test',
    object: 'thread.message',
    createdAt: new Date('2026-03-20T13:02:01.000Z'),
    threadId: 'thread_test',
    status: 'completed',
    incompleteDetails: null,
    completedAt: new Date('2026-03-20T13:02:03.000Z'),
    incompleteAt: null,
    role: 'assistant',
    content,
    assistantId: 'asst_test',
    runId: 'run_test',
    attachments: null,
    metadata: {},
  };
}

describe('normalizeFoundryMessagesForProcessing', () => {
  it('maps sandbox file citations to file_path annotations', () => {
    const [message] = normalizeFoundryMessagesForProcessing([
      createThreadMessage([
        {
          type: 'text',
          text: {
            value: 'Télécharger: [tableau_3x5.xlsx](sandbox:/mnt/data/tableau_3x5.xlsx)',
            annotations: [
              {
                type: 'file_citation',
                text: 'sandbox:/mnt/data/tableau_3x5.xlsx',
                fileCitation: {
                  fileId: 'assistant-file-1',
                  quote: '',
                },
                startIndex: 31,
                endIndex: 65,
              },
            ],
          },
        },
      ]),
    ]);

    expect(message.content).toHaveLength(1);
    expect(message.content[0]).toMatchObject({
      type: 'text',
      text: {
        value: 'Télécharger: [tableau_3x5.xlsx](sandbox:/mnt/data/tableau_3x5.xlsx)',
        annotations: [
          {
            type: 'file_path',
            text: 'sandbox:/mnt/data/tableau_3x5.xlsx',
            file_path: {
              file_id: 'assistant-file-1',
            },
            start_index: 31,
            end_index: 65,
          },
        ],
      },
    });
  });

  it('preserves normal file citations and extracts text across messages', () => {
    const messages = normalizeFoundryMessagesForProcessing([
      createThreadMessage([
        {
          type: 'text',
          text: {
            value: 'Voici un résumé.',
            annotations: [],
          },
        },
      ]),
      createThreadMessage([
        {
          type: 'text',
          text: {
            value: ' Source: [citation].',
            annotations: [
              {
                type: 'file_citation',
                text: '[citation]',
                fileCitation: {
                  fileId: 'assistant-file-2',
                  quote: 'Une citation',
                },
                startIndex: 9,
                endIndex: 19,
              },
            ],
          },
        },
      ]),
    ]);

    expect(messages[1].content[0]).toMatchObject({
      type: 'text',
      text: {
        annotations: [
          {
            type: 'file_citation',
            text: '[citation]',
            file_citation: {
              file_id: 'assistant-file-2',
              quote: 'Une citation',
            },
          },
        ],
      },
    });
    expect(extractFoundryResponseText(messages)).toBe('Voici un résumé. Source: [citation].');
  });
});
