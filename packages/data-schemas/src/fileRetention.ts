import { FileContext } from 'librechat-data-provider';

export const SIDEBAR_FILE_RETENTION_SETTINGS_KEY = 'sidebar_upload_retention';
export const DEFAULT_RETENTION_DAYS = 30;
export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 3650;
export const RETENTION_BATCH_LIMIT = 100;
export const ELIGIBLE_CONTEXTS = [FileContext.message_attachment] as const;
