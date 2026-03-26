const fs = require('fs').promises;
const express = require('express');
const { EnvVar } = require('@librechat/agents');
const { logger } = require('@librechat/data-schemas');
const {
  getFoundryFileInfo,
  getFoundryFileArrayBuffer,
  isFoundryAgentsConfigured,
  verifyAgentUploadPermission,
} = require('@librechat/api');
const {
  Time,
  isUUID,
  CacheKeys,
  FileSources,
  SystemRoles,
  EModelEndpoint,
  AzureAssistantsOldEndpoint,
  ResourceType,
  PermissionBits,
  checkOpenAIStorage,
  isAssistantsEndpoint,
} = require('librechat-data-provider');
const {
  filterFile,
  processFileUpload,
  processDeleteRequest,
  processAgentFileUpload,
} = require('~/server/services/Files/process');
const { fileAccess } = require('~/server/middleware/accessResources/fileAccess');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { checkPermission } = require('~/server/services/PermissionService');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { refreshS3FileUrls } = require('~/server/services/Files/S3/crud');
const { hasAccessToFilesViaAgent } = require('~/server/services/Files');
const { getFiles, batchUpdateFiles } = require('~/models');
const { cleanFileName } = require('~/server/utils/files');
const { getAssistant } = require('~/models/Assistant');
const { getAgent } = require('~/models/Agent');
const { getLogStores } = require('~/cache');
const { Readable } = require('stream');

const router = express.Router();

const isAssistantBuilderUpload = (metadata = {}) =>
  isAssistantsEndpoint(metadata.endpoint) &&
  typeof metadata.assistant_id === 'string' &&
  metadata.assistant_id.length > 0 &&
  metadata.message_file !== true &&
  metadata.message_file !== 'true';

const isAzureAssistantDownload = ({ file, file_id }) => {
  if (file.source === FileSources.azure) {
    return true;
  }

  if (!/^assistant-/i.test(file_id)) {
    return false;
  }

  const filepath = typeof file?.filepath === 'string' ? file.filepath : '';
  if (!filepath) {
    return false;
  }

  return (
    filepath.includes('.openai.azure.com/') ||
    filepath.includes('.services.ai.azure.com/') ||
    (filepath.includes('/openai/files/') && !filepath.includes('api.openai.com/v1/files/'))
  );
};

const setDownloadHeaders = ({ file, res, filename = file.filename, type = file.type }) => {
  const cleanedFilename = cleanFileName(filename);
  const metadata = {
    ...file,
    filename,
    type: type ?? file.type,
  };

  res.setHeader('Content-Disposition', `attachment; filename="${cleanedFilename}"`);
  res.setHeader('Content-Type', type ?? 'application/octet-stream');
  res.setHeader('X-File-Metadata', JSON.stringify(metadata));
};

const resolveUploadErrorMessage = (error) => {
  const errorMessage = error?.message ?? '';

  if (
    errorMessage.includes('file_ids') ||
    errorMessage.includes('Invalid file format') ||
    errorMessage.includes('No OCR result') ||
    errorMessage.includes('exceeds token limit') ||
    errorMessage.includes('RAG_API_URL not defined') ||
    errorMessage.includes('File search is not enabled for Agents') ||
    errorMessage.includes('File embedding failed') ||
    errorMessage.includes('Incorrect API key provided')
  ) {
    return errorMessage;
  }

  return 'Error processing file';
};

const tryFoundryFileDownload = async ({ file, file_id, res }) => {
  if (file.source !== FileSources.azure || !isFoundryAgentsConfigured()) {
    return false;
  }

  try {
    const foundryFileInfo = await getFoundryFileInfo(file_id);
    const resolvedFoundryFileId = foundryFileInfo?.id ?? file_id;
    const arrayBuffer = await getFoundryFileArrayBuffer(resolvedFoundryFileId);

    setDownloadHeaders({
      file,
      res,
      filename: foundryFileInfo?.filename ?? file.filename,
      type: file.type,
    });

    Readable.from(Buffer.from(arrayBuffer)).pipe(res);
    return true;
  } catch (error) {
    logger.warn(
      `[DOWNLOAD ROUTE] Foundry download failed for ${file_id}, falling back to legacy Azure route: ${error.message}`,
    );
    return false;
  }
};

const resolveOpenAIStorageFile = async ({ openai, file_id, filename }) => {
  if (typeof openai?.files?.retrieve !== 'function') {
    return {
      file_id,
      filename,
    };
  }

  try {
    const retrievedFile = await openai.files.retrieve(file_id);
    return {
      file_id: retrievedFile?.file_id ?? retrievedFile?.id ?? file_id,
      filename: retrievedFile?.filename ?? filename,
    };
  } catch (error) {
    logger.warn(
      `[DOWNLOAD ROUTE] Failed to resolve storage file for ${file_id}, using original identifier: ${error.message}`,
    );
    return {
      file_id,
      filename,
    };
  }
};

