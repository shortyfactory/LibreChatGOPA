import os from 'os';
import path from 'path';
import { existsSync } from 'fs';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { FileContext } from 'librechat-data-provider';
import { createModels } from '~/models';
import { createFileUploadStatMethods } from './fileUploadStat';

let File: mongoose.Model<unknown>;
jest.setTimeout(300000);

let mongoServer: MongoMemoryServer | null = null;
let modelsToCleanup: string[] = [];
let methods: ReturnType<typeof createFileUploadStatMethods>;

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

describe('File Upload Stat Methods', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create(getMongoMemoryServerOptions());
    await mongoose.connect(mongoServer.getUri());

    const models = createModels(mongoose);
    modelsToCleanup = Object.keys(models);
    Object.assign(mongoose.models, models);

    File = mongoose.models.File as mongoose.Model<unknown>;
    methods = createFileUploadStatMethods(mongoose);
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

  it('should record uploads and return counts by user id', async () => {
    const userId = new mongoose.Types.ObjectId();
    await methods.recordSidebarFileUpload({ userId });
    await methods.recordSidebarFileUpload({ userId });

    const counts = await methods.getSidebarUploadCountsByUserIds([userId]);
    expect(counts.get(userId.toString())).toBe(2);
  });

  it('should sync upload counts from eligible file documents only', async () => {
    const firstUserId = new mongoose.Types.ObjectId();
    const secondUserId = new mongoose.Types.ObjectId();
    const oldDate = new Date('2024-01-01T00:00:00.000Z');
    const recentDate = new Date('2024-03-01T00:00:00.000Z');

    await File.create({
      user: firstUserId,
      file_id: uuidv4(),
      filename: 'count-me-1.txt',
      filepath: '/uploads/count-me-1.txt',
      type: 'text/plain',
      bytes: 100,
      retentionEligible: true,
    });

    await File.create({
      user: firstUserId,
      file_id: uuidv4(),
      filename: 'count-me-2.txt',
      filepath: '/uploads/count-me-2.txt',
      type: 'text/plain',
      bytes: 100,
      context: FileContext.message_attachment,
    });

    await File.create({
      user: secondUserId,
      file_id: uuidv4(),
      filename: 'do-not-count.txt',
      filepath: '/uploads/do-not-count.txt',
      type: 'text/plain',
      bytes: 100,
      context: FileContext.assistants,
    });

    const createdFiles = await File.find({}).sort({ filename: 1 }).lean();
    await File.updateOne(
      { _id: (createdFiles[0] as { _id: mongoose.Types.ObjectId })._id },
      { $set: { createdAt: oldDate, updatedAt: oldDate } },
    );
    await File.updateOne(
      { _id: (createdFiles[1] as { _id: mongoose.Types.ObjectId })._id },
      { $set: { createdAt: recentDate, updatedAt: recentDate } },
    );

    const syncResult = await methods.syncSidebarUploadCountsFromFiles();
    expect(syncResult.syncedUsers).toBe(1);

    const counts = await methods.getSidebarUploadCountsByUserIds([firstUserId, secondUserId]);
    expect(counts.get(firstUserId.toString())).toBe(2);
    expect(counts.has(secondUserId.toString())).toBe(false);
  });
});
