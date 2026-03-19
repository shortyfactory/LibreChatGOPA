const express = require('express');
const multer = require('multer');
const path = require('path');
const uap = require('ua-parser-js');
const { logger } = require('@librechat/data-schemas');
const { checkBan, uaParser, requireJwtAuth, createFileLimiters } = require('~/server/middleware');
const {
  createDeepLTranslatedFileName,
  createDeepLUploadMetadata,
  DEEPL_UPLOAD_FILE_SIZE_LIMIT_BYTES,
  downloadDeepLDocument,
  getDeepLDocumentStatus,
  getDeepLLanguages,
  isDeepLUploadMimeType,
  normalizeDeepLUploadMimeType,
  uploadDeepLDocument,
} = require('@librechat/api');
const { createDeepLJob, updateDeepLJobByDocumentId } = require('~/models');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: DEEPL_UPLOAD_FILE_SIZE_LIMIT_BYTES,
    files: 1,
    fields: 4,
  },
  fileFilter: (_req, file, callback) => {
    const normalizedMimeType = normalizeDeepLUploadMimeType({
      fileName: file.originalname,
      mimeType: file.mimetype,
    });

    file.mimetype = normalizedMimeType;

    if (isDeepLUploadMimeType(normalizedMimeType) === false) {
      callback(new Error(`Unsupported DeepL file type: ${normalizedMimeType}`), false);
      return;
    }

    callback(null, true);
  },
});

const getDeepLErrorStatusCode = (error) => {
  if (typeof error?.statusCode === 'number') {
    return error.statusCode;
  }

  return 500;
};

const getDeepLErrorMessage = (error, fallbackMessage) => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
};

const getDeepLRequestMetadata = (req) => {
  const userAgent = req.headers?.['user-agent'] || '';
  const parsedUserAgent = uap(userAgent);

  return {
    sourceIp: req.ip || '',
    forwardedFor: req.headers?.['x-forwarded-for'] || '',
    userAgent,
    browserName: parsedUserAgent?.browser?.name || '',
    browserVersion: parsedUserAgent?.browser?.version || '',
    osName: parsedUserAgent?.os?.name || '',
    osVersion: parsedUserAgent?.os?.version || '',
    deviceType: parsedUserAgent?.device?.type || '',
    deviceVendor: parsedUserAgent?.device?.vendor || '',
    deviceModel: parsedUserAgent?.device?.model || '',
    referer: req.headers?.referer || req.headers?.referrer || '',
  };
};

const getDeepLBodyValue = (body, camelCaseKey, snakeCaseKey) => {
  const camelCaseValue = body?.[camelCaseKey];
  if (camelCaseValue != null) {
    return camelCaseValue;
  }

  return body?.[snakeCaseKey];
};

const uploadSingleFile = (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error?.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        message: `DeepL uploads are limited to ${Math.round(DEEPL_UPLOAD_FILE_SIZE_LIMIT_BYTES / (1024 * 1024))} MB.`,
      });
      return;
    }

    res.status(400).json({
      message: getDeepLErrorMessage(error, 'Failed to process the uploaded DeepL file.'),
    });
  });
};

const createUploadMetadataOrFallback = (file) => {
  try {
    return createDeepLUploadMetadata({
      fileName: file.originalname,
      mimeType: file.mimetype,
    });
  } catch {
    return {
      fileExtension: path.extname(file.originalname || '').toLowerCase(),
      fileName: file.originalname || 'document',
      mimeType: file.mimetype || 'application/octet-stream',
    };
  }
};

router.use(requireJwtAuth);
router.use(checkBan);
router.use(uaParser);

router.get('/languages', async (_req, res) => {
  try {
    const response = await getDeepLLanguages();
    return res.status(200).json(response);
  } catch (error) {
    logger.error('[deepl] Failed to retrieve languages', error);
    return res.status(getDeepLErrorStatusCode(error)).json({
      message: getDeepLErrorMessage(error, 'Failed to retrieve available DeepL languages.'),
    });
  }
});

const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters();

