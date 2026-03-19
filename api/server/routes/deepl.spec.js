const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const mockedCreateDeepLTranslatedFileName = jest.fn();
const mockedCreateDeepLUploadMetadata = jest.fn();
const mockedDownloadDeepLDocument = jest.fn();
const mockedGetDeepLDocumentStatus = jest.fn();
const mockedGetDeepLLanguages = jest.fn();
const mockedIsDeepLUploadMimeType = jest.fn();
const mockedNormalizeDeepLUploadMimeType = jest.fn();
const mockedUploadDeepLDocument = jest.fn();

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  createDeepLTranslatedFileName: mockedCreateDeepLTranslatedFileName,
  createDeepLUploadMetadata: mockedCreateDeepLUploadMetadata,
  DEEPL_UPLOAD_FILE_SIZE_LIMIT_BYTES: 25 * 1024 * 1024,
  downloadDeepLDocument: mockedDownloadDeepLDocument,
  getDeepLDocumentStatus: mockedGetDeepLDocumentStatus,
  getDeepLLanguages: mockedGetDeepLLanguages,
  isDeepLUploadMimeType: mockedIsDeepLUploadMimeType,
  normalizeDeepLUploadMimeType: mockedNormalizeDeepLUploadMimeType,
  uploadDeepLDocument: mockedUploadDeepLDocument,
}));

jest.mock('~/server/middleware', () => ({
  checkBan: (_req, _res, next) => next(),
  createFileLimiters: () => ({
    fileUploadIpLimiter: (_req, _res, next) => next(),
    fileUploadUserLimiter: (_req, _res, next) => next(),
  }),
  requireJwtAuth: (_req, _res, next) => next(),
  uaParser: (_req, _res, next) => next(),
}));

