const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { ViolationTypes } = require('librechat-data-provider');

jest.mock('keyv', () => {
  class MockKeyv {
    constructor() {
      this.map = new Map();
      this.opts = {
        store: {
          entries: () => this.map.entries(),
        },
      };
    }

    async get(key) {
      return this.map.get(key);
    }

    async set(key, value) {
      this.map.set(key, value);
      return true;
    }

    async delete(key) {
      return this.map.delete(key);
    }

    clear() {
      this.map.clear();
    }

    iterator() {
      const entries = [...this.map.entries()];
      return (async function* iterate() {
        for (const entry of entries) {
          yield entry;
        }
      })();
    }
  }

  return { Keyv: MockKeyv };
});

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  requireAdmin: (_req, _res, next) => next(),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (_req, _res, next) => next(),
}));

jest.mock('~/server/services/AuthService', () => ({
  requestPasswordReset: jest.fn(),
}));

jest.mock('~/server/services/FileRetentionService', () => ({
  purgeAllSidebarUploadsNow: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
}));

jest.mock('~/cache', () => {
  const { Keyv } = require('keyv');
  const { ViolationTypes } = require('librechat-data-provider');

  const stores = {
    [ViolationTypes.GENERAL]: new Keyv(),
    [ViolationTypes.BAN]: new Keyv(),
  };

  return {
    getLogStores: jest.fn((key) => stores[key]),
    __stores: stores,
  };
});

const { requestPasswordReset } = require('~/server/services/AuthService');
const { purgeAllSidebarUploadsNow } = require('~/server/services/FileRetentionService');
const { __stores } = require('~/cache');

