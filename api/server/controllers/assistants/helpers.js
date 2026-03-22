const {
  SystemRoles,
  EModelEndpoint,
  defaultOrderQuery,
  defaultAssistantsVersion,
  AzureAssistantsNewEndpoint,
  AzureAssistantsOldEndpoint,
  resolveAssistantsConfigEndpoint,
} = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const { isFoundryAgentsConfigured, listFoundryAgents } = require('@librechat/api');
const {
  initializeClient: initAzureClient,
} = require('~/server/services/Endpoints/azureAssistants');
const { initializeClient } = require('~/server/services/Endpoints/assistants');
const { getEndpointsConfig } = require('~/server/services/Config');

const isLegacyAzureAssistantsEndpoint = (endpoint) =>
  endpoint === EModelEndpoint.azureAssistants || endpoint === AzureAssistantsOldEndpoint;

/**
 * @param {ServerRequest} req
 * @param {string} [endpoint]
 * @returns {Promise<string>}
 */
const getCurrentVersion = async (req, endpoint) => {
  const index = req.baseUrl.lastIndexOf('/v');
  let version = index !== -1 ? req.baseUrl.substring(index + 1, index + 3) : null;
  if (!version && req.body.version) {
    version = `v${req.body.version}`;
  }
  if (!version && endpoint) {
    const endpointsConfig = await getEndpointsConfig(req);
    const configEndpoint = resolveAssistantsConfigEndpoint(endpoint);
    version = `v${
      endpointsConfig?.[configEndpoint]?.version ??
      defaultAssistantsVersion[endpoint] ??
      defaultAssistantsVersion[configEndpoint]
    }`;
  }
  if (!version?.startsWith('v') && version.length !== 2) {
    throw new Error(`[${req.baseUrl}] Invalid version: ${version}`);
  }
  return version;
};

/**
 * Asynchronously lists assistants based on provided query parameters.
 *
 * Initializes the client with the current request and response objects and lists assistants
 * according to the query parameters. This function abstracts the logic for non-Azure paths.
 *
 * @deprecated
 * @async
 * @param {object} params - The parameters object.
 * @param {object} params.req - The request object, used for initializing the client.
 * @param {object} params.res - The response object, used for initializing the client.
 * @param {string} params.version - The API version to use.
 * @param {object} params.query - The query parameters to list assistants (e.g., limit, order).
 * @returns {Promise<object>} A promise that resolves to the response from the `openai.beta.assistants.list` method call.
 */
const _listAssistants = async ({ req, res, version, query }) => {
  const { openai } = await getOpenAIClient({ req, res, version });
  return listAllAssistantsWithClient({ openai, query });
};

const createGroupRequest = (req, model) => {
  const groupReq = Object.create(req);
  groupReq.body = {
    ...(req.body ?? {}),
    model,
  };
  return groupReq;
};

const listAllAssistantsWithClient = async ({ openai, query }) => {
  const allAssistants = [];
  let first_id;
  let last_id;
  let afterToken = query.after;
  let hasMore = true;

  while (hasMore) {
    const response = await openai.beta.assistants.list({
      ...query,
      after: afterToken,
    });

    const { body } = response;

    allAssistants.push(...body.data);
    hasMore = body.has_more;

    if (!first_id) {
      first_id = body.first_id;
    }

    if (hasMore) {
      afterToken = body.last_id;
    } else {
      last_id = body.last_id;
    }
  }

  return {
    data: allAssistants,
    body: {
      data: allAssistants,
      has_more: false,
      first_id,
      last_id,
    },
  };
};

const getAssistantFileMetadata = async ({ openai, file_id, fileCache }) => {
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
      logger.warn('[listAssistantsForAzure] Failed to retrieve assistant file metadata', {
        file_id,
        error: error?.message ?? String(error),
      });
      return null;
    });

  fileCache.set(file_id, filePromise);
  return filePromise;
};

const listVectorStoreFiles = async ({ openai, vector_store_id, fileCache }) => {
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
    logger.warn('[listAssistantsForAzure] Failed to retrieve vector store files', {
      vector_store_id,
      error: error?.message ?? String(error),
    });
    return [];
  }
};

