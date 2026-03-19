import { Document, Types } from 'mongoose';

export interface IFileRetentionSettings extends Omit<Document, 'model'> {
  key: string;
  enabled: boolean;
  retentionDays: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type FileRetentionSettingsRecord = Omit<IFileRetentionSettings, keyof Document>;

export interface SidebarFileRetentionSettings {
  enabled: boolean;
  retentionDays: number;
  updatedAt: Date | null;
}

export interface UpdateSidebarFileRetentionSettingsInput {
  enabled?: boolean;
  retentionDays?: number;
}

export interface IFileUploadStats extends Omit<Document, 'model'> {
  user: Types.ObjectId;
  uploadCount: number;
  lastUploadedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type FileUploadStatsRecord = Omit<IFileUploadStats, keyof Document>;

export interface RecordSidebarFileUploadInput {
  userId?: string | Types.ObjectId;
  uploadedAt?: Date;
}

export interface SyncSidebarUploadCountsInput {
  userIds?: Types.ObjectId[];
}

export interface SidebarUploadsForCleanupInput {
  cutoffDate?: Date;
  limit?: number;
  deleteAll?: boolean;
}
