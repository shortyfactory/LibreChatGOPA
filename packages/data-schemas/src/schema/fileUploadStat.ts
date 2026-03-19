import mongoose, { Schema } from 'mongoose';
import type { IFileUploadStats } from '~/types';

const fileUploadStat: Schema<IFileUploadStats> = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    uploadCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    lastUploadedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'file_upload_stats',
    timestamps: true,
  },
);

export default fileUploadStat;
