import { randomUUID } from 'crypto';
import { readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { deeplSupportedUploadMimeTypes, inferMimeType } from 'librechat-data-provider';
import type {
  DeepLDocumentHandle,
  DeepLLanguageOption,
  DeepLLanguagesResponse,
  DeepLStatusResponse,
  DeepLUploadResponse,
} from 'librechat-data-provider';
import {
  Translator,
  type DocumentHandle,
  type DocumentStatus,
  type Language,
  type SourceLanguageCode,
  type TargetLanguageCode,
  type TranslatorOptions,
} from 'deepl-node';
import { sanitizeFilename } from '../utils';

type DeepLErrorCode = 'bad_request' | 'config' | 'upstream';

type DeepLServiceError = Error & {
  code?: DeepLErrorCode;
  statusCode?: number;
};

type DeepLUploadInput = {
  fileBuffer: Buffer;
  fileName: string;
  mimeType?: string | null;
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
};

const CUSTOM_DEEPL_MIME_TYPES: Record<string, string> = {
  '.xlf': 'application/xliff+xml',
  '.xliff': 'application/xliff+xml',
};

const DEFAULT_DOWNLOAD_MIME_TYPE = 'application/octet-stream';
const DEFAULT_DOWNLOAD_PREFIX = 'translated';
const DEEPL_SUPPORTED_UPLOAD_MIME_TYPE_SET = new Set<string>(deeplSupportedUploadMimeTypes);

export const DEEPL_UPLOAD_FILE_SIZE_LIMIT_BYTES = 25 * 1024 * 1024;

const createDeepLError = (
  message: string,
  statusCode: number,
  code: DeepLErrorCode,
): DeepLServiceError => {
  return Object.assign(new Error(message), {
    code,
    statusCode,
  });
};

const getDeepLTranslator = (): Translator => {
  const apiKey = process.env.DEEPL_API_KEY?.trim();
  if (!apiKey) {
    throw createDeepLError('DeepL API key not configured.', 500, 'config');
  }

  const serverUrl = process.env.DEEPL_API_SERVER_URL?.trim();
  const options: TranslatorOptions | undefined = serverUrl ? { serverUrl } : undefined;
  return new Translator(apiKey, options);
};

const normalizeDeepLError = (error: unknown, fallbackMessage: string): DeepLServiceError => {
  if (
    error != null &&
    typeof error === 'object' &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    return error as DeepLServiceError;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return createDeepLError(error.message, 502, 'upstream');
  }

  return createDeepLError(fallbackMessage, 502, 'upstream');
};

const normalizeDeepLFileName = (fileName: string): string => {
  let decodedFileName = fileName.trim();

  try {
    decodedFileName = decodeURIComponent(decodedFileName);
  } catch {
    decodedFileName = fileName.trim();
  }

  return sanitizeFilename(decodedFileName);
};

function normalizeDeepLLanguageCode(
  value: string | null | undefined,
  options: {
    label: string;
    required: true;
  },
): string;
function normalizeDeepLLanguageCode(
  value: string | null | undefined,
  options: {
    label: string;
    required: false;
  },
): string | null;
function normalizeDeepLLanguageCode(
  value: string | null | undefined,
  {
    label,
    required,
  }: {
    label: string;
    required: boolean;
  },
): string | null {
  const normalizedValue = value?.trim() ?? '';

  if (normalizedValue.length === 0) {
    if (required) {
      throw createDeepLError(`DeepL ${label} is required.`, 400, 'bad_request');
    }

    return null;
  }

  return normalizedValue;
}

const getDeepLDocumentHandle = (handle: DeepLDocumentHandle): DocumentHandle => {
  const documentId = handle.documentId?.trim();
  const documentKey = handle.documentKey?.trim();

  if (!documentId || !documentKey) {
    throw createDeepLError(
      'Both documentId and documentKey are required for DeepL document operations.',
      400,
      'bad_request',
    );
  }

  return {
    documentId,
    documentKey,
  };
};

const normalizeDeepLLanguageOption = (language: Language): DeepLLanguageOption => {
  return {
    code: language.code,
    name: language.name,
    ...(language.supportsFormality !== undefined
      ? { supportsFormality: language.supportsFormality }
      : {}),
  };
};

const normalizeDeepLDocumentStatus = ({
  handle,
  status,
}: {
  handle: DocumentHandle;
  status: DocumentStatus;
}): DeepLStatusResponse => {
  return {
    documentId: handle.documentId,
    documentKey: handle.documentKey,
    billedCharacters: status.billedCharacters ?? null,
    errorMessage: status.errorMessage ?? null,
    isError: status.status === 'error',
    isReady: status.done(),
    ok: status.ok(),
    secondsRemaining: status.secondsRemaining ?? null,
    status: status.status,
  };
};

const getCustomDeepLMimeType = (fileName: string): string | undefined => {
  const extension = path.extname(fileName).toLowerCase();
  return CUSTOM_DEEPL_MIME_TYPES[extension];
};

export const normalizeDeepLUploadMimeType = ({
  fileName,
  mimeType,
}: {
  fileName: string;
  mimeType?: string | null;
}): string => {
  const customMimeType = getCustomDeepLMimeType(fileName);
  if (customMimeType) {
    return customMimeType;
  }

  const currentType =
    mimeType == null || mimeType === 'application/octet-stream' ? '' : mimeType.toLowerCase();

  return inferMimeType(fileName, currentType).toLowerCase();
};

export const isDeepLUploadMimeType = (mimeType: string): boolean => {
  return DEEPL_SUPPORTED_UPLOAD_MIME_TYPE_SET.has(mimeType.toLowerCase());
};

export const createDeepLTranslatedFileName = ({
  fileName,
  targetLanguage,
}: {
  fileName?: string | null;
  targetLanguage?: string | null;
}): string => {
  const normalizedTargetLanguage = sanitizeFilename(
    targetLanguage?.trim() || DEFAULT_DOWNLOAD_PREFIX,
  );
  const normalizedFileName = fileName?.trim()
    ? normalizeDeepLFileName(fileName)
    : DEFAULT_DOWNLOAD_PREFIX;
  const fileExtension = path.extname(normalizedFileName);
  const fileBaseName = path.basename(normalizedFileName, fileExtension);

  return fileExtension.length > 0
    ? `${fileBaseName}_${normalizedTargetLanguage}${fileExtension}`
    : `${fileBaseName}_${normalizedTargetLanguage}`;
};

export const createDeepLUploadMetadata = ({
  fileName,
  mimeType,
}: {
  fileName: string;
  mimeType?: string | null;
}): {
  fileExtension: string;
  fileName: string;
  mimeType: string;
} => {
  const normalizedFileName = normalizeDeepLFileName(fileName);
  const normalizedMimeType = normalizeDeepLUploadMimeType({
    fileName: normalizedFileName,
    mimeType,
  });

  if (!normalizedFileName) {
    throw createDeepLError('A valid DeepL file name is required.', 400, 'bad_request');
  }

  if (isDeepLUploadMimeType(normalizedMimeType) === false) {
    throw createDeepLError(
      `Unsupported DeepL file type "${normalizedMimeType}" for "${normalizedFileName}".`,
      400,
      'bad_request',
    );
  }

  return {
    fileExtension: path.extname(normalizedFileName).toLowerCase(),
    fileName: normalizedFileName,
    mimeType: normalizedMimeType,
  };
};

export async function getDeepLLanguages(): Promise<DeepLLanguagesResponse> {
  try {
    const translator = getDeepLTranslator();
    const [sourceLanguages, targetLanguages] = await Promise.all([
      translator.getSourceLanguages(),
      translator.getTargetLanguages(),
    ]);

    return {
      sourceLanguages: sourceLanguages.map(normalizeDeepLLanguageOption),
      targetLanguages: targetLanguages.map(normalizeDeepLLanguageOption),
    };
  } catch (error) {
    throw normalizeDeepLError(error, 'Failed to retrieve available DeepL languages.');
  }
}

export async function uploadDeepLDocument({
  fileBuffer,
  fileName,
  mimeType,
  sourceLanguage,
  targetLanguage,
}: DeepLUploadInput): Promise<DeepLUploadResponse> {
  if (fileBuffer.byteLength === 0) {
    throw createDeepLError('DeepL upload received an empty file.', 400, 'bad_request');
  }

  const translator = getDeepLTranslator();
  const normalizedSourceLanguage = normalizeDeepLLanguageCode(sourceLanguage, {
    label: 'source language',
    required: false,
  });
  const normalizedTargetLanguage = normalizeDeepLLanguageCode(targetLanguage, {
    label: 'target language',
    required: true,
  });
  const uploadMetadata = createDeepLUploadMetadata({
    fileName,
    mimeType,
  });

  try {
    const handle = await translator.uploadDocument(
      fileBuffer,
      normalizedSourceLanguage as SourceLanguageCode | null,
      normalizedTargetLanguage as TargetLanguageCode,
      {
        filename: uploadMetadata.fileName,
      },
    );

    return {
      documentId: handle.documentId,
      documentKey: handle.documentKey,
      fileName: uploadMetadata.fileName,
      sourceLanguage: normalizedSourceLanguage,
      status: 'uploaded',
      targetLanguage: normalizedTargetLanguage,
    };
  } catch (error) {
    throw normalizeDeepLError(error, 'Failed to upload the document to DeepL.');
  }
}

export async function getDeepLDocumentStatus(
  handle: DeepLDocumentHandle,
): Promise<DeepLStatusResponse> {
  const normalizedHandle = getDeepLDocumentHandle(handle);

  try {
    const translator = getDeepLTranslator();
    const status = await translator.getDocumentStatus(normalizedHandle);
    return normalizeDeepLDocumentStatus({
      handle: normalizedHandle,
      status,
    });
  } catch (error) {
    throw normalizeDeepLError(error, 'Failed to retrieve the DeepL document status.');
  }
}

export async function downloadDeepLDocument(
  handle: DeepLDocumentHandle,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const normalizedHandle = getDeepLDocumentHandle(handle);
  const outputFilePath = path.join(tmpdir(), `deepl-${randomUUID()}`);

  try {
    const translator = getDeepLTranslator();
    await translator.downloadDocument(normalizedHandle, outputFilePath);
    const buffer = await readFile(outputFilePath);

    return {
      buffer,
      mimeType: DEFAULT_DOWNLOAD_MIME_TYPE,
    };
  } catch (error) {
    throw normalizeDeepLError(error, 'Failed to download the translated document from DeepL.');
  } finally {
    await rm(outputFilePath, { force: true });
  }
}
