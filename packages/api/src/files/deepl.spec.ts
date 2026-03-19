import { writeFile } from 'fs/promises';

const mockedDownloadDocument = jest.fn();
const mockedGetDocumentStatus = jest.fn();
const mockedGetSourceLanguages = jest.fn();
const mockedGetTargetLanguages = jest.fn();
const mockedUploadDocument = jest.fn();

jest.mock('deepl-node', () => ({
  Translator: jest.fn().mockImplementation(() => ({
    downloadDocument: mockedDownloadDocument,
    getDocumentStatus: mockedGetDocumentStatus,
    getSourceLanguages: mockedGetSourceLanguages,
    getTargetLanguages: mockedGetTargetLanguages,
    uploadDocument: mockedUploadDocument,
  })),
}));

import {
  createDeepLTranslatedFileName,
  downloadDeepLDocument,
  getDeepLDocumentStatus,
  getDeepLLanguages,
  isDeepLUploadMimeType,
  normalizeDeepLUploadMimeType,
  uploadDeepLDocument,
} from './deepl';

describe('deepl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DEEPL_API_KEY = 'test-deepl-key';
    delete process.env.DEEPL_API_SERVER_URL;
  });

  afterEach(() => {
    delete process.env.DEEPL_API_KEY;
    delete process.env.DEEPL_API_SERVER_URL;
  });

  it('normalizes custom XLIFF MIME types and validates DeepL support', () => {
    const normalizedMimeType = normalizeDeepLUploadMimeType({
      fileName: 'translation.xlf',
      mimeType: 'application/octet-stream',
    });

    expect(normalizedMimeType).toBe('application/xliff+xml');
    expect(isDeepLUploadMimeType(normalizedMimeType)).toBe(true);
  });

  it('builds a translated file name using a sanitized source file name', () => {
    expect(
      createDeepLTranslatedFileName({
        fileName: 'policy brief.docx',
        targetLanguage: 'fr',
      }),
    ).toBe('policy_brief_fr.docx');
  });

  it('retrieves and normalizes available DeepL languages', async () => {
    mockedGetSourceLanguages.mockResolvedValue([
      { code: 'EN', name: 'English' },
      { code: 'FR', name: 'French' },
    ]);
    mockedGetTargetLanguages.mockResolvedValue([
      { code: 'DE', name: 'German', supportsFormality: true },
    ]);

    await expect(getDeepLLanguages()).resolves.toEqual({
      sourceLanguages: [
        { code: 'EN', name: 'English' },
        { code: 'FR', name: 'French' },
      ],
      targetLanguages: [{ code: 'DE', name: 'German', supportsFormality: true }],
    });
  });

  it('uploads a document and returns a normalized DeepL handle', async () => {
    mockedUploadDocument.mockResolvedValue({
      documentId: 'doc-123',
      documentKey: 'key-123',
    });

    await expect(
      uploadDeepLDocument({
        fileBuffer: Buffer.from('document'),
        fileName: 'policy brief.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sourceLanguage: 'EN',
        targetLanguage: 'FR',
      }),
    ).resolves.toEqual({
      documentId: 'doc-123',
      documentKey: 'key-123',
      fileName: 'policy_brief.docx',
      sourceLanguage: 'EN',
      status: 'uploaded',
      targetLanguage: 'FR',
    });

    expect(mockedUploadDocument).toHaveBeenCalledWith(Buffer.from('document'), 'EN', 'FR', {
      filename: 'policy_brief.docx',
    });
  });

  it('retrieves and normalizes DeepL document status', async () => {
    mockedGetDocumentStatus.mockResolvedValue({
      billedCharacters: 1234,
      done: () => true,
      errorMessage: undefined,
      ok: () => true,
      secondsRemaining: 0,
      status: 'done',
    });

    await expect(
      getDeepLDocumentStatus({
        documentId: 'doc-456',
        documentKey: 'key-456',
      }),
    ).resolves.toEqual({
      documentId: 'doc-456',
      documentKey: 'key-456',
      billedCharacters: 1234,
      errorMessage: null,
      isError: false,
      isReady: true,
      ok: true,
      secondsRemaining: 0,
      status: 'done',
    });
  });

  it('downloads the translated document into a temporary file and returns a buffer', async () => {
    mockedDownloadDocument.mockImplementation(async (_handle: unknown, outputPath: string) => {
      await writeFile(outputPath, 'translated payload');
    });

    await expect(
      downloadDeepLDocument({
        documentId: 'doc-789',
        documentKey: 'key-789',
      }),
    ).resolves.toEqual({
      buffer: Buffer.from('translated payload'),
      mimeType: 'application/octet-stream',
    });
  });

  it('throws a configuration error when the DeepL key is missing', async () => {
    delete process.env.DEEPL_API_KEY;

    await expect(getDeepLLanguages()).rejects.toMatchObject({
      code: 'config',
      message: 'DeepL API key not configured.',
      statusCode: 500,
    });
  });
});
