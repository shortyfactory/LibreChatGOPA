import logger from '../config/winston';
import type { FilterQuery, Model, UpdateQuery } from 'mongoose';
import type {
  CreateDeepLJobInput,
  DeepLJobSearchParams,
  DeepLJobSearchResult,
  IDeepLJobAnalytics,
  UpdateDeepLJobInput,
} from '~/types';

const DEFAULT_DEEPL_LIST_LIMIT = 200;

const normalizeDeepLSearchText = (value?: string): string => value?.trim() ?? '';

const sanitizeDeepLJobUpdate = (
  value: Omit<UpdateDeepLJobInput, '$inc'>,
): Partial<Omit<UpdateDeepLJobInput, '$inc'>> => {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
  return Object.fromEntries(entries) as Partial<Omit<UpdateDeepLJobInput, '$inc'>>;
};

const escapeRegExp = (value = ''): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createDeepLJobMethods(mongoose: typeof import('mongoose')) {
  const DeepLJobAnalytics = mongoose.models.DeepLJobAnalytics as Model<IDeepLJobAnalytics>;

  async function createDeepLJob(payload: CreateDeepLJobInput): Promise<IDeepLJobAnalytics | null> {
    try {
      return await DeepLJobAnalytics.create(payload);
    } catch (error) {
      logger.warn('[deepl] Could not persist DeepL job record', error);
      return null;
    }
  }

  async function updateDeepLJobByDocumentId(
    documentId: string,
    updates: UpdateDeepLJobInput,
  ): Promise<IDeepLJobAnalytics | null> {
    if (!documentId) {
      return null;
    }

    try {
      const { $inc, ...setUpdates } = updates;
      const sanitizedSetUpdates = sanitizeDeepLJobUpdate(setUpdates);
      const hasSetUpdates = Object.keys(sanitizedSetUpdates).length > 0;
      const hasIncrementUpdates = $inc != null && Object.keys($inc).length > 0;

      if (!hasSetUpdates && !hasIncrementUpdates) {
        return null;
      }

      const updateQuery: UpdateQuery<IDeepLJobAnalytics> = {};
      if (hasSetUpdates) {
        updateQuery.$set = sanitizedSetUpdates;
      }
      if (hasIncrementUpdates && $inc != null) {
        updateQuery.$inc = $inc;
      }

      return await DeepLJobAnalytics.findOneAndUpdate(
        { documentId: String(documentId) },
        updateQuery,
        {
          new: true,
          sort: { createdAt: -1 },
        },
      ).lean();
    } catch (error) {
      logger.warn(
        `[deepl] Could not update DeepL job record for documentId="${documentId}"`,
        error,
      );
      return null;
    }
  }

  async function listRecentDeepLJobs(
    limit = DEFAULT_DEEPL_LIST_LIMIT,
  ): Promise<IDeepLJobAnalytics[]> {
    return await DeepLJobAnalytics.find({}).sort({ createdAt: -1 }).limit(limit).lean();
  }

  async function searchDeepLJobs(params: DeepLJobSearchParams = {}): Promise<DeepLJobSearchResult> {
    const { page = 1, limit = 50, search = '', status, userId, dateFrom, dateTo } = params;

    const safePage = Number.isFinite(page) ? Math.max(1, Number(page)) : 1;
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Number(limit)) : 50;
    const skip = (safePage - 1) * safeLimit;
    const filter: FilterQuery<IDeepLJobAnalytics> = {};

    if (status != null && status.trim().length > 0) {
      filter.status = status.trim();
    }

    if (userId != null && userId.trim().length > 0) {
      filter.userId = userId.trim();
    }

    if (dateFrom != null || dateTo != null) {
      const createdAtFilter: NonNullable<FilterQuery<IDeepLJobAnalytics>['createdAt']> = {};

      if (dateFrom != null) {
        const parsedDateFrom = new Date(dateFrom);
        if (!Number.isNaN(parsedDateFrom.getTime())) {
          createdAtFilter.$gte = parsedDateFrom;
        }
      }

      if (dateTo != null) {
        const parsedDateTo = new Date(dateTo);
        if (!Number.isNaN(parsedDateTo.getTime())) {
          createdAtFilter.$lte = parsedDateTo;
        }
      }

      if (Object.keys(createdAtFilter).length > 0) {
        filter.createdAt = createdAtFilter;
      }
    }

    const trimmedSearch = normalizeDeepLSearchText(search);
    if (trimmedSearch.length > 0) {
      const regex = new RegExp(escapeRegExp(trimmedSearch), 'i');
      filter.$or = [
        { userEmail: regex },
        { userName: regex },
        { userId: regex },
        { fileName: regex },
        { sourceLanguage: regex },
        { targetLanguage: regex },
        { sourceIp: regex },
        { documentId: regex },
        { documentKey: regex },
        { status: regex },
        { error: regex },
        { userAgent: regex },
      ];
    }

    const [totalJobs, jobs] = await Promise.all([
      DeepLJobAnalytics.countDocuments(filter),
      DeepLJobAnalytics.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
    ]);

    return {
      jobs,
      pagination: {
        page: safePage,
        limit: safeLimit,
        totalJobs,
        totalPages: Math.max(1, Math.ceil(totalJobs / safeLimit)),
      },
      filters: {
        search: trimmedSearch,
        status: status ?? '',
        userId: userId ?? '',
        dateFrom: dateFrom ?? '',
        dateTo: dateTo ?? '',
      },
    };
  }

  return {
    createDeepLJob,
    updateDeepLJobByDocumentId,
    listRecentDeepLJobs,
    searchDeepLJobs,
  };
}

export type DeepLJobMethods = ReturnType<typeof createDeepLJobMethods>;
