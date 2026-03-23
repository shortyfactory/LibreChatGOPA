const { logger } = require('@librechat/data-schemas');
const { Tools, ToolCallTypes } = require('librechat-data-provider');

function normalizeAssistantFileIds(fileIds = []) {
  return Array.from(
    new Set(
      fileIds.filter((fileId) => typeof fileId === 'string' && fileId.trim().length > 0),
    ),
  );
}

function normalizeInstruction(instruction) {
  const normalizedInstruction = instruction?.trim();
  return normalizedInstruction ? normalizedInstruction : undefined;
}

function hasResolvedAssistantFilename(file) {
  const fileId = file?.file_id ?? file?.id;

  return (
    typeof file?.filename === 'string' &&
    file.filename.trim().length > 0 &&
    (!fileId || file.filename !== fileId)
  );
}

function createAvailableToolFile({ file, source }) {
  const fileId = file?.file_id ?? file?.id;

  if (!fileId || !hasResolvedAssistantFilename(file)) {
    return null;
  }

  return {
    fileId,
    filename: file.filename,
    source,
  };
}

function getAssistantSourceLabel(source) {
  return source === Tools.code_interpreter ? 'Code interpreter files' : 'Knowledge files';
}

async function getAssistantFileMetadata({ openai, file_id, fileCache }) {
  if (fileCache.has(file_id)) {
    return fileCache.get(file_id);
  }

  const filePromise = openai.files
    .retrieve(file_id)
    .then((file) => ({
      ...file,
      file_id,
      filename: file.filename ?? file_id,
    }))
    .catch((error) => {
      logger.warn('[assistantToolAccess] Failed to retrieve assistant file metadata', {
        file_id,
        error: error?.message ?? String(error),
      });
      return null;
    });

  fileCache.set(file_id, filePromise);
  return filePromise;
}

async function listVectorStoreFiles({ openai, vector_store_id, fileCache }) {
  try {
    const files = [];

    for await (const vectorStoreFile of openai.vectorStores.files.list(vector_store_id, {
      filter: 'completed',
      order: 'desc',
    })) {
      const file = await getAssistantFileMetadata({
        openai,
        file_id: vectorStoreFile.id,
        fileCache,
      });

      if (file) {
        files.push(file);
      }
    }

    return files;
  } catch (error) {
    logger.warn('[assistantToolAccess] Failed to retrieve vector store files', {
      vector_store_id,
      error: error?.message ?? String(error),
    });
    return [];
  }
}

async function getAssistantAvailableToolFiles({ openai, assistant = {}, availability }) {
  const fileCache = new Map();
  const fileSearchResource = assistant.tool_resources?.file_search;
  const codeInterpreterFileIds = availability.hasCodeInterpreter
    ? normalizeAssistantFileIds(assistant.tool_resources?.code_interpreter?.file_ids)
    : [];
  const directKnowledgeFileIds = availability.hasFileSearch
    ? normalizeAssistantFileIds([
        ...(assistant.file_ids ?? []),
        ...(fileSearchResource?.file_ids ?? []),
      ])
    : [];
  const vectorStoreIds = availability.hasFileSearch
    ? normalizeAssistantFileIds(fileSearchResource?.vector_store_ids)
    : [];

  const codeInterpreterFiles = (
    await Promise.all(
      codeInterpreterFileIds.map((file_id) =>
        getAssistantFileMetadata({
          openai,
          file_id,
          fileCache,
        }),
      ),
    )
  )
    .map((file) => createAvailableToolFile({ file, source: Tools.code_interpreter }))
    .filter(Boolean);

  const directKnowledgeFiles = (
    await Promise.all(
      directKnowledgeFileIds.map((file_id) =>
        getAssistantFileMetadata({
          openai,
          file_id,
          fileCache,
        }),
      ),
    )
  )
    .map((file) => createAvailableToolFile({ file, source: Tools.file_search }))
    .filter(Boolean);

  const vectorStoreFiles = (
    await Promise.all(
      vectorStoreIds.map((vector_store_id) =>
        listVectorStoreFiles({
          openai,
          vector_store_id,
          fileCache,
        }),
      ),
    )
  )
    .flat()
    .map((file) => createAvailableToolFile({ file, source: Tools.file_search }))
    .filter(Boolean);

  const filesBySourceAndId = new Map();
  const allFiles = [...codeInterpreterFiles, ...directKnowledgeFiles, ...vectorStoreFiles];

  for (const file of allFiles) {
    filesBySourceAndId.set(`${file.source}:${file.fileId}`, file);
  }

  return Array.from(filesBySourceAndId.values());
}

function buildAssistantRunFileInstructions(availableToolFiles = []) {
  if (availableToolFiles.length === 0) {
    return undefined;
  }

  const codeInterpreterFiles = [];
  const knowledgeFiles = [];

  for (const file of availableToolFiles) {
    if (file.source === Tools.code_interpreter) {
      codeInterpreterFiles.push(file);
      continue;
    }

    if (file.source === Tools.file_search) {
      knowledgeFiles.push(file);
    }
  }

  const sections = [];

  if (codeInterpreterFiles.length > 0) {
    sections.push(
      [
        `${getAssistantSourceLabel(Tools.code_interpreter)}:`,
        ...codeInterpreterFiles.map((file) => `- ${file.filename}`),
      ].join('\n'),
    );
  }

  if (knowledgeFiles.length > 0) {
    sections.push(
      [
        `${getAssistantSourceLabel(Tools.file_search)}:`,
        ...knowledgeFiles.map((file) => `- ${file.filename}`),
      ].join('\n'),
    );
  }

  if (sections.length === 0) {
    return undefined;
  }

  return [
    'The following files are already available to your tools for this conversation.',
    'Do not say that you cannot see attached files and do not ask the user to upload them again unless they are truly unavailable.',
    'Use these files directly when the user asks to summarize, analyze, compare, extract, translate, or list the attached files.',
    'Refer to the files by their filenames only, and never expose internal file identifiers in your answer.',
    ...sections,
  ].join('\n\n');
}

