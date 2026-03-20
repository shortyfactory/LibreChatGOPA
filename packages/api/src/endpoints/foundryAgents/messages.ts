import type {
  MessageContentUnion,
  MessageImageFileContent,
  MessageTextAnnotationUnion,
  MessageTextContent,
  MessageTextFileCitationAnnotation,
  MessageTextFilePathAnnotation,
  ThreadMessage,
} from '@azure/ai-agents';

type FoundryProcessableFilePathAnnotation = {
  type: 'file_path';
  text: string;
  file_path: {
    file_id: string;
  };
  start_index?: number;
  end_index?: number;
};

type FoundryProcessableFileCitationAnnotation = {
  type: 'file_citation';
  text: string;
  file_citation: {
    file_id: string;
    quote?: string;
  };
  start_index?: number;
  end_index?: number;
};

type FoundryProcessableTextContent = {
  type: 'text';
  text: {
    value: string;
    annotations: Array<
      FoundryProcessableFileCitationAnnotation | FoundryProcessableFilePathAnnotation
    >;
  };
};

type FoundryProcessableImageFileContent = {
  type: 'image_file';
  image_file: {
    file_id: string;
  };
};

export type FoundryProcessableMessageContent =
  | FoundryProcessableImageFileContent
  | FoundryProcessableTextContent;

export type FoundryProcessableThreadMessage = {
  id: string;
  object: 'thread.message';
  created_at: number;
  thread_id: string;
  role: 'assistant' | 'user';
  content: FoundryProcessableMessageContent[];
  assistant_id: string | null;
  run_id: string | null;
  metadata: Record<string, string> | null;
};

function isFoundryTextContent(content: MessageContentUnion): content is MessageTextContent {
  return content.type === 'text';
}

function isFoundryImageFileContent(
  content: MessageContentUnion,
): content is MessageImageFileContent {
  return content.type === 'image_file';
}

function isFoundryFilePathAnnotation(
  annotation: MessageTextAnnotationUnion,
): annotation is MessageTextFilePathAnnotation {
  return annotation.type === 'file_path';
}

function isFoundryFileCitationAnnotation(
  annotation: MessageTextAnnotationUnion,
): annotation is MessageTextFileCitationAnnotation {
  return annotation.type === 'file_citation';
}

function isSandboxFileReference(annotation: MessageTextFileCitationAnnotation): boolean {
  return annotation.text.startsWith('sandbox:/');
}

function mapFoundryAnnotation(
  annotation: MessageTextAnnotationUnion,
): FoundryProcessableFileCitationAnnotation | FoundryProcessableFilePathAnnotation | null {
  if (isFoundryFilePathAnnotation(annotation)) {
    const fileId = annotation.filePath.fileId;

    if (!fileId) {
      return null;
    }

    return {
      type: 'file_path',
      text: annotation.text,
      file_path: {
        file_id: fileId,
      },
      start_index: annotation.startIndex,
      end_index: annotation.endIndex,
    };
  }

  if (!isFoundryFileCitationAnnotation(annotation)) {
    return null;
  }

  const fileId = annotation.fileCitation.fileId;
  if (!fileId) {
    return null;
  }

  if (isSandboxFileReference(annotation)) {
    return {
      type: 'file_path',
      text: annotation.text,
      file_path: {
        file_id: fileId,
      },
      start_index: annotation.startIndex,
      end_index: annotation.endIndex,
    };
  }

  return {
    type: 'file_citation',
    text: annotation.text,
    file_citation: {
      file_id: fileId,
      quote: annotation.fileCitation.quote,
    },
    start_index: annotation.startIndex,
    end_index: annotation.endIndex,
  };
}

function mapFoundryContent(content: MessageContentUnion): FoundryProcessableMessageContent | null {
  if (isFoundryTextContent(content)) {
    return {
      type: 'text',
      text: {
        value: content.text.value,
        annotations: content.text.annotations
          .map(mapFoundryAnnotation)
          .filter(
            (
              annotation,
            ): annotation is
              | FoundryProcessableFileCitationAnnotation
              | FoundryProcessableFilePathAnnotation => annotation !== null,
          ),
      },
    };
  }

  if (!isFoundryImageFileContent(content) || !content.imageFile.fileId) {
    return null;
  }

  return {
    type: 'image_file',
    image_file: {
      file_id: content.imageFile.fileId,
    },
  };
}

export function normalizeFoundryMessageForProcessing(
  message: ThreadMessage,
): FoundryProcessableThreadMessage {
  return {
    id: message.id,
    object: 'thread.message',
    created_at: Math.floor(message.createdAt.getTime() / 1000),
    thread_id: message.threadId,
    role: message.role,
    content: message.content
      .map(mapFoundryContent)
      .filter((content): content is FoundryProcessableMessageContent => content !== null),
    assistant_id: message.assistantId,
    run_id: message.runId,
    metadata: message.metadata ?? null,
  };
}

export function normalizeFoundryMessagesForProcessing(
  messages: ThreadMessage[],
): FoundryProcessableThreadMessage[] {
  return messages.map(normalizeFoundryMessageForProcessing);
}

export function extractFoundryResponseText(messages: FoundryProcessableThreadMessage[]): string {
  return messages.reduce((text, message) => {
    return (
      text +
      message.content.reduce((messageText, content) => {
        if (content.type !== 'text') {
          return messageText;
        }

        return messageText + content.text.value;
      }, '')
    );
  }, '');
}
