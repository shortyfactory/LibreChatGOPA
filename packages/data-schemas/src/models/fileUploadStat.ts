import fileUploadStatSchema from '~/schema/fileUploadStat';
import type { IFileUploadStats } from '~/types';

export function createFileUploadStatsModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.FileUploadStats ||
    mongoose.model<IFileUploadStats>('FileUploadStats', fileUploadStatSchema)
  );
}