router.post(
  '/upload',
  fileUploadIpLimiter,
  fileUploadUserLimiter,
  uploadSingleFile,
  async (req, res) => {
    const sourceLanguage = getDeepLBodyValue(req.body, 'sourceLanguage', 'source_language');
    const targetLanguage = getDeepLBodyValue(req.body, 'targetLanguage', 'target_language');
    const requestMetadata = getDeepLRequestMetadata(req);

    if (!req.file) {
      return res.status(400).json({
        message: 'DeepL requires one supported document upload.',
      });
    }

    if (!targetLanguage || String(targetLanguage).trim().length === 0) {
      return res.status(400).json({
        message: 'DeepL target language is required.',
      });
    }

    try {
      const uploadMetadata = createUploadMetadataOrFallback(req.file);
      const response = await uploadDeepLDocument({
        fileBuffer: req.file.buffer,
        fileName: uploadMetadata.fileName,
        mimeType: uploadMetadata.mimeType,
        sourceLanguage: sourceLanguage ? String(sourceLanguage) : null,
        targetLanguage: String(targetLanguage),
      });

      await createDeepLJob({
        documentId: response.documentId,
        documentKey: response.documentKey,
        userId: req.user?.id ? String(req.user.id) : undefined,
        userEmail: req.user?.email ?? undefined,
        userName: req.user?.name ?? req.user?.username ?? undefined,
        userRole: req.user?.role ?? undefined,
        userProvider: req.user?.provider ?? undefined,
        fileName: uploadMetadata.fileName,
        fileMimeType: uploadMetadata.mimeType,
        fileExtension: uploadMetadata.fileExtension,
        sizeBytes: req.file.size ?? req.file.buffer?.length ?? 0,
        sourceLanguage: response.sourceLanguage ?? undefined,
        targetLanguage: response.targetLanguage,
        uploadProviderStatus: 'ok',
        uploadProviderDetails: response,
        uploadedAt: new Date(),
        status: 'uploaded',
        error: null,
        ...requestMetadata,
      });

      return res.status(200).json(response);
    } catch (error) {
      const uploadMetadata = createUploadMetadataOrFallback(req.file);

      await createDeepLJob({
        userId: req.user?.id ? String(req.user.id) : undefined,
        userEmail: req.user?.email ?? undefined,
        userName: req.user?.name ?? req.user?.username ?? undefined,
        userRole: req.user?.role ?? undefined,
        userProvider: req.user?.provider ?? undefined,
        fileName: uploadMetadata.fileName,
        fileMimeType: uploadMetadata.mimeType,
        fileExtension: uploadMetadata.fileExtension,
        sizeBytes: req.file.size ?? req.file.buffer?.length ?? 0,
        sourceLanguage: sourceLanguage ? String(sourceLanguage).trim() : undefined,
        targetLanguage: String(targetLanguage).trim(),
        uploadProviderStatus: 'error',
        uploadedAt: new Date(),
        status: 'error',
        error: getDeepLErrorMessage(error, 'Failed to upload the document to DeepL.'),
        ...requestMetadata,
      });

      logger.error('[deepl] Failed to upload document', error);
      return res.status(getDeepLErrorStatusCode(error)).json({
        message: getDeepLErrorMessage(error, 'Failed to upload the document to DeepL.'),
      });
    }
  },
);

router.post('/status', async (req, res) => {
  const documentId = req.body?.documentId ? String(req.body.documentId) : '';
  const documentKey = req.body?.documentKey ? String(req.body.documentKey) : '';

  try {
    const response = await getDeepLDocumentStatus({ documentId, documentKey });
    const completedAt = response.isReady ? new Date() : undefined;

    await updateDeepLJobByDocumentId(documentId, {
      status: response.status,
      error: response.errorMessage,
      latestStatusProviderDetails: response,
      lastStatusCheckedAt: new Date(),
      ...(completedAt ? { completedAt } : {}),
      $inc: { statusChecks: 1 },
    });

    return res.status(200).json(response);
  } catch (error) {
    await updateDeepLJobByDocumentId(documentId, {
      status: 'error',
      error: getDeepLErrorMessage(error, 'Failed to retrieve the DeepL document status.'),
      lastStatusCheckedAt: new Date(),
      $inc: { statusChecks: 1 },
    });

    logger.error('[deepl] Failed to retrieve document status', error);
    return res.status(getDeepLErrorStatusCode(error)).json({
      message: getDeepLErrorMessage(error, 'Failed to retrieve the DeepL document status.'),
    });
  }
});

router.post('/download', async (req, res) => {
  const documentId = req.body?.documentId ? String(req.body.documentId) : '';
  const documentKey = req.body?.documentKey ? String(req.body.documentKey) : '';
  const requestFileName = getDeepLBodyValue(req.body, 'fileName', 'file_name');
  const requestTargetLanguage = getDeepLBodyValue(req.body, 'targetLanguage', 'target_language');

  await updateDeepLJobByDocumentId(documentId, {
    $inc: { downloadAttempts: 1 },
  });

  try {
    const response = await downloadDeepLDocument({ documentId, documentKey });
    const updatedJob = await updateDeepLJobByDocumentId(documentId, {
      status: 'downloaded',
      error: null,
      downloadedAt: new Date(),
    });
    const downloadFileName = createDeepLTranslatedFileName({
      fileName: updatedJob?.fileName ?? (requestFileName ? String(requestFileName) : null),
      targetLanguage:
        updatedJob?.targetLanguage ??
        (requestTargetLanguage ? String(requestTargetLanguage) : null),
    });

    res.set({
      'Content-Disposition': `attachment; filename="${downloadFileName}"`,
      'Content-Type': response.mimeType,
    });

    return res.status(200).send(response.buffer);
  } catch (error) {
    await updateDeepLJobByDocumentId(documentId, {
      status: 'error',
      error: getDeepLErrorMessage(error, 'Failed to download the translated document from DeepL.'),
    });

    logger.error('[deepl] Failed to download translated document', error);
    return res.status(getDeepLErrorStatusCode(error)).json({
      message: getDeepLErrorMessage(
        error,
        'Failed to download the translated document from DeepL.',
      ),
    });
  }
});

module.exports = router;