describe('DeepL routes', () => {
  let app;
  let router;
  let mongoServer;
  let currentUserId;
  let DeepLJobAnalytics;
  let modelsToCleanup = [];

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const { createModels } = require('@librechat/data-schemas');
    const models = createModels(mongoose);
    modelsToCleanup = Object.keys(models);
    Object.assign(mongoose.models, models);

    DeepLJobAnalytics = models.DeepLJobAnalytics;
    router = require('./deepl');

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = {
        id: String(currentUserId),
        email: 'translator@example.com',
        name: 'Translator User',
        provider: 'local',
        role: 'USER',
        username: 'translator',
      };
      next();
    });
    app.use('/deepl', router);
  });

  afterAll(async () => {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }

    for (const modelName of modelsToCleanup) {
      if (mongoose.models[modelName]) {
        delete mongoose.models[modelName];
      }
    }

    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    for (const collection of Object.values(mongoose.connection.collections)) {
      await collection.deleteMany({});
    }

    jest.clearAllMocks();
    currentUserId = new mongoose.Types.ObjectId();

    mockedCreateDeepLTranslatedFileName.mockReturnValue('policy_fr.docx');
    mockedCreateDeepLUploadMetadata.mockImplementation(({ fileName, mimeType }) => ({
      fileExtension: '.docx',
      fileName,
      mimeType,
    }));
    mockedGetDeepLLanguages.mockResolvedValue({
      sourceLanguages: [{ code: 'EN', name: 'English' }],
      targetLanguages: [{ code: 'FR', name: 'French' }],
    });
    mockedIsDeepLUploadMimeType.mockReturnValue(true);
    mockedNormalizeDeepLUploadMimeType.mockImplementation(
      ({ mimeType }) => mimeType || 'application/octet-stream',
    );
  });

  test('GET /deepl/languages returns normalized language options', async () => {
    const response = await request(app).get('/deepl/languages');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      sourceLanguages: [{ code: 'EN', name: 'English' }],
      targetLanguages: [{ code: 'FR', name: 'French' }],
    });
  });

  test('POST /deepl/upload stores an uploaded job analytics record', async () => {
    mockedUploadDeepLDocument.mockResolvedValue({
      documentId: 'doc-uploaded',
      documentKey: 'key-uploaded',
      fileName: 'policy.docx',
      sourceLanguage: 'EN',
      status: 'uploaded',
      targetLanguage: 'FR',
    });

    const response = await request(app)
      .post('/deepl/upload')
      .field('sourceLanguage', 'EN')
      .field('targetLanguage', 'FR')
      .attach('file', Buffer.from('example document'), {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: 'policy.docx',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      documentId: 'doc-uploaded',
      documentKey: 'key-uploaded',
      fileName: 'policy.docx',
      sourceLanguage: 'EN',
      status: 'uploaded',
      targetLanguage: 'FR',
    });

    const job = await DeepLJobAnalytics.findOne({ documentId: 'doc-uploaded' }).lean();
    expect(job).toEqual(
      expect.objectContaining({
        documentId: 'doc-uploaded',
        documentKey: 'key-uploaded',
        fileName: 'policy.docx',
        sourceLanguage: 'EN',
        status: 'uploaded',
        targetLanguage: 'FR',
        uploadProviderStatus: 'ok',
        userEmail: 'translator@example.com',
        userId: String(currentUserId),
      }),
    );
  });

  test('POST /deepl/status updates DeepL job analytics', async () => {
    await DeepLJobAnalytics.create({
      documentId: 'doc-status',
      documentKey: 'key-status',
      fileName: 'status.docx',
      status: 'uploaded',
      targetLanguage: 'FR',
      userId: String(currentUserId),
    });

    mockedGetDeepLDocumentStatus.mockResolvedValue({
      documentId: 'doc-status',
      documentKey: 'key-status',
      billedCharacters: 456,
      errorMessage: null,
      isError: false,
      isReady: true,
      ok: true,
      secondsRemaining: 0,
      status: 'done',
    });

    const response = await request(app)
      .post('/deepl/status')
      .send({ documentId: 'doc-status', documentKey: 'key-status' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      documentId: 'doc-status',
      documentKey: 'key-status',
      billedCharacters: 456,
      errorMessage: null,
      isError: false,
      isReady: true,
      ok: true,
      secondsRemaining: 0,
      status: 'done',
    });

    const job = await DeepLJobAnalytics.findOne({ documentId: 'doc-status' }).lean();
    expect(job).toEqual(
      expect.objectContaining({
        status: 'done',
        statusChecks: 1,
      }),
    );
    expect(job.completedAt).toEqual(expect.any(Date));
  });

  test('POST /deepl/download returns the translated document and marks it downloaded', async () => {
    await DeepLJobAnalytics.create({
      documentId: 'doc-download',
      documentKey: 'key-download',
      fileName: 'policy.docx',
      status: 'done',
      targetLanguage: 'FR',
      userId: String(currentUserId),
    });

    mockedDownloadDeepLDocument.mockResolvedValue({
      buffer: Buffer.from('translated-content'),
      mimeType: 'application/octet-stream',
    });

    const response = await request(app)
      .post('/deepl/download')
      .send({ documentId: 'doc-download', documentKey: 'key-download' });

    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toBe('attachment; filename="policy_fr.docx"');
    expect(response.headers['content-type']).toContain('application/octet-stream');

    const job = await DeepLJobAnalytics.findOne({ documentId: 'doc-download' }).lean();
    expect(job).toEqual(
      expect.objectContaining({
        downloadAttempts: 1,
        status: 'downloaded',
      }),
    );
    expect(job.downloadedAt).toEqual(expect.any(Date));
  });

  test('POST /deepl/download falls back to request metadata when analytics job lookup is missing', async () => {
    mockedCreateDeepLTranslatedFileName.mockReturnValue('policy_en-US.pdf');
    mockedDownloadDeepLDocument.mockResolvedValue({
      buffer: Buffer.from('translated-content'),
      mimeType: 'application/octet-stream',
    });

    const response = await request(app).post('/deepl/download').send({
      documentId: 'doc-without-analytics',
      documentKey: 'key-without-analytics',
      fileName: 'policy.pdf',
      targetLanguage: 'en-US',
    });

    expect(response.status).toBe(200);
    expect(mockedCreateDeepLTranslatedFileName).toHaveBeenCalledWith({
      fileName: 'policy.pdf',
      targetLanguage: 'en-US',
    });
    expect(response.headers['content-disposition']).toBe('attachment; filename="policy_en-US.pdf"');
  });
});
