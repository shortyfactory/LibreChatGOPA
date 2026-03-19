import { Schema } from 'mongoose';
import {
  DEFAULT_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  SIDEBAR_FILE_RETENTION_SETTINGS_KEY,
} from '~/fileRetention';
import type { IFileRetentionSettings } from '~/types';

const fileRetention: Schema<IFileRetentionSettings> = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: SIDEBAR_FILE_RETENTION_SETTINGS_KEY,
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    retentionDays: {
      type: Number,
      default: DEFAULT_RETENTION_DAYS,
      min: MIN_RETENTION_DAYS,
      max: MAX_RETENTION_DAYS,
    },
  },
  {
    collection: 'file_retention_settings',
    timestamps: true,
  },
);

export default fileRetention;
