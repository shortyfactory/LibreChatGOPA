import { Document } from 'mongoose';

export type DeepLJobProviderDetailPrimitive = boolean | number | string | null;

export interface DeepLJobProviderDetailObject {
  [key: string]: DeepLJobProviderDetails;
}

export type DeepLJobProviderDetails =
  | DeepLJobProviderDetailPrimitive
  | DeepLJobProviderDetailObject
  | DeepLJobProviderDetails[];

export interface IDeepLJobAnalytics extends Omit<Document, 'model'> {
  documentId?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  userRole?: string;
  userProvider?: string;
  sourceIp?: string;
  forwardedFor?: string;
  userAgent?: string;
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  osVersion?: string;
  deviceType?: string;
  deviceVendor?: string;
  deviceModel?: string;
  referer?: string;
  fileName?: string;
  fileMimeType?: string;
  fileExtension?: string;
  sizeBytes?: number;
  sourceLanguage?: string;
  targetLanguage?: string;
  documentKey?: string;
  uploadProviderStatus?: string;
  uploadProviderDetails?: DeepLJobProviderDetails;
  latestStatusProviderDetails?: DeepLJobProviderDetails;
  statusChecks: number;
  downloadAttempts: number;
  uploadedAt?: Date;
  lastStatusCheckedAt?: Date;
  completedAt?: Date;
  downloadedAt?: Date;
  status: string;
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type DeepLJobRecord = Omit<IDeepLJobAnalytics, keyof Document>;

export interface DeepLJobIncrement {
  downloadAttempts?: number;
  statusChecks?: number;
}

export type CreateDeepLJobInput = Partial<DeepLJobRecord>;

export interface UpdateDeepLJobInput extends Partial<DeepLJobRecord> {
  $inc?: DeepLJobIncrement;
}

export interface DeepLJobSearchParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface DeepLJobSearchResult {
  jobs: IDeepLJobAnalytics[];
  pagination: {
    page: number;
    limit: number;
    totalJobs: number;
    totalPages: number;
  };
  filters: {
    search: string;
    status: string;
    userId: string;
    dateFrom: string;
    dateTo: string;
  };
}
