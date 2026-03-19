export const deeplSupportedUploadExtensions = [
  '.docx',
  '.pptx',
  '.xlsx',
  '.pdf',
  '.html',
  '.htm',
  '.txt',
  '.xlf',
  '.xliff',
] as const;

export const deeplSupportedUploadMimeTypes = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
  'text/html',
  'text/plain',
  'application/xliff+xml',
] as const;

export const deeplUploadAccept = deeplSupportedUploadExtensions.join(',');

export type DeepLDocumentStatusCode = 'done' | 'error' | 'queued' | 'translating' | 'uploaded';

export interface DeepLLanguageOption {
  code: string;
  name: string;
  supportsFormality?: boolean;
}

export interface DeepLLanguagesResponse {
  sourceLanguages: DeepLLanguageOption[];
  targetLanguages: DeepLLanguageOption[];
}

export interface DeepLDocumentHandle {
  documentId: string;
  documentKey: string;
}

export interface DeepLUploadResponse extends DeepLDocumentHandle {
  fileName: string;
  sourceLanguage: string | null;
  status: 'uploaded';
  targetLanguage: string;
}

export interface DeepLStatusResponse extends DeepLDocumentHandle {
  billedCharacters: number | null;
  errorMessage: string | null;
  isError: boolean;
  isReady: boolean;
  ok: boolean;
  secondsRemaining: number | null;
  status: DeepLDocumentStatusCode;
}
