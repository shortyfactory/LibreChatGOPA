import logger from '../config/winston';
import {
  DEFAULT_RETENTION_DAYS,
  ELIGIBLE_CONTEXTS,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  RETENTION_BATCH_LIMIT,
  SIDEBAR_FILE_RETENTION_SETTINGS_KEY,
} from '~/fileRetention';
import type { FilterQuery, Model } from 'mongoose';
import type {
  IFileRetentionSettings,
  IMongoFile,
  SidebarFileRetentionSettings,
  SidebarUploadsForCleanupInput,
  UpdateSidebarFileRetentionSettingsInput,
} from '~/types';

const normalizeRetentionDays = (
  value: number | string | undefined,
  fallback = DEFAULT_RETENTION_DAYS,
): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, MIN_RETENTION_DAYS), MAX_RETENTION_DAYS);
};

export function createFileRetentionMethods(mongoose: typeof import('mongoose')) {
  const FileRetentionSettings = mongoose.models
    .FileRetentionSettings as Model<IFileRetentionSettings>;
  const File = mongoose.models.File as Model<IMongoFile>;

  async function getSidebarFileRetentionSettings(): Promise<SidebarFileRetentionSettings> {
    const settings = await FileRetentionSettings.findOne({
      key: SIDEBAR_FILE_RETENTION_SETTINGS_KEY,
    }).lean();

    return {
      enabled: settings?.enabled ?? false,
      retentionDays: normalizeRetentionDays(settings?.retentionDays),
      updatedAt: settings?.updatedAt ?? null,
    };
  }

  async function updateSidebarFileRetentionSettings(
    input: UpdateSidebarFileRetentionSettingsInput,
  ): Promise<SidebarFileRetentionSettings> {
    const currentSettings = await getSidebarFileRetentionSettings();
    const nextSettings = {
      enabled: input.enabled ?? currentSettings.enabled,
      retentionDays: normalizeRetentionDays(input.retentionDays, currentSettings.retentionDays),
    };

    const updated = await FileRetentionSettings.findOneAndUpdate(
      { key: SIDEBAR_FILE_RETENTION_SETTINGS_KEY },
      {
        $set: nextSettings,
        $setOnInsert: {
          key: SIDEBAR_FILE_RETENTION_SETTINGS_KEY,
        },
      },
      {
        new: true,
        upsert: true,
      },
    ).lean();

    return {
      enabled: updated?.enabled ?? nextSettings.enabled,
      retentionDays: normalizeRetentionDays(updated?.retentionDays, nextSettings.retentionDays),
      updatedAt: updated?.updatedAt ?? null,
    };
  }

  async function getSidebarUploadsForCleanup(
    input: SidebarUploadsForCleanupInput = {},
  ): Promise<IMongoFile[]> {
    const { cutoffDate, limit = RETENTION_BATCH_LIMIT, deleteAll = false } = input;

    if (!deleteAll && (!(cutoffDate instanceof Date) || Number.isNaN(cutoffDate.getTime()))) {
      return [];
    }

    const filter: FilterQuery<IMongoFile> = {
      $or: [{ retentionEligible: true }, { context: { $in: [...ELIGIBLE_CONTEXTS] } }],
    };

    if (!deleteAll && cutoffDate != null) {
      filter.createdAt = { $lte: cutoffDate };
    }

    try {
      return await File.find(filter).sort({ createdAt: 1 }).limit(limit).lean();
    } catch (error) {
      logger.warn('[file-retention] Could not retrieve sidebar uploads for cleanup', error);
      return [];
    }
  }

  return {
    getSidebarFileRetentionSettings,
    updateSidebarFileRetentionSettings,
    getSidebarUploadsForCleanup,
  };
}

export type FileRetentionMethods = ReturnType<typeof createFileRetentionMethods>;
