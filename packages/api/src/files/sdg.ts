import {
  documentParserMimeTypes,
  inferMimeType,
  sdgSourceLanguages,
  sdgSupportedUploadMimeTypes,
} from 'librechat-data-provider';
import type {
  SDGMapResponse,
  SDGMappingNode,
  SDGSourceLanguage,
  SDGSourceType,
} from 'librechat-data-provider';
import { parseDocument } from './documents/crud';
import { parseTextNative } from './text';

type JSONPrimitive = boolean | number | string | null;
type JSONValue = JSONPrimitive | JSONObject | JSONValue[];

interface JSONObject {
  [key: string]: JSONValue | undefined;
}

type SDGErrorCode = 'bad_request' | 'config' | 'upstream';

type SDGServiceError = Error & {
  code?: SDGErrorCode;
  statusCode?: number;
};

type SDGExtractedInput = {
  fileName: string | null;
  fileMimeType: string | null;
  sourceType: SDGSourceType;
  text: string;
};

const SDG_API_URL = 'https://knowsdgs.jrc.ec.europa.eu/api/rest/mappingdata';

export const MAX_SDG_INPUT_TEXT_LENGTH = 3528000;
export const SDG_UPLOAD_FILE_SIZE_LIMIT_BYTES = 15 * 1024 * 1024;

const DEFAULT_SDG_SOURCE_LANGUAGE: SDGSourceLanguage = 'en';
const SDG_SOURCE_LANGUAGE_SET = new Set<string>(sdgSourceLanguages);
const SDG_SUPPORTED_UPLOAD_MIME_TYPE_SET = new Set<string>(sdgSupportedUploadMimeTypes);

const createSDGError = (
  message: string,
  statusCode: number,
  code: SDGErrorCode,
): SDGServiceError => {
  return Object.assign(new Error(message), {
    code,
    statusCode,
  });
};

const isJSONObject = (value: JSONValue | undefined): value is JSONObject => {
  return value != null && typeof value === 'object' && Array.isArray(value) === false;
};

const isJSONStringCandidate = (value: string): boolean => {
  const trimmedValue = value.trim();
  return trimmedValue.startsWith('{') || trimmedValue.startsWith('[');
};

const tryParseJsonString = (value: string): JSONValue | undefined => {
  try {
    return JSON.parse(value) as JSONValue;
  } catch {
    return undefined;
  }
};

const hasChildrenArray = (
  value: JSONValue | undefined,
): value is JSONObject & { children: JSONValue[] } => {
  return isJSONObject(value) && Array.isArray(value.children);
};

const getNestedPayloadCandidate = (value: JSONObject): JSONValue | undefined => {
  const candidates = [value.data, value.result, value.response, value.payload];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      return candidate;
    }
  }

  return undefined;
};

const unwrapJsonValue = (value: JSONValue | undefined): JSONValue | undefined => {
  let currentValue = value;

  for (let index = 0; index < 8; index += 1) {
    if (typeof currentValue === 'string' && isJSONStringCandidate(currentValue)) {
      const parsedValue = tryParseJsonString(currentValue);
      if (parsedValue === undefined) {
        return currentValue;
      }

      currentValue = parsedValue;
      continue;
    }

    if (Array.isArray(currentValue) && currentValue.length === 1) {
      currentValue = currentValue[0];
      continue;
    }

    if (hasChildrenArray(currentValue)) {
      return currentValue;
    }

    if (isJSONObject(currentValue)) {
      const nestedValue = getNestedPayloadCandidate(currentValue);
      if (nestedValue !== undefined && nestedValue !== null) {
        currentValue = nestedValue;
        continue;
      }
    }

    break;
  }

  return currentValue;
};

const findSDGTree = (value: JSONValue | undefined): JSONObject | undefined => {
  const normalizedValue = unwrapJsonValue(value);

  if (normalizedValue === undefined) {
    return undefined;
  }

  if (Array.isArray(normalizedValue)) {
    for (const item of normalizedValue) {
      const tree = findSDGTree(item);
      if (tree) {
        return tree;
      }
    }
    return undefined;
  }

  if (hasChildrenArray(normalizedValue)) {
    return normalizedValue;
  }

  if (!isJSONObject(normalizedValue)) {
    return undefined;
  }

  const directCandidate = getNestedPayloadCandidate(normalizedValue);
  if (directCandidate !== undefined && directCandidate !== null) {
    const tree = findSDGTree(directCandidate);
    if (tree) {
      return tree;
    }
  }

  for (const nestedValue of Object.values(normalizedValue)) {
    const tree = findSDGTree(nestedValue);
    if (tree) {
      return tree;
    }
  }

  return undefined;
};

const readSDGNodeObject = (value: JSONValue | undefined): JSONObject | undefined => {
  const tree = findSDGTree(value);
  if (tree) {
    return tree;
  }

  const normalizedValue = unwrapJsonValue(value);
  if (!isJSONObject(normalizedValue)) {
    return undefined;
  }

  if (typeof normalizedValue.name !== 'string' || normalizedValue.name.trim().length === 0) {
    return undefined;
  }

  return normalizedValue;
};