const enrichAzureAssistantFiles = async ({ assistants, openai }) => {
  const fileCache = new Map();

  return Promise.all(
    assistants.map(async (assistant) => {
      const codeInterpreter = assistant.tool_resources?.code_interpreter;
      const codeInterpreterFileIds = codeInterpreter?.file_ids;
      const fileSearch = assistant.tool_resources?.file_search;
      const vectorStoreIds = fileSearch?.vector_store_ids;

      const codeInterpreterFiles = (
        await Promise.all(
          (codeInterpreterFileIds ?? []).map((file_id) =>
            getAssistantFileMetadata({
              openai,
              file_id,
              fileCache,
            }),
          ),
        )
      ).filter(Boolean);

      const fileSearchFiles = (
        await Promise.all(
          (vectorStoreIds ?? []).map((vector_store_id) =>
            listVectorStoreFiles({
              openai,
              vector_store_id,
              fileCache,
            }),
          ),
        )
      )
        .flat()
        .filter(Boolean);

      const uniqueFileSearchFiles = Array.from(
        new Map(
          fileSearchFiles
            .map((file) => {
              const file_id = file.file_id ?? file.id;

              if (!file_id) {
                return null;
              }

              return [
                file_id,
                {
                  ...file,
                  file_id,
                },
              ];
            })
            .filter(Boolean),
        ).values(),
      );

      if (codeInterpreterFiles.length === 0 && uniqueFileSearchFiles.length === 0) {
        return assistant;
      }

      return {
        ...assistant,
        tool_resources: {
          ...assistant.tool_resources,
          ...(codeInterpreterFiles.length > 0
            ? {
                code_interpreter: {
                  ...codeInterpreter,
                  files: codeInterpreterFiles,
                },
              }
            : {}),
          ...(uniqueFileSearchFiles.length > 0
            ? {
                file_search: {
                  ...fileSearch,
                  file_ids: uniqueFileSearchFiles
                    .map((file) => file.file_id ?? file.id)
                    .filter(Boolean),
                  files: uniqueFileSearchFiles,
                },
              }
            : {}),
        },
      };
    }),
  );
};

/**
 * Fetches all assistants based on provided query params, until `has_more` is `false`.
 *
 * @async
 * @param {object} params - The parameters object.
 * @param {object} params.req - The request object, used for initializing the client.
 * @param {object} params.res - The response object, used for initializing the client.
 * @param {string} params.version - The API version to use.
 * @param {Omit<AssistantListParams, 'endpoint'>} params.query - The query parameters to list assistants (e.g., limit, order).
 * @returns {Promise<Array<Assistant>>} A promise that resolves to the response from the `openai.beta.assistants.list` method call.
 */
const listAllAssistants = async ({ req, res, version, query }) => {
  /** @type {{ openai: OpenAI }} */
  const { openai } = await getOpenAIClient({ req, res, version });
  return listAllAssistantsWithClient({ openai, query });
};

/**
 * Asynchronously lists assistants for Azure configured groups.
 *
 * Iterates through Azure configured assistant groups, initializes the client with the current request and response objects,
 * lists assistants based on the provided query parameters, and merges their data alongside the model information into a single array.
 *
 * @async
 * @param {object} params - The parameters object.
 * @param {object} params.req - The request object, used for initializing the client and manipulating the request body.
 * @param {object} params.res - The response object, used for initializing the client.
 * @param {string} params.version - The API version to use.
 * @param {TAzureConfig} params.azureConfig - The Azure configuration object containing assistantGroups and groupMap.
 * @param {object} params.query - The query parameters to list assistants (e.g., limit, order).
 * @returns {Promise<AssistantListResponse>} A promise that resolves to an array of assistant data merged with their respective model information.
 */
const listAssistantsForAzure = async ({ req, res, version, azureConfig = {}, query }) => {
  const promises = [];

  const { groupMap, assistantGroups } = azureConfig;

  for (const groupName of assistantGroups) {
    const group = groupMap[groupName];
    const currentModelTuples = Object.entries(group?.models);
    const firstModel = currentModelTuples[0]?.[0];

    if (!firstModel) {
      continue;
    }

    promises.push(
      (async () => {
        const groupReq = createGroupRequest(req, firstModel);
        const { openai } = await getOpenAIClient({ req: groupReq, res, version });
        const response = await listAllAssistantsWithClient({ openai, query });
        const assistants = await enrichAzureAssistantFiles({
          assistants: response.data,
          openai,
        });

        return {
          group,
          currentModelTuples,
          assistants,
        };
      })(),
    );
  }

  const resolvedQueries = await Promise.all(promises);
  const data = resolvedQueries.flatMap(({ assistants, group: currentGroup, currentModelTuples }) =>
    assistants.map((assistant) => {
      const deploymentName = assistant.model;
      const firstModel = currentModelTuples[0][0];

      if (currentGroup.deploymentName === deploymentName) {
        return { ...assistant, model: firstModel };
      }

      for (const [model, modelConfig] of currentModelTuples) {
        if (modelConfig.deploymentName === deploymentName) {
          return { ...assistant, model };
        }
      }

      return { ...assistant, model: firstModel };
    }),
  );

  return {
    first_id: data[0]?.id,
    last_id: data[data.length - 1]?.id,
    object: 'list',
    has_more: false,
    data,
  };
};

