const { logger } = require('@librechat/data-schemas');
const {
  Tools,
  ToolCallTypes,
  EModelEndpoint,
  AzureAssistantsOldEndpoint,
} = require('librechat-data-provider');

const isLegacyAzureAssistantsEndpoint = (endpoint) =>
  endpoint === EModelEndpoint.azureAssistants || endpoint === AzureAssistantsOldEndpoint;

function normalizeAssistantFileIds(fileIds = []) {
  return Array.from(
    new Set(fileIds.filter((fileId) => typeof fileId === 'string' && fileId.trim().length > 0)),
  );
}

function normalizeInstruction(instruction) {
  const normalizedInstruction = instruction?.trim();
  return normalizedInstruction ? normalizedInstruction : undefined;
}

function mergeAssistantFileIds(...fileIdGroups) {
  return normalizeAssistantFileIds(fileIdGroups.flat());
}

function getAssistantFileReferenceId(file) {
  const fileId = file?.file_id ?? file?.id;
  return typeof fileId === 'string' ? fileId : null;
}

function getAssistantToolKey(tool) {
  if (!tool || typeof tool !== 'object') {
    return null;
  }

  if (tool.type === 'function') {
    const functionName = tool.function?.name;
    return typeof functionName === 'string' && functionName.length > 0
      ? `function:${functionName}`
      : 'function';
  }

  return typeof tool.type === 'string' && tool.type.length > 0 ? `type:${tool.type}` : null;
}

function mergeAssistantTools(primaryTools = [], fallbackTools = []) {
  const mergedTools = [];
  const seenTools = new Set();

  for (const tool of [...primaryTools, ...fallbackTools]) {
    const toolKey = getAssistantToolKey(tool);

    if (!toolKey || seenTools.has(toolKey)) {
      continue;
    }

    seenTools.add(toolKey);
    mergedTools.push(tool);
  }

  return mergedTools;
}

function mergeAssistantFileSearchResources(primaryResource = {}, fallbackResource = {}) {
  const vector_store_ids = mergeAssistantFileIds(
    fallbackResource?.vector_store_ids ?? [],
    primaryResource?.vector_store_ids ?? [],
  );
  const file_ids = mergeAssistantFileIds(
    fallbackResource?.file_ids ?? [],
    primaryResource?.file_ids ?? [],
  );
  const files = [...(fallbackResource?.files ?? []), ...(primaryResource?.files ?? [])];

  const mergedResource = {
    ...(fallbackResource ?? {}),
    ...(primaryResource ?? {}),
  };

  if (vector_store_ids.length > 0) {
    mergedResource.vector_store_ids = vector_store_ids;
  }

  if (file_ids.length > 0) {
    mergedResource.file_ids = file_ids;
  }

  if (files.length > 0) {
    mergedResource.files = files;
  }

  return Object.keys(mergedResource).length > 0 ? mergedResource : undefined;
}

async function findAssistantInList({ openai, assistantId }) {
  const listAssistants = openai?.beta?.assistants?.list;

  if (!assistantId || typeof listAssistants !== 'function') {
    return null;
  }

  let after;
  let hasMore = true;

  while (hasMore) {
    const response = await listAssistants.call(openai.beta.assistants, {
      limit: 100,
      order: 'desc',
      ...(after ? { after } : {}),
    });
    const body = response?.body ?? response;
    const assistants = Array.isArray(body?.data) ? body.data : [];
    const assistant = assistants.find((candidate) => candidate?.id === assistantId);

    if (assistant) {
      return assistant;
    }

    after = body?.last_id;
    hasMore = body?.has_more === true && typeof after === 'string' && after.length > 0;
  }

  return null;
}

async function hydrateAssistantLegacyConfig({ openai, assistant = {} }) {
  if (!assistant?.id) {
    return assistant;
  }

  const listedAssistant = await findAssistantInList({
    openai,
    assistantId: assistant.id,
  });

  if (!listedAssistant) {
    return assistant;
  }

  const file_ids = mergeAssistantFileIds(listedAssistant.file_ids ?? [], assistant.file_ids ?? []);
  const file_search = mergeAssistantFileSearchResources(
    assistant.tool_resources?.file_search,
    listedAssistant.tool_resources?.file_search,
  );
  const code_interpreter =
    assistant.tool_resources?.code_interpreter ?? listedAssistant.tool_resources?.code_interpreter;
  const tool_resources = {
    ...(listedAssistant.tool_resources ?? {}),
    ...(assistant.tool_resources ?? {}),
    ...(file_search ? { file_search } : {}),
    ...(code_interpreter ? { code_interpreter } : {}),
  };

  return {
    ...listedAssistant,
    ...assistant,
    tools: mergeAssistantTools(assistant.tools ?? [], listedAssistant.tools ?? []),
    ...(file_ids.length > 0 ? { file_ids } : {}),
    ...(Object.keys(tool_resources).length > 0 ? { tool_resources } : {}),
  };
}