const findSDGMessage = (value: JSONValue | undefined): string | null => {
  const normalizedValue = unwrapJsonValue(value);

  if (normalizedValue === undefined) {
    return null;
  }

  if (typeof normalizedValue === 'string') {
    return normalizedValue;
  }

  if (Array.isArray(normalizedValue)) {
    for (const item of normalizedValue) {
      const message = findSDGMessage(item);
      if (message) {
        return message;
      }
    }
    return null;
  }

  if (!isJSONObject(normalizedValue)) {
    return null;
  }

  if (typeof normalizedValue.message === 'string' && normalizedValue.message.trim().length > 0) {
    return normalizedValue.message.trim();
  }

  const nestedCandidate = getNestedPayloadCandidate(normalizedValue);
  if (nestedCandidate !== undefined && nestedCandidate !== null) {
    const nestedMessage = findSDGMessage(nestedCandidate);
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  return null;
};

const readOccurrences = (value: JSONValue | undefined): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsedValue = Number.parseInt(value, 10);
    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return 0;
};

const readRelevance = (value: JSONValue | undefined): string | null => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
};

const normalizeSDGNode = (value: JSONValue | undefined): SDGMappingNode | undefined => {
  const node = readSDGNodeObject(value);
  if (!node || typeof node.name !== 'string' || node.name.trim().length === 0) {
    return undefined;
  }

  const children: SDGMappingNode[] = [];
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const normalizedChild = normalizeSDGNode(child);
      if (normalizedChild) {
        children.push(normalizedChild);
      }
    }
  }

  return {
    id: typeof node.id === 'string' ? node.id : null,
    type: typeof node.type === 'string' ? node.type : null,
    name: node.name.trim(),
    occurrences: readOccurrences(node.n_occurrences),
    relevance: readRelevance(node.relevance),
    children,
  };
};

const normalizeSDGGoals = (value: JSONValue | undefined): SDGMappingNode[] => {
  const tree = findSDGTree(value);
  if (!tree || !Array.isArray(tree.children)) {
    return [];
  }

  const goals: SDGMappingNode[] = [];
  for (const child of tree.children) {
    const normalizedGoal = normalizeSDGNode(child);
    if (normalizedGoal) {
      goals.push(normalizedGoal);
    }
  }

  return goals;
};

const countDescendants = (nodes: SDGMappingNode[]): number => {
  let count = 0;

  for (const node of nodes) {
    count += node.children.length;
    count += countDescendants(node.children);
  }

  return count;
};

const countTopLevelOccurrences = (nodes: SDGMappingNode[]): number => {
  let count = 0;

  for (const node of nodes) {
    count += node.occurrences;
  }

  return count;
};

const normalizeInputText = (inputText: string): string => {
  const normalizedText = inputText.replaceAll('\0', '').trim();

  if (normalizedText.length === 0) {
    throw createSDGError('Provide input text or upload a supported document.', 400, 'bad_request');
  }

  if (normalizedText.length > MAX_SDG_INPUT_TEXT_LENGTH) {
    throw createSDGError(
      `Input text is too long. The SDG mapper limit is ${MAX_SDG_INPUT_TEXT_LENGTH} characters.`,
      400,
      'bad_request',
    );
  }

  return normalizedText;
};

const isDocumentParserMimeType = (mimeType: string): boolean => {
  return documentParserMimeTypes.some((pattern) => pattern.test(mimeType));
};

export const normalizeSDGUploadMimeType = ({
  fileName,
  mimeType,
}: {
  fileName: string;
  mimeType?: string | null;
}): string => {
  const currentType =
    mimeType == null || mimeType === 'application/octet-stream' ? '' : mimeType.toLowerCase();
  return inferMimeType(fileName, currentType).toLowerCase();
};

export const isSDGUploadMimeType = (mimeType: string): boolean => {
  return SDG_SUPPORTED_UPLOAD_MIME_TYPE_SET.has(mimeType.toLowerCase());
};

export const normalizeSDGSourceLanguage = (sourceLanguage?: string | null): SDGSourceLanguage => {
  const normalizedLanguage = sourceLanguage?.trim().toLowerCase() ?? DEFAULT_SDG_SOURCE_LANGUAGE;
  if (SDG_SOURCE_LANGUAGE_SET.has(normalizedLanguage) === false) {
    throw createSDGError(
      `Unsupported SDG source language "${sourceLanguage ?? ''}".`,
      400,
      'bad_request',
    );
  }

  return normalizedLanguage as SDGSourceLanguage;
};

