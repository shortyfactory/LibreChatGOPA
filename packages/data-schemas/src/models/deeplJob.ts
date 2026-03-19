import deeplJobSchema from '~/schema/deeplJob';
import type { IDeepLJobAnalytics } from '~/types';

export function createDeepLJobModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.DeepLJobAnalytics ||
    mongoose.model<IDeepLJobAnalytics>('DeepLJobAnalytics', deeplJobSchema)
  );
}