router.get('/', async (req, res) => {
  try {
    const appConfig = req.config;
    const files = await getFiles({ user: req.user.id });
    if (appConfig.fileStrategy === FileSources.s3) {
      try {
        const cache = getLogStores(CacheKeys.S3_EXPIRY_INTERVAL);
        const alreadyChecked = await cache.get(req.user.id);
        if (!alreadyChecked) {
          await refreshS3FileUrls(files, batchUpdateFiles);
          await cache.set(req.user.id, true, Time.THIRTY_MINUTES);
        }
      } catch (error) {
        logger.warn('[/files] Error refreshing S3 file URLs:', error);
      }
    }
    res.status(200).send(files);
  } catch (error) {
    logger.error('[/files] Error getting files:', error);
    res.status(400).json({ message: 'Error in request', error: error.message });
  }
});

/**
 * Get files specific to an agent
 * @route GET /files/agent/:agent_id
 * @param {string} agent_id - The agent ID to get files for
 * @returns {Promise<TFile[]>} Array of files attached to the agent
 */
router.get('/agent/:agent_id', async (req, res) => {
  try {
    const { agent_id } = req.params;

    if (!agent_id) {
      return res.status(400).json({ error: 'Agent ID is required' });
    }

    const agent = await getAgent({ id: agent_id });
    if (!agent) {
      return res.status(200).json([]);
    }

    const isAuthor = agent.author?.toString() === req.user.id.toString();
    if (req.user.role !== SystemRoles.ADMIN && !isAuthor) {
      const hasViewPermission = await checkPermission({
        userId: req.user.id,
        role: req.user.role,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        requiredPermission: PermissionBits.VIEW,
      });

      if (!hasViewPermission) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to view files for this agent',
        });
      }
    }

    const agentFileIds = [];
    if (agent.tool_resources) {
      for (const [, resource] of Object.entries(agent.tool_resources)) {
        if (resource?.file_ids && Array.isArray(resource.file_ids)) {
          agentFileIds.push(...resource.file_ids);
        }
      }
    }

    if (agentFileIds.length === 0) {
      return res.status(200).json([]);
    }

    const files = await getFiles({ file_id: { $in: agentFileIds } }, null, { text: 0 });

    res.status(200).json(files);
  } catch (error) {
    logger.error('[/files/agent/:agent_id] Error fetching agent files:', error);
    res.status(500).json({ error: 'Failed to fetch agent files' });
  }
});

router.get('/config', async (req, res) => {
  try {
    const appConfig = req.config;
    res.status(200).json(appConfig.fileConfig);
  } catch (error) {
    logger.error('[/files] Error getting fileConfig', error);
    res.status(400).json({ message: 'Error in request', error: error.message });
  }
});

