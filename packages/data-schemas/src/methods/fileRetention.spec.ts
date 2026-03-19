import os from 'os';
import path from 'path';
import { existsSync } from 'fs';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { FileContext } from 'librechat-data-provider';
import { MAX_RETENTION_DAYS } from '~/fileRetention';
import { createModels } from '~/models';
import { createFileRetentionMethods } from './fileRetention';

let File: mongoose.Model<unknown>;
jest.setTimeout(300000);

let mongoServer: MongoMemoryServer | null = null;
let modelsToCleanup: string[] = [];
let methods: ReturnType<typeof createFileRetentionMethods>;

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

describe('File Retention Methods', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create(getMongoMemoryServerOptions());
    await mongoose.connect(mongoServer.getUri());

    const models = createModels(mongoose);
    modelsToCleanup = Object.keys(models);
    Object.assign(mongoose.models, models);

    File = mongoose.models.File as mongoose.Model<unknown>;
    methods = createFileRetentionMethods(mongoose);
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

  it('should return default retention settings when none are stored', async () => {
    const settings = await methods.getSidebarFileRetentionSettings();

    expect(settings.enabled).toBe(false);
    expect(settings.retentionDays).toBe(30);
    expect(settings.updatedAt).toBeNull();
  });

  it('should upsert and normalize sidebar file retention settings', async () => {
    const updated = await methods.updateSidebarFileRetentionSettings({
      enabled: true,
      retentionDays: 99999,
    });

    expect(updated.enabled).toBe(true);
    expect(updated.retentionDays).toBe(MAX_RETENTION_DAYS);
    expect(updated.updatedAt).not.toBeNull();

    const persisted = await methods.getSidebarFileRetentionSettings();
    expect(persisted.enabled).toBe(true);
    expect(persisted.retentionDays).toBe(MAX_RETENTION_DAYS);
  });

  it('should retrieve only eligible files for cleanup', async () => {
    const userId = new mongoose.Types.ObjectId();
    const oldDate = new Date('2024-01-01T00:00:00.000Z');
    const cutoffDate = new Date('2024-06-01T00:00:00.000Z');

    await File.create({
      user: userId,
      file_id: uuidv4(),
      filename: 'eligible-by-context.txt',
      filepath: '/uploads/context.txt',
      type: 'text/plain',
      bytes: 100,
      context: FileContext.message_attachment,
    });

    await File.create({
      user: userId,
      file_id: uuidv4(),
      filename: 'eligible-by-flag.txt',
      filepath: '/uploads/flag.txt',
      type: 'text/plain',
      bytes: 100,
      retentionEligible: true,
    });

    await File.create({
      user: userId,
      file_id: uuidv4(),
      filename: 'not-eligible.txt',
      filepath: '/uploads/nope.txt',
      type: 'text/plain',
      bytes: 100,
      context: FileContext.assistants,
    });

    await File.collection.updateMany(
      {},
      {
        $set: {
          createdAt: oldDate,
          updatedAt: oldDate,
        },
      },
    );

    const cleanupCandidates = await methods.getSidebarUploadsForCleanup({
      cutoffDate,
      limit: 10,
    });

    expect(cleanupCandidates).toHaveLength(2);
    expect(cleanupCandidates.map((file) => (file as { filename: string }).filename)).toEqual(
      expect.arrayContaining(['eligible-by-context.txt', 'eligible-by-flag.txt']),
    );
  });
});
