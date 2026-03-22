import { resolveSubmissionThreadId } from '../messages';

describe('resolveSubmissionThreadId', () => {
  it('should ignore existing thread ids for a new conversation', () => {
    const threadId = resolveSubmissionThreadId({
      isNewConversation: true,
      latestMessage: { thread_id: 'thread_previous' },
      targetParentMessage: { thread_id: 'thread_parent' },
      currentMessages: [{ thread_id: 'thread_current' }],
    });

    expect(threadId).toBeUndefined();
  });

  it('should prefer the parent thread for existing conversations', () => {
    const threadId = resolveSubmissionThreadId({
      isNewConversation: false,
      latestMessage: { thread_id: 'thread_previous' },
      targetParentMessage: { thread_id: 'thread_parent' },
      currentMessages: [{ thread_id: 'thread_current' }],
    });

    expect(threadId).toBe('thread_parent');
  });

  it('should fall back to the latest message and cached messages when needed', () => {
    const threadId = resolveSubmissionThreadId({
      isNewConversation: false,
      latestMessage: { thread_id: 'thread_previous' },
      currentMessages: [{ thread_id: 'thread_current' }],
    });

    expect(threadId).toBe('thread_previous');
  });
});