const extractInputFromFile = async (file: Express.Multer.File): Promise<SDGExtractedInput> => {
  const normalizedMimeType = normalizeSDGUploadMimeType({
    fileName: file.originalname,
    mimeType: file.mimetype,
  });

  if (isSDGUploadMimeType(normalizedMimeType) === false) {
    throw createSDGError(
      `Unsupported SDG file type "${normalizedMimeType}" for "${file.originalname}".`,
      400,
      'bad_request',
    );
  }

  const normalizedFile: Express.Multer.File = {
    ...file,
    mimetype: normalizedMimeType,
  };

  if (isDocumentParserMimeType(normalizedMimeType)) {
    const parsedDocument = await parseDocument({ file: normalizedFile });
    return {
      fileName: file.originalname,
      fileMimeType: normalizedMimeType,
      sourceType: 'file',
      text: normalizeInputText(parsedDocument.text),
    };
  }

  const parsedText = await parseTextNative(normalizedFile);
  return {
    fileName: file.originalname,
    fileMimeType: normalizedMimeType,
    sourceType: 'file',
    text: normalizeInputText(parsedText.text),
  };
};

const extractSDGInput = async ({
  file,
  inputText,
}: {
  file?: Express.Multer.File;
  inputText?: string | null;
}): Promise<SDGExtractedInput> => {
  if (file) {
    return extractInputFromFile(file);
  }

  if (typeof inputText === 'string') {
    return {
      fileName: null,
      fileMimeType: null,
      sourceType: 'text',
      text: normalizeInputText(inputText),
    };
  }

  throw createSDGError('Provide input text or upload a supported document.', 400, 'bad_request');
};

const fetchSDGPayload = async ({
  inputText,
  sourceLanguage,
}: {
  inputText: string;
  sourceLanguage: SDGSourceLanguage;
}): Promise<{ message: string | null; payload?: JSONValue }> => {
  const apiKey = process.env.SDG_API_KEY?.trim();
  if (!apiKey) {
    throw createSDGError('SDG API key not configured.', 500, 'config');
  }

  let response: Response;
  try {
    response = await fetch(SDG_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({
        input_text: inputText,
        indicators: 'False',
        source_language: sourceLanguage,
      }),
    });
  } catch {
    throw createSDGError('Failed to reach the SDG mapper service.', 502, 'upstream');
  }

  if (response.status === 204) {
    return {
      message: 'Successful request with no results',
    };
  }

  const responseText = await response.text();
  if (response.ok === false) {
    throw createSDGError(
      `SDG mapper request failed with status ${response.status}.`,
      502,
      'upstream',
    );
  }

  if (responseText.trim().length === 0) {
    return {
      message: null,
    };
  }

  const payload = tryParseJsonString(responseText);
  if (payload === undefined) {
    throw createSDGError('SDG mapper returned an invalid JSON payload.', 502, 'upstream');
  }

  return {
    message: null,
    payload,
  };
};

const createSDGResponse = ({
  fileName,
  fileMimeType,
  goals,
  message,
  sourceLanguage,
  sourceType,
  textLength,
}: {
  fileName: string | null;
  fileMimeType: string | null;
  goals: SDGMappingNode[];
  message: string | null;
  sourceLanguage: SDGSourceLanguage;
  sourceType: SDGSourceType;
  textLength: number;
}): SDGMapResponse => {
  return {
    generatedAt: new Date().toISOString(),
    message,
    sourceType,
    sourceLanguage,
    fileName,
    fileMimeType,
    textLength,
    totalGoals: goals.length,
    totalTargets: countDescendants(goals),
    totalOccurrences: countTopLevelOccurrences(goals),
    goals,
  };
};

export async function mapSDGInput({
  file,
  inputText,
  sourceLanguage,
}: {
  file?: Express.Multer.File;
  inputText?: string | null;
  sourceLanguage?: string | null;
}): Promise<SDGMapResponse> {
  const normalizedLanguage = normalizeSDGSourceLanguage(sourceLanguage);
  const extractedInput = await extractSDGInput({ file, inputText });
  const { message, payload } = await fetchSDGPayload({
    inputText: extractedInput.text,
    sourceLanguage: normalizedLanguage,
  });

  const goals = normalizeSDGGoals(payload);
  if (goals.length > 0) {
    return createSDGResponse({
      fileName: extractedInput.fileName,
      fileMimeType: extractedInput.fileMimeType,
      goals,
      message,
      sourceLanguage: normalizedLanguage,
      sourceType: extractedInput.sourceType,
      textLength: extractedInput.text.length,
    });
  }

  const payloadMessage = findSDGMessage(payload);
  if (payload !== undefined && payloadMessage == null) {
    throw createSDGError('SDG mapper returned an unexpected payload structure.', 502, 'upstream');
  }

  return createSDGResponse({
    fileName: extractedInput.fileName,
    fileMimeType: extractedInput.fileMimeType,
    goals,
    message: payloadMessage ?? message ?? 'No SDG matches were returned for the provided input.',
    sourceLanguage: normalizedLanguage,
    sourceType: extractedInput.sourceType,
    textLength: extractedInput.text.length,
  });
}