router.delete('/', async (req, res) => {
  try {
    if (req.body.assistant_id && req.user.role !== SystemRoles.ADMIN) {
      return res.status(403).json({ error: 'Forbidden', message: 'Forbidden' });
    }

    if (req.body.agent_id && req.body.tool_resource) {
      const denied = await verifyAgentUploadPermission({
        req,
        res,
        metadata: {
          agent_id: req.body.agent_id,
          tool_resource: req.body.tool_resource,
        },
        getAgent,
        checkPermission,
      });

      if (denied) {
        return;
      }
    }

    const { files: _files } = req.body;

    /** @type {MongoFile[]} */
    const files = _files.filter((file) => {
      if (!file.file_id) {
        return false;
      }
      if (!file.filepath) {
        return false;
      }

      if (/^(file|assistant)-/.test(file.file_id)) {
        return true;
      }

      return isUUID.safeParse(file.file_id).success;
    });

    if (files.length === 0) {
      res.status(204).json({ message: 'Nothing provided to delete' });
      return;
    }

    const fileIds = files.map((file) => file.file_id);
    const dbFiles = await getFiles({ file_id: { $in: fileIds } });

    if (req.body.assistant_id && req.user.role === SystemRoles.ADMIN && dbFiles.length > 0) {
      await processDeleteRequest({ req, files: dbFiles });
      logger.debug(
        `[/files] Assistant files deleted successfully by admin: ${dbFiles
          .filter((f) => f.file_id)
          .map((f) => f.file_id)
          .join(', ')}`,
      );
      return res.status(200).json({ message: 'Files deleted successfully' });
    }

    if (
      req.body.agent_id &&
      req.body.tool_resource &&
      req.user.role === SystemRoles.ADMIN &&
      dbFiles.length > 0
    ) {
      await processDeleteRequest({ req, files: dbFiles });
      logger.debug(
        `[/files] Agent builder files deleted successfully by admin: ${dbFiles
          .filter((f) => f.file_id)
          .map((f) => f.file_id)
          .join(', ')}`,
      );
      return res.status(200).json({ message: 'Files deleted successfully' });
    }

    const ownedFiles = [];
    const nonOwnedFiles = [];

    for (const file of dbFiles) {
      if (file.user.toString() === req.user.id.toString()) {
        ownedFiles.push(file);
      } else {
        nonOwnedFiles.push(file);
      }
    }

    if (nonOwnedFiles.length === 0) {
      await processDeleteRequest({ req, files: ownedFiles });
      logger.debug(
        `[/files] Files deleted successfully: ${ownedFiles
          .filter((f) => f.file_id)
          .map((f) => f.file_id)
          .join(', ')}`,
      );
      res.status(200).json({ message: 'Files deleted successfully' });
      return;
    }

    let authorizedFiles = [...ownedFiles];
    let unauthorizedFiles = [];

    if (req.body.agent_id && nonOwnedFiles.length > 0) {
      const nonOwnedFileIds = nonOwnedFiles.map((f) => f.file_id);
      const accessMap = await hasAccessToFilesViaAgent({
        userId: req.user.id,
        role: req.user.role,
        fileIds: nonOwnedFileIds,
        agentId: req.body.agent_id,
        isDelete: true,
      });

      for (const file of nonOwnedFiles) {
        if (accessMap.get(file.file_id)) {
          authorizedFiles.push(file);
        } else {
          unauthorizedFiles.push(file);
        }
      }
    } else {
      unauthorizedFiles = nonOwnedFiles;
    }

    if (unauthorizedFiles.length > 0) {
      return res.status(403).json({
        message: 'You can only delete files you have access to',
        unauthorizedFiles: unauthorizedFiles.map((f) => f.file_id),
      });
    }

    /* Handle agent unlinking even if no valid files to delete */
    if (req.body.agent_id && req.body.tool_resource && dbFiles.length === 0) {
      const agent = await getAgent({
        id: req.body.agent_id,
      });

      const toolResourceFiles = agent.tool_resources?.[req.body.tool_resource]?.file_ids ?? [];
      const agentFiles = files.filter((f) => toolResourceFiles.includes(f.file_id));

      await processDeleteRequest({ req, files: agentFiles });
      res.status(200).json({ message: 'File associations removed successfully from agent' });
      return;
    }

    /* Handle assistant unlinking even if no valid files to delete */
    if (req.body.assistant_id && req.body.tool_resource && dbFiles.length === 0) {
      const assistant = await getAssistant({
        id: req.body.assistant_id,
      });

      const toolResourceFiles = assistant.tool_resources?.[req.body.tool_resource]?.file_ids ?? [];
      const assistantFiles = files.filter((f) => toolResourceFiles.includes(f.file_id));

      await processDeleteRequest({ req, files: assistantFiles });
      res.status(200).json({ message: 'File associations removed successfully from assistant' });
      return;
    } else if (
      req.body.assistant_id &&
      req.body.files?.[0]?.filepath === EModelEndpoint.azureAssistants
    ) {
      await processDeleteRequest({ req, files: req.body.files });
      return res
        .status(200)
        .json({ message: 'File associations removed successfully from Azure Assistant' });
    }

    await processDeleteRequest({ req, files: authorizedFiles });

    logger.debug(
      `[/files] Files deleted successfully: ${authorizedFiles
        .filter((f) => f.file_id)
        .map((f) => f.file_id)
        .join(', ')}`,
    );
    res.status(200).json({ message: 'Files deleted successfully' });
  } catch (error) {
    logger.error('[/files] Error deleting files:', error);
    res.status(400).json({ message: 'Error in request', error: error.message });
  }
});

function isValidID(str) {
  return /^[A-Za-z0-9_-]{21}$/.test(str);
}

router.get('/code/download/:session_id/:fileId', async (req, res) => {
  try {
    const { session_id, fileId } = req.params;
    const logPrefix = `Session ID: ${session_id} | File ID: ${fileId} | Code output download requested by user `;
    logger.debug(logPrefix);

    if (!session_id || !fileId) {
      return res.status(400).send('Bad request');
    }

    if (!isValidID(session_id) || !isValidID(fileId)) {
      logger.debug(`${logPrefix} invalid session_id or fileId`);
      return res.status(400).send('Bad request');
    }

    const { getDownloadStream } = getStrategyFunctions(FileSources.execute_code);
    if (!getDownloadStream) {
      logger.warn(
        `${logPrefix} has no stream method implemented for ${FileSources.execute_code} source`,
      );
      return res.status(501).send('Not Implemented');
    }

    const result = await loadAuthValues({ userId: req.user.id, authFields: [EnvVar.CODE_API_KEY] });

    /** @type {AxiosResponse<ReadableStream> | undefined} */
    const response = await getDownloadStream(
      `${session_id}/${fileId}`,
      result[EnvVar.CODE_API_KEY],
    );
    res.set(response.headers);
    response.data.pipe(res);
  } catch (error) {
    logger.error('Error downloading file:', error);
    res.status(500).send('Error downloading file');
  }
});

