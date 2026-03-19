import logger from '../config/winston';
import { ELIGIBLE_CONTEXTS } from '~/fileRetention';
import type { Model, PipelineStage, Types } from 'mongoose';
import type {
  IFileUploadStats,
  IMongoFile,
  RecordSidebarFileUploadInput,
  SyncSidebarUploadCountsInput,
} from '~/types';

interface FileUploadAggregationRow {
  _id: Types.ObjectId;
  lastUploadedAt?: Date;
  uploadCount?: number;
}

export function createFileUploadStatMethods(mongoose: typeof import('mongoose')) {
  const File = mongoose.models.File as Model<IMongoFile>;
  const FileUploadStats = mongoose.models.FileUploadStats as Model<IFileUploadStats>;

  async function recordSidebarFileUpload(input: RecordSidebarFileUploadInput): Promise<void> {
    const { userId, uploadedAt = new Date() } = input;

    if (!userId) {
      return;
    }

    try {
      await FileUploadStats.updateOne(
        { user: userId },
        {
          $inc: { uploadCount: 1 },
          $max: { lastUploadedAt: uploadedAt },
        },
        { upsert: true },
      );
    } catch (error) {
      logger.warn('[file-retention] Could not persist file upload analytics', error);
    }
  }

  async function getSidebarUploadCountsByUserIds(
    userIds: Types.ObjectId[] = [],
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) {
      return new Map<string, number>();
    }

    const stats = await FileUploadStats.find({ user: { $in: userIds } }, 'user uploadCount').lean();
    const counts = new Map<string, number>();

    for (const stat of stats) {
      counts.set(String(stat.user), Number(stat.uploadCount ?? 0));
    }

    return counts;
  }

  async function syncSidebarUploadCountsFromFiles(
    input: SyncSidebarUploadCountsInput = {},
  ): Promise<{ syncedUsers: number }> {
    const { userIds } = input;

    const matchStage: PipelineStage.Match = {
      $match: {
        $or: [{ retentionEligible: true }, { context: { $in: [...ELIGIBLE_CONTEXTS] } }],
        ...(userIds != null && userIds.length > 0 ? { user: { $in: userIds } } : {}),
      },
    };

    const rows = await File.aggregate<FileUploadAggregationRow>([
      matchStage,
      {
        $group: {
          _id: '$user',
          uploadCount: { $sum: 1 },
          lastUploadedAt: { $max: '$createdAt' },
        },
      },
    ]);

    if (rows.length === 0) {
      return { syncedUsers: 0 };
    }

    await FileUploadStats.bulkWrite(
      rows.map((row) => ({
        updateOne: {
          filter: { user: row._id },
          update: {
            $max: {
              uploadCount: Number(row.uploadCount ?? 0),
              ...(row.lastUploadedAt != null ? { lastUploadedAt: row.lastUploadedAt } : {}),
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    return { syncedUsers: rows.length };
  }

  return {
    recordSidebarFileUpload,
    getSidebarUploadCountsByUserIds,
    syncSidebarUploadCountsFromFiles,
  };
}

export type FileUploadStatMethods = ReturnType<typeof createFileUploadStatMethods>;