/**
 * Initializes the OpenAI client.
 * @param {object} params - The parameters object.
 * @param {ServerRequest} params.req - The request object.
 * @param {ServerResponse} params.res - The response object.
 * @param {TEndpointOption} params.endpointOption - The endpoint options.
 * @param {boolean} params.initAppClient - Whether to initialize the app client.
 * @param {string} params.overrideEndpoint - The endpoint to override.
 * @returns {Promise<{ openai: OpenAI, openAIApiKey: string }>} - The initialized OpenAI SDK client.
 */
async function getOpenAIClient({ req, res, endpointOption, initAppClient, overrideEndpoint }) {
  let endpoint = overrideEndpoint ?? req.body?.endpoint ?? req.query?.endpoint;
  const version = await getCurrentVersion(req, endpoint);
  if (!endpoint) {
    throw new Error(`[${req.baseUrl}] Endpoint is required`);
  }

  let result;
  if (endpoint === EModelEndpoint.assistants) {
    result = await initializeClient({ req, res, version, endpointOption, initAppClient });
  } else if (isLegacyAzureAssistantsEndpoint(endpoint)) {
    result = await initAzureClient({ req, res, version, endpointOption, initAppClient });
  }

  return result;
}

/**
 * Returns a list of assistants.
 * @param {object} params
 * @param {object} params.req - Express Request
 * @param {AssistantListParams} [params.req.query] - The assistant list parameters for pagination and sorting.
 * @param {object} params.res - Express Response
 * @param {string} [params.overrideEndpoint] - The endpoint to override the request endpoint.
 * @returns {Promise<AssistantListResponse>} 200 - success response - application/json
 */
const fetchAssistants = async ({ req, res, overrideEndpoint }) => {
  const appConfig = req.config;
  const {
    limit = 100,
    order = 'desc',
    after,
    before,
    endpoint,
  } = req.query ?? {
    endpoint: overrideEndpoint,
    ...defaultOrderQuery,
  };

  const version = await getCurrentVersion(req, endpoint);
  const query = { limit, order, after, before };

  /** @type {AssistantListResponse} */
  let body;

  if (endpoint === EModelEndpoint.assistants) {
    ({ body } = await listAllAssistants({ req, res, version, query }));
  } else if (endpoint === AzureAssistantsNewEndpoint) {
    body = await listFoundryAgents(query);
  } else if (endpoint === EModelEndpoint.azureAssistants && isFoundryAgentsConfigured()) {
    body = await listFoundryAgents(query);
  } else if (isLegacyAzureAssistantsEndpoint(endpoint)) {
    const azureConfig = appConfig.endpoints?.[EModelEndpoint.azureOpenAI];
    body = await listAssistantsForAzure({ req, res, version, azureConfig, query });
  }

  if (req.user.role === SystemRoles.ADMIN) {
    return body;
  }

  const configEndpoint = resolveAssistantsConfigEndpoint(endpoint);

  if (!appConfig.endpoints?.[configEndpoint]) {
    return body;
  }

  body.data = filterAssistants({
    userId: req.user.id,
    assistants: body.data,
    assistantsConfig: appConfig.endpoints?.[configEndpoint],
  });
  return body;
};

/**
 * Filter assistants based on configuration.
 *
 * @param {object} params - The parameters object.
 * @param {string} params.userId -  The user ID to filter private assistants.
 * @param {Assistant[]} params.assistants - The list of assistants to filter.
 * @param {Partial<TAssistantEndpoint>} params.assistantsConfig -  The assistant configuration.
 * @returns {Assistant[]} - The filtered list of assistants.
 */
function filterAssistants({ assistants, userId, assistantsConfig }) {
  const { supportedIds, excludedIds, privateAssistants } = assistantsConfig;
  if (privateAssistants) {
    return assistants.filter((assistant) => userId === assistant.metadata?.author);
  } else if (supportedIds?.length) {
    return assistants.filter((assistant) => supportedIds.includes(assistant.id));
  } else if (excludedIds?.length) {
    return assistants.filter((assistant) => !excludedIds.includes(assistant.id));
  }
  return assistants;
}

module.exports = {
  getOpenAIClient,
  fetchAssistants,
  getCurrentVersion,
};
