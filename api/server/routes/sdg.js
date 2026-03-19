const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { logger } = require('@librechat/data-schemas');
const {
  mapSDGInput,
  isSDGUploadMimeType,
  MAX_SDG_INPUT_TEXT_LENGTH,
  normalizeSDGUploadMimeType,
  SDG_UPLOAD_FILE_SIZE_LIMIT_BYTES,
} = require('@librechat/api');
const {
  checkBan,
  uaParser,
  requireJwtAuth,
  configMiddleware,
  createFileLimiters,
} = require('~/server/middleware');
const { storage } = require('~/server/routes/files/multer');

const router = express.Router();

const upload = multer({
  storage,
  limits: {
    fieldSize: MAX_SDG_INPUT_TEXT_LENGTH * 4,
    fields: 5,
    fileSize: SDG_UPLOAD_FILE_SIZE_LIMIT_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const normalizedMimeType = normalizeSDGUploadMimeType({
      fileName: file.originalname,
      mimeType: file.mimetype,
    });

    file.mimetype = normalizedMimeType;

    if (isSDGUploadMimeType(normalizedMimeType) === false) {
      callback(new Error(`Unsupported SDG file type: ${normalizedMimeType}`), false);
      return;
    }

    callback(null, true);
  },
});

const cleanupUploadedFile = async (file) => {
  if (!file?.path) {
    return;
  }

  try {
    await fs.promises.unlink(file.path);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      logger.warn('[sdg] Failed to remove temporary upload', {
        filePath: file.path,
        error: error.message,
      });
    }
  }
};

const getSDGStatusCode = (error) => {
  if (typeof error?.statusCode === 'number') {
    return error.statusCode;
  }

  return 500;
};

const getSDGErrorMessage = (error) => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Failed to map the provided input to SDGs.';
};

router.use(requireJwtAuth);
router.use(configMiddleware);
router.use(checkBan);
router.use(uaParser);

const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters();

router.use((req, res, next) => {
  if (req.method !== 'POST') {
    next();
    return;
  }

  fileUploadIpLimiter(req, res, (ipError) => {
    if (ipError) {
      next(ipError);
      return;
    }

    fileUploadUserLimiter(req, res, next);
  });
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const response = await mapSDGInput({
      file: req.file ?? undefined,
      inputText: req.body?.inputText,
      sourceLanguage: req.body?.sourceLanguage,
    });

    return res.status(200).json(response);
  } catch (error) {
    logger.error('[sdg] Failed to map input to SDGs', error);
    return res.status(getSDGStatusCode(error)).json({
      message: getSDGErrorMessage(error),
    });
  } finally {
    await cleanupUploadedFile(req.file);
  }
});

module.exports = router;
