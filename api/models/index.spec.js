const { MongoMemoryServer } = require('mongodb-memory-server');

describe('api/models/index initialization', () => {
  let mongoServer;
  let isolatedMongoose;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
  });

  afterAll(async () => {
    if (isolatedMongoose?.connection?.readyState > 0) {
      await isolatedMongoose.disconnect();
    }

    await mongoServer.stop();
  });

  beforeEach(async () => {
    if (isolatedMongoose?.connection?.readyState > 0) {
      for (const collection of Object.values(isolatedMongoose.connection.collections)) {
        await collection.deleteMany({});
      }

      await isolatedMongoose.disconnect();
    }

    jest.resetModules();
    isolatedMongoose = null;
  });

  test('initializes data-schema methods after Mongo models are registered', async () => {
    let methods;

    jest.isolateModules(() => {
      isolatedMongoose = require('mongoose');
      methods = require('./index');
    });

    await isolatedMongoose.connect(mongoServer.getUri());

    await expect(methods.getSidebarFileRetentionSettings()).resolves.toEqual({
      enabled: false,
      retentionDays: 30,
      updatedAt: null,
    });

    await expect(
      methods.createDeepLJob({
        documentId: 'doc-init-order',
        documentKey: 'key-init-order',
        fileName: 'policy.docx',
        targetLanguage: 'FR',
        status: 'uploaded',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        documentId: 'doc-init-order',
        fileName: 'policy.docx',
        targetLanguage: 'FR',
      }),
    );

    await expect(
      methods.searchDeepLJobs({
        page: 1,
        limit: 10,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        jobs: [
          expect.objectContaining({
            documentId: 'doc-init-order',
          }),
        ],
        pagination: expect.objectContaining({
          totalJobs: 1,
        }),
      }),
    );
  });
});
