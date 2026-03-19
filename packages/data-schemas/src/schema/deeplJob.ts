import { Schema } from 'mongoose';
import type { IDeepLJobAnalytics } from '~/types';

const deeplJob: Schema<IDeepLJobAnalytics> = new Schema(
  {
    documentId: {
      type: String,
      index: true,
    },
    userId: {
      type: String,
      index: true,
    },
    userEmail: {
      type: String,
      index: true,
    },
    userName: String,
    userRole: String,
    userProvider: String,
    sourceIp: String,
    forwardedFor: String,
    userAgent: String,
    browserName: String,
    browserVersion: String,
    osName: String,
    osVersion: String,
    deviceType: String,
    deviceVendor: String,
    deviceModel: String,
    referer: String,
    fileName: String,
    fileMimeType: String,
    fileExtension: String,
    sizeBytes: Number,
    sourceLanguage: String,
    targetLanguage: String,
    documentKey: String,
    uploadProviderStatus: String,
    uploadProviderDetails: Schema.Types.Mixed,
    latestStatusProviderDetails: Schema.Types.Mixed,
    statusChecks: {
      type: Number,
      default: 0,
    },
    downloadAttempts: {
      type: Number,
      default: 0,
    },
    uploadedAt: Date,
    lastStatusCheckedAt: Date,
    completedAt: Date,
    downloadedAt: Date,
    status: {
      type: String,
      default: 'uploaded',
      index: true,
    },
    error: String,
  },
  {
    collection: 'deepl_jobs',
    timestamps: true,
  },
);

deeplJob.index({ createdAt: -1 });
deeplJob.index({ userId: 1, createdAt: -1 });
deeplJob.index({ userEmail: 1, createdAt: -1 });
deeplJob.index({ status: 1, createdAt: -1 });
deeplJob.index({ fileName: 1, createdAt: -1 });
deeplJob.index({ sourceLanguage: 1, targetLanguage: 1, createdAt: -1 });
deeplJob.index({ sourceIp: 1, createdAt: -1 });

export default deeplJob;
