jest.mock('@librechat/api', () => ({
  sendEvent: jest.fn(),
}));

jest.mock('~/server/services/Threads', () => ({
  processMessages: jest.fn(),
}));

jest.mock('~/server/services/Files/process', () => ({
  retrieveAndProcessFile: jest.fn(),
}));

jest.mock('~/server/services/ToolService', () => ({
  processRequiredActions: jest.fn(),
}));

const StreamRunManager = require('./StreamRunManager');
const { processMessages } = require('~/server/services/Threads');

describe('StreamRunManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('injects assistant_id into completed messages before processing', async () => {
    processMessages.mockResolvedValue({
      text: 'tableau_3x3.xlsx',
      edited: true,
    });

    const manager = new StreamRunManager({
      req: {
        body: {
          assistant_id: 'asst_legacy',
          endpoint: 'azureOldAssistants',
        },
        user: {
          id: 'user-123',
        },
      },
      res: {},
      openai: {
        apiKey: 'test-key',
      },
      thread_id: 'thread_123',
      responseMessage: {
        messageId: 'response_123',
        conversationId: 'conversation_123',
        content: [],
      },
    });

    manager.mappedOrder.set('msg_123', 0);

    await manager.messageCompleted({
      data: {
        id: 'msg_123',
        content: [],
        created_at: 1,
      },
    });

    expect(processMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            id: 'msg_123',
            assistant_id: 'asst_legacy',
          }),
        ],
      }),
    );
    expect(manager.messages).toEqual([
      expect.objectContaining({
        id: 'msg_123',
        assistant_id: 'asst_legacy',
      }),
    ]);
  });
});
