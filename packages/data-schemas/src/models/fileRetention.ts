import fileRetentionSchema from '~/schema/fileRetention';
import type { IFileRetentionSettings } from '~/types';

export function createFileRetentionSettingsModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.FileRetentionSettings ||
    mongoose.model<IFileRetentionSettings>('FileRetentionSettings', fileRetentionSchema)
  );
}