async function listAssistantFileReferences({ openai, assistantId }) {
  const listFiles = openai?.beta?.assistants?.files?.list;

  if (!assistantId || typeof listFiles !== 'function') {
    return [];
  }

  try {
    const response = listFiles.call(openai.beta.assistants.files, assistantId);

    if (response && typeof response[Symbol.asyncIterator] === 'function') {
      const files = [];

      for await (const file of response) {
        files.push(file);
      }

      return files;
    }

    const resolvedResponse = await response;
    const files = resolvedResponse?.data ?? resolvedResponse?.body?.data;

    return Array.isArray(files) ? files : [];
  } catch (error) {
    logger.warn('[assistantToolAccess] Failed to list assistant files', {
      assistant_id: assistantId,
      error: error?.message ?? String(error),
    });
    return [];
  }
}

async function hydrateAssistantLegacyFileIds({ openai, assistant = {} }) {
  const normalizedFileIds = normalizeAssistantFileIds(assistant.file_ids);

  if (normalizedFileIds.length > 0) {
    if (normalizedFileIds.length === (assistant.file_ids?.length ?? 0)) {
      return assistant;
    }

    return {
      ...assistant,
      file_ids: normalizedFileIds,
    };
  }

  const assistantFiles = await listAssistantFileReferences({
    openai,
    assistantId: assistant.id,
  });
  const legacyFileIds = normalizeAssistantFileIds(
    assistantFiles.map((file) => getAssistantFileReferenceId(file)),
  );

  if (legacyFileIds.length === 0) {
    return assistant;
  }

  return {
    ...assistant,
    file_ids: legacyFileIds,
  };
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
      const fileReferenceId = vectorStoreFile?.file_id ?? vectorStoreFile?.id;

      if (!fileReferenceId) {
        continue;
      }

      const file = await getAssistantFileMetadata({
        openai,
        file_id: fileReferenceId,
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
  const hydratedAssistant = await hydrateAssistantLegacyFileIds({
    openai,
    assistant,
  });
  const fileCache = new Map();
  const fileSearchResource = hydratedAssistant.tool_resources?.file_search;
  const codeInterpreterFileIds = availability.hasCodeInterpreter
    ? normalizeAssistantFileIds(hydratedAssistant.tool_resources?.code_interpreter?.file_ids)
    : [];
  const directKnowledgeFileIds = availability.hasFileSearch
    ? normalizeAssistantFileIds([
        ...(hydratedAssistant.file_ids ?? []),
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
  const allFiles = [];

  for (const file of availableToolFiles) {
    allFiles.push(file);

    if (file.source === Tools.code_interpreter) {
      codeInterpreterFiles.push(file);
      continue;
    }

    if (file.source === Tools.file_search) {
      knowledgeFiles.push(file);
    }
  }

  const sections = [];

  sections.push(
    [
      'All available files for this conversation:',
      ...allFiles.map((file) => `- ${file.filename}`),
    ].join('\n'),
  );

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
    'When the user asks for attached files, joint files, available files, or asks how many files are available, you must return one complete list that includes both code interpreter files and knowledge or file search files.',
    'Do not omit knowledge or file search documents just because they come from a vector store or assistant knowledge instead of direct message attachments.',
    'Refer to the files by their filenames only, and never expose internal file identifiers in your answer.',
    ...sections,
  ].join('\n\n');
}

function buildAssistantRunTools({ assistant = {}, availability, endpoint }) {
  const tools = assistant.tools ?? [];

  if (!availability?.hasFileSearch || !isLegacyAzureAssistantsEndpoint(endpoint)) {
    return tools;
  }

  const hasKnowledgeTool = tools.some(
    (tool) => tool?.type === Tools.file_search || tool?.type === Tools.retrieval,
  );

  if (hasKnowledgeTool) {
    return tools;
  }

  return mergeAssistantTools(tools, [{ type: Tools.retrieval }]);
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
      assistantFileIds.length > 0 ||
      fileSearchFileIds.length > 0 ||
      vectorStoreIds.length > 0 ||
      (fileSearchResource?.files?.length ?? 0) > 0,
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
    tools: buildAssistantRunTools({
      assistant,
      availability,
      endpoint,
    }),
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

function applyAssistantRunToolAccess({ assistant, body, endpoint }) {
  const availability = getAssistantToolAvailability(assistant);
  const unavailableToolInstructions = getUnavailableToolInstructions(availability);

  body.tools = buildAssistantRunTools({
    assistant,
    availability,
    endpoint,
  });

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

  body.additional_instructions = [
    normalizeInstruction(body.additional_instructions),
    fileInstructions,
  ]
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
  hydrateAssistantLegacyConfig,
  hydrateAssistantLegacyFileIds,
  requiresTemporaryAssistant,
};
