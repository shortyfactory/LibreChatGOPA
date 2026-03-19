import os from 'os';
import path from 'path';
import { existsSync } from 'fs';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels } from '~/models';
import { createDeepLJobMethods } from './deeplJob';

jest.setTimeout(300000);

let mongoServer: MongoMemoryServer | null = null;
let modelsToCleanup: string[] = [];
let methods: ReturnType<typeof createDeepLJobMethods>;

const getMongoMemoryServerOptions = () => {
  const preferredBinaryPath = path.join(
    os.homedir(),
    '.cache',
    'mongodb-binaries',
    'mongod-x64-win32-7.0.14.exe',
  );

  if (!existsSync(preferredBinaryPath)) {
    return undefined;
  }

  return {
    binary: {
      systemBinary: preferredBinaryPath,
    },
  };
};

describe('DeepL Job Methods', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create(getMongoMemoryServerOptions());
    await mongoose.connect(mongoServer.getUri());

    const models = createModels(mongoose);
    modelsToCleanup = Object.keys(models);
    Object.assign(mongoose.models, models);

    methods = createDeepLJobMethods(mongoose);
  });

  afterAll(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }

    for (const modelName of modelsToCleanup) {
      if (mongoose.models[modelName]) {
        delete mongoose.models[modelName];
      }
    }

    await mongoose.disconnect();

    if (mongoServer != null) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  it('should create a DeepL job with schema defaults', async () => {
    const created = await methods.createDeepLJob({
      documentId: uuidv4(),
      userId: new mongoose.Types.ObjectId().toString(),
      userEmail: 'user@example.com',
      fileName: 'document.docx',
      sourceLanguage: 'EN',
      targetLanguage: 'FR',
    });

    expect(created).not.toBeNull();
    expect(created?.status).toBe('uploaded');
    expect(created?.statusChecks).toBe(0);
    expect(created?.downloadAttempts).toBe(0);
  });

  it('should update the latest job by document id and increment counters', async () => {
    const documentId = uuidv4();
    await methods.createDeepLJob({
      documentId,
      status: 'uploaded',
      fileName: 'draft.docx',
    });

    const updated = await methods.updateDeepLJobByDocumentId(documentId, {
      status: 'translating',
      latestStatusProviderDetails: {
        translatedCharacters: 42,
      },
      $inc: {
        statusChecks: 1,
      },
    });

    expect(updated).not.toBeNull();
    expect(updated?.status).toBe('translating');
    expect(updated?.statusChecks).toBe(1);
    expect(updated?.latestStatusProviderDetails).toEqual({
      translatedCharacters: 42,
    });
  });

  it('should search DeepL jobs with filters and pagination', async () => {
    const matchingUserId = new mongoose.Types.ObjectId().toString();
    const otherUserId = new mongoose.Types.ObjectId().toString();

    await methods.createDeepLJob({
      documentId: uuidv4(),
      userId: matchingUserId,
      userEmail: 'match@example.com',
      fileName: 'important-report.docx',
      status: 'done',
      sourceLanguage: 'EN',
      targetLanguage: 'FR',
    });

    await methods.createDeepLJob({
      documentId: uuidv4(),
      userId: otherUserId,
      userEmail: 'other@example.com',
      fileName: 'other-file.docx',
      status: 'error',
      sourceLanguage: 'EN',
      targetLanguage: 'DE',
    });

    const result = await methods.searchDeepLJobs({
      page: 1,
      limit: 10,
      search: 'report',
      status: 'done',
      userId: matchingUserId,
    });

    expect(result.pagination.totalJobs).toBe(1);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].userId).toBe(matchingUserId);
    expect(result.jobs[0].status).toBe('done');
    expect(result.filters.search).toBe('report');
  });
});