function getAssistantToolAvailability(assistant = {}) {
  const toolTypes = new Set(
    (assistant.tools ?? []).map((tool) => tool?.type).filter((type) => typeof type === 'string'),
  );

  const codeInterpreterFileIds = assistant.tool_resources?.code_interpreter?.file_ids ?? [];
  const fileSearchResource = assistant.tool_resources?.file_search;
  const fileSearchFileIds = fileSearchResource?.file_ids ?? [];
  const vectorStoreIds = fileSearchResource?.vector_store_ids ?? [];
  const assistantFileIds = assistant.file_ids ?? [];

  return {
    hasCodeInterpreter: toolTypes.has(Tools.code_interpreter),
    hasFileSearch: toolTypes.has(Tools.file_search) || toolTypes.has(Tools.retrieval),
    hasCodeInterpreterFiles: codeInterpreterFileIds.length > 0,
    hasAssistantFileIds: assistantFileIds.length > 0,
    hasKnowledgeFiles:
      assistantFileIds.length > 0 || fileSearchFileIds.length > 0 || vectorStoreIds.length > 0,
  };
}

function buildAssistantAttachmentTools({ hasCodeInterpreter, hasFileSearch }) {
  const tools = [];

  if (hasCodeInterpreter) {
    tools.push({ type: ToolCallTypes.CODE_INTERPRETER });
  }

  if (hasFileSearch) {
    tools.push({ type: ToolCallTypes.FILE_SEARCH });
  }

  return tools;
}

function requiresTemporaryAssistant(availability) {
  return (
    (!availability.hasCodeInterpreter && availability.hasCodeInterpreterFiles) ||
    (!availability.hasFileSearch && availability.hasKnowledgeFiles)
  );
}

function buildRuntimeAssistantPayload({ assistant = {}, availability, userId, endpoint }) {
  const fileSearchResource = assistant.tool_resources?.file_search;
  const codeInterpreterResource = assistant.tool_resources?.code_interpreter;
  const tool_resources = {};

  if (availability.hasCodeInterpreter && codeInterpreterResource?.file_ids?.length) {
    tool_resources.code_interpreter = {
      file_ids: codeInterpreterResource.file_ids,
    };
  }

  if (availability.hasFileSearch && fileSearchResource) {
    tool_resources.file_search = {
      ...(fileSearchResource.vector_store_ids?.length
        ? { vector_store_ids: fileSearchResource.vector_store_ids }
        : {}),
      ...(fileSearchResource.file_ids?.length ? { file_ids: fileSearchResource.file_ids } : {}),
    };
  }

  return {
    model: assistant.model,
    name: assistant.name,
    description: assistant.description,
    instructions: assistant.instructions,
    tools: assistant.tools ?? [],
    metadata: {
      ...(assistant.metadata ?? {}),
      author: userId,
      endpoint,
      parent_assistant_id: assistant.id,
      runtime_clone: 'true',
    },
    ...(availability.hasFileSearch && assistant.file_ids?.length
      ? { file_ids: assistant.file_ids }
      : {}),
    ...(Object.keys(tool_resources).length > 0 ? { tool_resources } : {}),
  };
}

function getUnavailableToolInstructions({
  hasCodeInterpreter,
  hasFileSearch,
  hasCodeInterpreterFiles,
  hasKnowledgeFiles,
}) {
  const instructions = [];

  if (!hasCodeInterpreter && hasCodeInterpreterFiles) {
    instructions.push(
      'Code interpreter is disabled for this assistant in this run. Files attached only to code interpreter are unavailable here. Do not list them, describe them, summarize them, cite them, or claim that you can access them.',
    );
  }

  if (!hasFileSearch && hasKnowledgeFiles) {
    instructions.push(
      'Knowledge retrieval is disabled for this assistant in this run. Assistant knowledge files and retrieved documents are unavailable here. Do not list them, describe them, summarize them, cite them, or claim that you can access them.',
    );
  }

  return instructions.join('\n');
}

function applyAssistantRunToolAccess({ assistant, body }) {
  const availability = getAssistantToolAvailability(assistant);
  const unavailableToolInstructions = getUnavailableToolInstructions(availability);

  body.tools = assistant?.tools ?? [];

  if (!availability.hasFileSearch && availability.hasAssistantFileIds) {
    body.file_ids = [];
  }

  if (unavailableToolInstructions) {
    body.additional_instructions = [body.additional_instructions, unavailableToolInstructions]
      .map((instruction) => instruction?.trim())
      .filter(Boolean)
      .join('\n');
  }

  return availability;
}

async function applyAssistantRunFileNameContext({ openai, assistant, availability, body }) {
  if (!openai || !assistant || !availability || !body) {
    return [];
  }

  const availableToolFiles = await getAssistantAvailableToolFiles({
    openai,
    assistant,
    availability,
  });
  const fileInstructions = buildAssistantRunFileInstructions(availableToolFiles);

  if (!fileInstructions) {
    return availableToolFiles;
  }

  body.additional_instructions = [normalizeInstruction(body.additional_instructions), fileInstructions]
    .filter(Boolean)
    .join('\n\n');

  return availableToolFiles;
}

module.exports = {
  applyAssistantRunFileNameContext,
  applyAssistantRunToolAccess,
  buildAssistantRunFileInstructions,
  buildAssistantAttachmentTools,
  buildRuntimeAssistantPayload,
  getAssistantToolAvailability,
  requiresTemporaryAssistant,
};