describe('Admin routes', () => {
  let app;
  let router;
  let mongoServer;
  let modelsToCleanup = [];
  let currentAdminId;
  let User;
  let Agent;
  let Conversation;
  let Prompt;
  let PromptGroup;
  let Preset;
  let File;
  let DeepLJobAnalytics;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const { createModels } = require('@librechat/data-schemas');
    const models = createModels(mongoose);
    modelsToCleanup = Object.keys(models);
    Object.assign(mongoose.models, models);

    User = models.User;
    Agent = models.Agent;
    Conversation = models.Conversation;
    Prompt = models.Prompt;
    PromptGroup = models.PromptGroup;
    Preset = models.Preset;
    File = models.File;
    DeepLJobAnalytics = models.DeepLJobAnalytics;

    router = require('./index');

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: String(currentAdminId), role: 'ADMIN' };
      req.config = { fileStrategy: 'local' };
      next();
    });
    app.use('/admin', router);
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

    for (const store of Object.values(__stores)) {
      store.clear();
    }

    jest.clearAllMocks();
    requestPasswordReset.mockResolvedValue({
      message: 'If an account with that email exists, a password reset link has been sent to it.',
    });
    purgeAllSidebarUploadsNow.mockResolvedValue({ attemptedDeletes: 0 });

    currentAdminId = new mongoose.Types.ObjectId();
    await User.create({
      _id: currentAdminId,
      email: 'admin@example.com',
      username: 'admin',
      provider: 'local',
      role: 'ADMIN',
      emailVerified: true,
    });
  });

  test('GET /admin/users returns live users and ban flags', async () => {
    const bannedUserId = new mongoose.Types.ObjectId();
    const activeUserId = new mongoose.Types.ObjectId();

    await User.create([
      {
        _id: bannedUserId,
        email: 'banned@example.com',
        username: 'banned-user',
        provider: 'local',
        role: 'USER',
        emailVerified: true,
      },
      {
        _id: activeUserId,
        email: 'active@example.com',
        username: 'active-user',
        provider: 'openid',
        role: 'USER',
        emailVerified: false,
      },
    ]);

    await __stores[ViolationTypes.BAN].set(String(bannedUserId), {
      user_id: String(bannedUserId),
      expiresAt: Date.now() + 60000,
      type: ViolationTypes.CONCURRENT,
    });

    const response = await request(app).get('/admin/users').query({ limit: 10 });

    expect(response.status).toBe(200);
    const bannedUser = response.body.users.find((user) => user.id === String(bannedUserId));
    const activeUser = response.body.users.find((user) => user.id === String(activeUserId));

    expect(bannedUser).toEqual(
      expect.objectContaining({
        email: 'banned@example.com',
        username: 'banned-user',
        isBanned: true,
      }),
    );
    expect(activeUser).toEqual(
      expect.objectContaining({
        email: 'active@example.com',
        username: 'active-user',
        isBanned: false,
      }),
    );
  });

  test('POST /admin/users/:userId/ban and /unban update the ban store', async () => {
    const targetUserId = new mongoose.Types.ObjectId();

    await User.create({
      _id: targetUserId,
      email: 'target@example.com',
      username: 'target-user',
      provider: 'local',
      role: 'USER',
      emailVerified: true,
    });

    const banResponse = await request(app)
      .post(`/admin/users/${targetUserId}/ban`)
      .send({ durationMinutes: 30 });

    expect(banResponse.status).toBe(200);
    expect(banResponse.body).toEqual(
      expect.objectContaining({
        userId: String(targetUserId),
        durationMinutes: 30,
      }),
    );
    expect(await __stores[ViolationTypes.BAN].get(String(targetUserId))).toEqual(
      expect.objectContaining({
        user_id: String(targetUserId),
        byAdmin: true,
      }),
    );

    const unbanResponse = await request(app).post(`/admin/users/${targetUserId}/unban`);

    expect(unbanResponse.status).toBe(200);
    expect(unbanResponse.body).toEqual({
      message: 'User unbanned',
      userId: String(targetUserId),
    });
    expect(await __stores[ViolationTypes.BAN].get(String(targetUserId))).toBeUndefined();
  });

  test('GET /admin/analytics/users returns prompt, agent, conversation, preset, and upload counts', async () => {
    const analyticsUserId = new mongoose.Types.ObjectId();
    const promptId = new mongoose.Types.ObjectId();

    await User.create({
      _id: analyticsUserId,
      email: 'analytics@example.com',
      username: 'analytics-user',
      provider: 'local',
      role: 'USER',
      emailVerified: true,
    });

    await PromptGroup.create({
      _id: new mongoose.Types.ObjectId(),
      name: 'Analytics Group',
      numberOfGenerations: 1,
      oneliner: 'group',
      category: 'analysis',
      projectIds: [],
      productionId: promptId,
      author: analyticsUserId,
      authorName: 'analytics-user',
    });

    await Prompt.create({
      _id: promptId,
      groupId: new mongoose.Types.ObjectId(),
      author: analyticsUserId,
      prompt: 'Explain analytics',
      type: 'text',
    });

    await Agent.create({
      id: 'agent_analytics',
      name: 'Analytics Agent',
      provider: 'openai',
      model: 'gpt-4.1',
      author: analyticsUserId,
    });

    await Conversation.create([
      {
        conversationId: 'analytics-convo-1',
        title: 'Analytics Conversation 1',
        user: String(analyticsUserId),
        endpoint: 'openAI',
      },
      {
        conversationId: 'analytics-convo-2',
        title: 'Analytics Conversation 2',
        user: String(analyticsUserId),
        endpoint: 'openAI',
      },
    ]);

    await Preset.create({
      presetId: 'preset-analytics',
      title: 'Analytics Preset',
      user: String(analyticsUserId),
      endpoint: 'openAI',
    });

    await File.create({
      user: analyticsUserId,
      file_id: 'analytics-file',
      bytes: 128,
      filepath: '/uploads/analytics.txt',
      filename: 'analytics.txt',
      type: 'text/plain',
      context: 'message_attachment',
      retentionEligible: true,
    });

    const response = await request(app)
      .get('/admin/analytics/users')
      .query({ search: 'analytics-user', limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0]).toEqual(
      expect.objectContaining({
        id: String(analyticsUserId),
        prompts: 1,
        agents: 1,
        conversations: 2,
        ownPromptsLibrary: 1,
        ownPresetsLibrary: 1,
        uploadFiles: 1,
      }),
    );
  });

  test('GET and PATCH /admin/analytics/file-retention persist settings', async () => {
    const initialResponse = await request(app).get('/admin/analytics/file-retention');

    expect(initialResponse.status).toBe(200);
    expect(initialResponse.body.settings).toEqual(
      expect.objectContaining({
        enabled: false,
        retentionDays: 30,
      }),
    );

    const updateResponse = await request(app)
      .patch('/admin/analytics/file-retention')
      .send({ enabled: true, retentionDays: 45 });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toEqual(
      expect.objectContaining({
        updated: true,
        settings: expect.objectContaining({
          enabled: true,
          retentionDays: 45,
        }),
      }),
    );

    const persistedResponse = await request(app).get('/admin/analytics/file-retention');

    expect(persistedResponse.status).toBe(200);
    expect(persistedResponse.body.settings).toEqual(
      expect.objectContaining({
        enabled: true,
        retentionDays: 45,
      }),
    );
  });

  test('POST /admin/users/:userId/reset-password proxies the reset flow', async () => {
    const targetUserId = new mongoose.Types.ObjectId();

    await User.create({
      _id: targetUserId,
      email: 'reset@example.com',
      username: 'reset-user',
      provider: 'local',
      role: 'USER',
      emailVerified: true,
    });

    requestPasswordReset.mockResolvedValue({
      link: 'https://example.com/reset',
      message: 'Password reset requested',
    });

    const response = await request(app).post(`/admin/users/${targetUserId}/reset-password`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: 'Password reset requested',
      userId: String(targetUserId),
      link: 'https://example.com/reset',
    });
    expect(requestPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { email: 'reset@example.com' },
        ip: expect.any(String),
      }),
    );
  });

  test('DELETE /admin/users/:userId removes the target user', async () => {
    const targetUserId = new mongoose.Types.ObjectId();

    await User.create({
      _id: targetUserId,
      email: 'delete@example.com',
      username: 'delete-user',
      provider: 'local',
      role: 'USER',
      emailVerified: true,
    });

    const response = await request(app).delete(`/admin/users/${targetUserId}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: 'User deleted successfully',
      userId: String(targetUserId),
      email: 'delete@example.com',
    });
    expect(await User.findById(targetUserId).lean()).toBeNull();
  });

  test('GET /admin/analytics/deepl-jobs returns DeepL job analytics', async () => {
    await DeepLJobAnalytics.create({
      userId: 'user-123',
      userEmail: 'deepl@example.com',
      fileName: 'document.docx',
      sourceLanguage: 'EN',
      targetLanguage: 'FR',
      status: 'completed',
      documentId: 'doc-123',
      documentKey: 'key-123',
      sizeBytes: 2048,
      statusChecks: 2,
      downloadAttempts: 1,
    });

    const response = await request(app).get('/admin/analytics/deepl-jobs').query({ limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body.jobs).toHaveLength(1);
    expect(response.body.jobs[0]).toEqual(
      expect.objectContaining({
        userId: 'user-123',
        userEmail: 'deepl@example.com',
        file: 'document.docx',
        source: 'EN',
        target: 'FR',
        status: 'completed',
      }),
    );
  });

  test('POST /admin/analytics/file-retention/purge returns purge summary', async () => {
    purgeAllSidebarUploadsNow.mockResolvedValue({ attemptedDeletes: 3 });

    const response = await request(app).post('/admin/analytics/file-retention/purge');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      purged: true,
      attemptedDeletes: 3,
    });
  });
});
