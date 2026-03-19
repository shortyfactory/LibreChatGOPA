jest.mock('@librechat/api', () => ({
  generateShortLivedToken: jest.fn((userId) => `token-${userId}`),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('librechat-data-provider', () => ({
  SystemRoles: {
    ADMIN: 'ADMIN',
  },
}));

jest.mock('~/server/services/Files/process', () => ({
  processDeleteRequest: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./FileRetentionStore', () => ({
  RETENTION_BATCH_LIMIT: 100,
  getSidebarUploadsForCleanup: jest.fn(),
  getSidebarFileRetentionSettings: jest.fn(),
  syncSidebarUploadCountsFromFiles: jest.fn(),
}));

const { generateShortLivedToken } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { processDeleteRequest } = require('~/server/services/Files/process');
const {
  RETENTION_BATCH_LIMIT,
  getSidebarUploadsForCleanup,
  getSidebarFileRetentionSettings,
  syncSidebarUploadCountsFromFiles,
} = require('./FileRetentionStore');
const {
  initializeFileRetentionCleanup,
  stopFileRetentionCleanup,
  purgeAllSidebarUploadsNow,
  runSidebarUploadRetentionCleanup,
} = require('./FileRetentionService');

describe('FileRetentionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    syncSidebarUploadCountsFromFiles.mockResolvedValue({ syncedUsers: 0 });
    getSidebarUploadsForCleanup.mockResolvedValue([]);
    getSidebarFileRetentionSettings.mockResolvedValue({
      enabled: true,
      retentionDays: 30,
    });
  });

  afterEach(() => {
    stopFileRetentionCleanup();
    jest.useRealTimers();
  });

  test('skips scheduled cleanup when retention is disabled', async () => {
    getSidebarFileRetentionSettings.mockResolvedValue({
      enabled: false,
      retentionDays: 30,
    });

    const result = await runSidebarUploadRetentionCleanup({ name: 'app-config' });

    expect(result).toEqual({
      attemptedDeletes: 0,
      skipped: true,
      reason: 'cleanup_disabled',
    });
    expect(syncSidebarUploadCountsFromFiles).toHaveBeenCalledTimes(1);
    expect(getSidebarUploadsForCleanup).not.toHaveBeenCalled();
    expect(processDeleteRequest).not.toHaveBeenCalled();
  });

  test('purges sidebar uploads by user when deleteAll is requested', async () => {
    const appConfig = { name: 'app-config' };
    getSidebarUploadsForCleanup
      .mockResolvedValueOnce([
        { user: 'user-a', file_id: 'file-1' },
        { user: 'user-a', file_id: 'file-2' },
        { user: 'user-b', file_id: 'file-3' },
      ])
      .mockResolvedValueOnce([]);

    const result = await purgeAllSidebarUploadsNow(appConfig);

    expect(result).toEqual({
      attemptedDeletes: 3,
      skipped: false,
    });
    expect(syncSidebarUploadCountsFromFiles).toHaveBeenCalledTimes(1);
    expect(getSidebarFileRetentionSettings).not.toHaveBeenCalled();
    expect(getSidebarUploadsForCleanup).toHaveBeenNthCalledWith(1, {
      cutoffDate: undefined,
      limit: RETENTION_BATCH_LIMIT,
      deleteAll: true,
    });
    expect(processDeleteRequest).toHaveBeenCalledTimes(2);
    expect(processDeleteRequest).toHaveBeenNthCalledWith(1, {
      req: expect.objectContaining({
        config: appConfig,
        headers: {
          authorization: 'Bearer token-user-a',
        },
        user: {
          id: 'user-a',
          role: 'ADMIN',
        },
      }),
      files: [
        { user: 'user-a', file_id: 'file-1' },
        { user: 'user-a', file_id: 'file-2' },
      ],
    });
    expect(processDeleteRequest).toHaveBeenNthCalledWith(2, {
      req: expect.objectContaining({
        config: appConfig,
        headers: {
          authorization: 'Bearer token-user-b',
        },
        user: {
          id: 'user-b',
          role: 'ADMIN',
        },
      }),
      files: [{ user: 'user-b', file_id: 'file-3' }],
    });
    expect(generateShortLivedToken).toHaveBeenNthCalledWith(1, 'user-a');
    expect(generateShortLivedToken).toHaveBeenNthCalledWith(2, 'user-b');
    expect(logger.info).toHaveBeenCalledWith(
      '[file-retention] Attempted cleanup for 3 sidebar uploads (manual purge)',
    );
  });

  test('initializes scheduled cleanup and logs startup', async () => {
    jest.useFakeTimers();
    getSidebarFileRetentionSettings.mockResolvedValue({
      enabled: false,
      retentionDays: 30,
    });

    initializeFileRetentionCleanup({ name: 'app-config' });
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(syncSidebarUploadCountsFromFiles).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith(
      '[file-retention] Sidebar upload retention cleanup initialized',
    );
  });
});
