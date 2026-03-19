export const sdgSourceLanguages = [
  'bg',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'es',
  'et',
  'fi',
  'fr',
  'ga',
  'hr',
  'hu',
  'it',
  'lt',
  'lv',
  'mt',
  'nl',
  'pl',
  'pt',
  'ro',
  'sk',
  'sl',
  'sv',
] as const;

export type SDGSourceLanguage = (typeof sdgSourceLanguages)[number];

export const sdgSupportedUploadExtensions = [
  '.pdf',
  '.docx',
  '.xls',
  '.xlsx',
  '.ods',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.html',
  '.htm',
  '.xml',
] as const;

export const sdgSupportedUploadMimeTypes = [
  'application/pdf',
  'application/vnd.ms-excel',
  'application/msexcel',
  'application/x-msexcel',
  'application/x-ms-excel',
  'application/x-excel',
  'application/x-dos_ms_excel',
  'application/xls',
  'application/x-xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/plain',
  'text/markdown',
  'text/md',
  'text/csv',
  'text/tab-separated-values',
  'application/csv',
  'application/json',
  'application/xml',
  'text/xml',
  'text/html',
] as const;

export const sdgUploadAccept = sdgSupportedUploadExtensions.join(',');

export type SDGSourceType = 'file' | 'text';

export interface SDGMappingNode {
  id: string | null;
  type: string | null;
  name: string;
  occurrences: number;
  relevance: string | null;
  children: SDGMappingNode[];
}

export interface SDGMapResponse {
  generatedAt: string;
  message: string | null;
  sourceType: SDGSourceType;
  sourceLanguage: SDGSourceLanguage;
  fileName: string | null;
  fileMimeType: string | null;
  textLength: number;
  totalGoals: number;
  totalTargets: number;
  totalOccurrences: number;
  goals: SDGMappingNode[];
}
