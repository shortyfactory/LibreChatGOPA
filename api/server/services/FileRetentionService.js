const { generateShortLivedToken } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const { processDeleteRequest } = require('~/server/services/Files/process');
const {
  RETENTION_BATCH_LIMIT,
  getSidebarUploadsForCleanup,
  getSidebarFileRetentionSettings,
  syncSidebarUploadCountsFromFiles,
} = require('./FileRetentionStore');

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const MAX_BATCHES_PER_RUN = 10;

let cleanupInterval = null;
let cleanupInProgress = false;

const buildSystemDeleteRequest = (appConfig, userId) => ({
  baseUrl: '/api/assistants/v2',
  body: {},
  config: appConfig,
  headers: {
    authorization: `Bearer ${generateShortLivedToken(userId)}`,
  },
  user: {
    id: String(userId),
    role: SystemRoles.ADMIN,
  },
});

const purgeSidebarUploads = async (
  appConfig,
  { deleteAll = false, ignoreDisabled = false } = {},
) => {
  if (!appConfig || cleanupInProgress) {
    return {
      attemptedDeletes: 0,
      skipped: true,
      reason: cleanupInProgress ? 'cleanup_in_progress' : 'missing_app_config',
    };
  }

  cleanupInProgress = true;

  try {
    await syncSidebarUploadCountsFromFiles();

    let cutoffDate;
    if (!deleteAll) {
      const settings = await getSidebarFileRetentionSettings();
      if (!ignoreDisabled && !settings.enabled) {
        return {
          attemptedDeletes: 0,
          skipped: true,
          reason: 'cleanup_disabled',
        };
      }

      cutoffDate = new Date(Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000);
    }

    let attemptedDeletes = 0;

    for (let batchIndex = 0; batchIndex < MAX_BATCHES_PER_RUN; batchIndex += 1) {
      const expiredFiles = await getSidebarUploadsForCleanup({
        cutoffDate,
        limit: RETENTION_BATCH_LIMIT,
        deleteAll,
      });

      if (expiredFiles.length === 0) {
        break;
      }

      const filesByUser = expiredFiles.reduce((acc, file) => {
        const userId = String(file.user);
        if (!acc.has(userId)) {
          acc.set(userId, []);
        }
        acc.get(userId).push(file);
        return acc;
      }, new Map());

      for (const [userId, files] of filesByUser.entries()) {
        const req = buildSystemDeleteRequest(appConfig, userId);
        await processDeleteRequest({ req, files });
        attemptedDeletes += files.length;
      }

      if (expiredFiles.length < RETENTION_BATCH_LIMIT) {
        break;
      }
    }

    if (attemptedDeletes > 0) {
      logger.info(
        `[file-retention] Attempted cleanup for ${attemptedDeletes} ${
          deleteAll ? 'sidebar uploads (manual purge)' : 'expired sidebar uploads'
        }`,
      );
    }

    return {
      attemptedDeletes,
      skipped: false,
    };
  } catch (error) {
    logger.error('[file-retention] Error during sidebar upload cleanup', error);
    throw error;
  } finally {
    cleanupInProgress = false;
  }
};

const runSidebarUploadRetentionCleanup = async (appConfig) =>
  purgeSidebarUploads(appConfig, { deleteAll: false, ignoreDisabled: false });

const purgeAllSidebarUploadsNow = async (appConfig) =>
  purgeSidebarUploads(appConfig, { deleteAll: true, ignoreDisabled: true });

const initializeFileRetentionCleanup = (appConfig) => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  runSidebarUploadRetentionCleanup(appConfig).catch((error) => {
    logger.error('[file-retention] Initial cleanup run failed', error);
  });

  cleanupInterval = setInterval(() => {
    runSidebarUploadRetentionCleanup(appConfig).catch((error) => {
      logger.error('[file-retention] Scheduled cleanup run failed', error);
    });
  }, CLEANUP_INTERVAL_MS);

  if (typeof cleanupInterval.unref === 'function') {
    cleanupInterval.unref();
  }

  logger.info('[file-retention] Sidebar upload retention cleanup initialized');
};

const stopFileRetentionCleanup = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
};

module.exports = {
  buildSystemDeleteRequest,
  initializeFileRetentionCleanup,
  stopFileRetentionCleanup,
  purgeAllSidebarUploadsNow,
  runSidebarUploadRetentionCleanup,
};