router.get('/download/:userId/:file_id', fileAccess, async (req, res) => {
  try {
    const { userId, file_id } = req.params;
    logger.debug(`File download requested by user ${userId}: ${file_id}`);

    // Access already validated by fileAccess middleware
    const file = req.fileAccess.file;
    const effectiveSource = isAzureAssistantDownload({ file, file_id })
      ? FileSources.azure
      : file.source;
    const downloadFile =
      effectiveSource === file.source ? file : { ...file, source: effectiveSource };

    const { getDownloadStream } = getStrategyFunctions(effectiveSource);
    if (!getDownloadStream) {
      logger.warn(
        `File download requested by user ${userId} has no stream method implemented: ${effectiveSource}`,
      );
      return res.status(501).send('Not Implemented');
    }

    if (await tryFoundryFileDownload({ file: downloadFile, file_id, res })) {
      return;
    }

    if (checkOpenAIStorage(effectiveSource)) {
      req.body = downloadFile.model ? { ...req.body, model: downloadFile.model } : { ...req.body };
      const endpointMap = {
        [FileSources.openai]: EModelEndpoint.assistants,
        [FileSources.azure]: AzureAssistantsOldEndpoint,
      };
      const { openai } = await getOpenAIClient({
        req,
        res,
        overrideEndpoint: endpointMap[effectiveSource],
      });
      const resolvedStorageFile = await resolveOpenAIStorageFile({
        openai,
        file_id,
        filename: downloadFile.filename,
      });
      logger.debug(`Downloading file ${resolvedStorageFile.file_id} from OpenAI`);
      const passThrough = await getDownloadStream(resolvedStorageFile.file_id, openai);
      setDownloadHeaders({
        file: downloadFile,
        res,
        filename: resolvedStorageFile.filename ?? downloadFile.filename,
        type: 'application/octet-stream',
      });
      logger.debug(`File ${resolvedStorageFile.file_id} downloaded from OpenAI`);

      // Handle both Node.js and Web streams
      const stream =
        passThrough.body && typeof passThrough.body.getReader === 'function'
          ? Readable.fromWeb(passThrough.body)
          : passThrough.body;

      stream.pipe(res);
    } else {
      const fileStream = await getDownloadStream(req, downloadFile.filepath);

      fileStream.on('error', (streamError) => {
        logger.error('[DOWNLOAD ROUTE] Stream error:', streamError);
      });

      setDownloadHeaders({
        file: downloadFile,
        res,
        type: 'application/octet-stream',
      });
      fileStream.pipe(res);
    }
  } catch (error) {
    logger.error('[DOWNLOAD ROUTE] Error downloading file:', error);
    res.status(500).send('Error downloading file');
  }
});

router.post('/', async (req, res) => {
  const metadata = req.body;
  let cleanup = true;

  try {
    filterFile({ req });

    if (isAssistantBuilderUpload(metadata) && req.user.role !== SystemRoles.ADMIN) {
      return res.status(403).json({ error: 'Forbidden', message: 'Forbidden' });
    }

    metadata.temp_file_id = metadata.file_id;
    metadata.file_id = req.file_id;

    if (isAssistantsEndpoint(metadata.endpoint)) {
      return await processFileUpload({ req, res, metadata });
    }

    const denied = await verifyAgentUploadPermission({
      req,
      res,
      metadata,
      getAgent,
      checkPermission,
    });
    if (denied) {
      return;
    }

    return await processAgentFileUpload({ req, res, metadata });
  } catch (error) {
    logger.error('[/files] Error processing file:', error);
    const message = resolveUploadErrorMessage(error);

    try {
      await fs.unlink(req.file.path);
      cleanup = false;
    } catch (error) {
      logger.error('[/files] Error deleting file:', error);
    }
    res.status(500).json({ message });
  } finally {
    if (cleanup) {
      try {
        await fs.unlink(req.file.path);
      } catch (error) {
        logger.error('[/files] Error deleting file after file processing:', error);
      }
    } else {
      logger.debug('[/files] File processing completed without cleanup');
    }
  }
});

module.exports = router;
