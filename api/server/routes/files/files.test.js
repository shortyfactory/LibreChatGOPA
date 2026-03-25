const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { Readable } = require('stream');
const { v4: uuidv4 } = require('uuid');
const { createMethods } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  SystemRoles,
  FileSources,
  EModelEndpoint,
  AzureAssistantsOldEndpoint,
  ResourceType,
  AccessRoleIds,
  PrincipalType,
} = require('librechat-data-provider');
const { createAgent } = require('~/models/Agent');
const { createFile } = require('~/models');

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  getFoundryFileArrayBuffer: jest.fn(),
  getFoundryFileInfo: jest.fn(),
  isFoundryAgentsConfigured: jest.fn(),
  verifyAgentUploadPermission: jest.fn(),
}));

// Only mock the external dependencies that we don't want to test
jest.mock('~/server/services/Files/process', () => ({
  processDeleteRequest: jest.fn().mockResolvedValue({}),
  filterFile: jest.fn(),
  processFileUpload: jest.fn(),
  processAgentFileUpload: jest.fn(),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({
    getDownloadStream: jest.fn(),
  })),
}));

jest.mock('~/server/controllers/assistants/helpers', () => ({
  getOpenAIClient: jest.fn(),
}));

jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

jest.mock('~/server/services/Files/S3/crud', () => ({
  refreshS3FileUrls: jest.fn(),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
}));

jest.mock('~/cache/getLogStores', () =>
  jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
);

jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      unlink: jest.fn().mockResolvedValue(undefined),
    },
  };
});

jest.mock('~/config', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const {
  getFoundryFileArrayBuffer,
  getFoundryFileInfo,
  isFoundryAgentsConfigured,
  verifyAgentUploadPermission,
} = require('@librechat/api');
const fs = require('fs');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { processDeleteRequest, processFileUpload } = require('~/server/services/Files/process');

// Import the router after mocks
const router = require('./files');

describe('File Routes - Delete with Agent Access', () => {
  let app;
  let mongoServer;
  let authorId;
  let otherUserId;
  let fileId;
  let File;
  let Agent;
  let AclEntry;
  let User;
  let methods;
  let modelsToCleanup = [];
  let currentUserRole;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Initialize all models using createModels
    const { createModels } = require('@librechat/data-schemas');
    const models = createModels(mongoose);

    // Track which models we're adding
    modelsToCleanup = Object.keys(models);

    // Register models on mongoose.models so methods can access them
    Object.assign(mongoose.models, models);

    // Create methods with our test mongoose instance
    methods = createMethods(mongoose);

    // Now we can access models from the db/models
    File = models.File;
    Agent = models.Agent;
    AclEntry = models.AclEntry;
    User = models.User;

    // Seed default roles using our methods
    await methods.seedDefaultRoles();

    app = express();
    app.use(express.json());

    app.use((req, res, next) => {
      if (req.method === 'POST') {
        req.file = {
          originalname: 'test.txt',
          mimetype: 'text/plain',
          size: 100,
          path: '/tmp/test.txt',
          filename: 'test.txt',
        };
        req.file_id = uuidv4();
      }

      next();
    });

    app.use((req, res, next) => {
      req.user = {
        id: otherUserId?.toString() || 'default-user',
        role: currentUserRole || SystemRoles.USER,
      };
      req.app = { locals: {} };
      req.config = { fileStrategy: 'local' };
      next();
    });

    app.use('/files', router);
  });

  afterAll(async () => {
    // Clean up all collections before disconnecting
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }

    // Clear only the models we added
    for (const modelName of modelsToCleanup) {
      if (mongoose.models[modelName]) {
        delete mongoose.models[modelName];
      }
    }

    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    isFoundryAgentsConfigured.mockReturnValue(false);
    verifyAgentUploadPermission.mockResolvedValue(false);
    processFileUpload.mockImplementation(async ({ res }) =>
      res.status(200).json({
        message: 'File uploaded and processed successfully',
        file_id: 'test-file-id',
      }),
    );

    // Clear database - clean up all test data
    await File.deleteMany({});
    await Agent.deleteMany({});
    await User.deleteMany({});
    await AclEntry.deleteMany({});
    // Don't delete AccessRole as they are seeded defaults needed for tests

    // Create test data
    authorId = new mongoose.Types.ObjectId();
    otherUserId = new mongoose.Types.ObjectId();
    fileId = uuidv4();
    currentUserRole = SystemRoles.USER;

    // Create users in database
    await User.create({
      _id: authorId,
      username: 'author',
      email: 'author@test.com',
    });

    await User.create({
      _id: otherUserId,
      username: 'other',
      email: 'other@test.com',
    });

    // Create a file owned by the author
    await createFile({
      user: authorId,
      file_id: fileId,
      filename: 'test.txt',
      filepath: '/uploads/test.txt',
      bytes: 100,
      type: 'text/plain',
    });
  });

  const parseBinaryResponse = (res, callback) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  };

  describe('DELETE /files', () => {
    it('should allow deleting files owned by the user', async () => {
      // Create a file owned by the current user
      const userFileId = uuidv4();
      await createFile({
        user: otherUserId,
        file_id: userFileId,
        filename: 'user-file.txt',
        filepath: '/uploads/user-file.txt',
        bytes: 200,
        type: 'text/plain',
      });

      const response = await request(app)
        .delete('/files')
        .send({
          files: [
            {
              file_id: userFileId,
              filepath: '/uploads/user-file.txt',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Files deleted successfully');
      expect(processDeleteRequest).toHaveBeenCalled();
    });

    it('should prevent deleting files not owned by user without agent context', async () => {
      const response = await request(app)
        .delete('/files')
        .send({
          files: [
            {
              file_id: fileId,
              filepath: '/uploads/test.txt',
            },
          ],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('You can only delete files you have access to');
      expect(response.body.unauthorizedFiles).toContain(fileId);
      expect(processDeleteRequest).not.toHaveBeenCalled();
    });

    it('should prevent non-admin users from deleting assistant builder files', async () => {
      const response = await request(app)
        .delete('/files')
        .send({
          assistant_id: 'asst_test123',
          files: [
            {
              file_id: fileId,
              filepath: '/uploads/test.txt',
            },
          ],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Forbidden');
      expect(processDeleteRequest).not.toHaveBeenCalled();
    });

    it('should allow admins to delete assistant builder files', async () => {
      currentUserRole = SystemRoles.ADMIN;

      const response = await request(app)
        .delete('/files')
        .send({
          assistant_id: 'asst_test123',
          files: [
            {
              file_id: fileId,
              filepath: '/uploads/test.txt',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(processDeleteRequest).toHaveBeenCalled();
    });

    it('should prevent non-admin users from deleting agent builder files', async () => {
      verifyAgentUploadPermission.mockImplementation(async ({ res }) => {
        res.status(403).json({ error: 'Forbidden', message: 'Forbidden' });
        return true;
      });

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: 'agent_test123',
          tool_resource: 'context',
          files: [
            {
              file_id: fileId,
              filepath: '/uploads/test.txt',
            },
          ],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Forbidden');
      expect(processDeleteRequest).not.toHaveBeenCalled();
      expect(verifyAgentUploadPermission).toHaveBeenCalled();
    });

    it('should allow admins to delete agent builder files', async () => {
      currentUserRole = SystemRoles.ADMIN;

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: 'agent_test123',
          tool_resource: 'context',
          files: [
            {
              file_id: fileId,
              filepath: '/uploads/test.txt',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(processDeleteRequest).toHaveBeenCalled();
    });

    it('should allow non-admin users to delete file_search builder files they can edit', async () => {
      const agent = await createAgent({
        id: uuidv4(),
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: [fileId],
          },
        },
      });

      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: authorId,
      });

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: agent.id,
          tool_resource: 'file_search',
          files: [
            {
              file_id: fileId,
              filepath: '/uploads/test.txt',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Files deleted successfully');
      expect(processDeleteRequest).toHaveBeenCalled();
      expect(verifyAgentUploadPermission).toHaveBeenCalled();
    });

    it('should allow deleting files accessible through shared agent', async () => {
      // Create an agent with the file attached
      const agent = await createAgent({
        id: uuidv4(),
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: [fileId],
          },
        },
      });

      // Grant EDIT permission to user on the agent
      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: authorId,
      });

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: agent.id,
          files: [
            {
              file_id: fileId,
              filepath: '/uploads/test.txt',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Files deleted successfully');
      expect(processDeleteRequest).toHaveBeenCalled();
    });

    it('should prevent deleting files not attached to the specified agent', async () => {
      // Create another file not attached to the agent
      const unattachedFileId = uuidv4();
      await createFile({
        user: authorId,
        file_id: unattachedFileId,
        filename: 'unattached.txt',
        filepath: '/uploads/unattached.txt',
        bytes: 300,
        type: 'text/plain',
      });

      // Create an agent without the unattached file
      const agent = await createAgent({
        id: uuidv4(),
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: [fileId], // Only fileId, not unattachedFileId
          },
        },
      });

      // Grant EDIT permission to user on the agent
      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: authorId,
      });

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: agent.id,
          files: [
            {
              file_id: unattachedFileId,
              filepath: '/uploads/unattached.txt',
            },
          ],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('You can only delete files you have access to');
      expect(response.body.unauthorizedFiles).toContain(unattachedFileId);
      expect(processDeleteRequest).not.toHaveBeenCalled();
    });

    it('should handle mixed authorized and unauthorized files', async () => {
      // Create a file owned by the current user
      const userFileId = uuidv4();
      await createFile({
        user: otherUserId,
        file_id: userFileId,
        filename: 'user-file.txt',
        filepath: '/uploads/user-file.txt',
        bytes: 200,
        type: 'text/plain',
      });

      // Create an unauthorized file
      const unauthorizedFileId = uuidv4();
      await createFile({
        user: authorId,
        file_id: unauthorizedFileId,
        filename: 'unauthorized.txt',
        filepath: '/uploads/unauthorized.txt',
        bytes: 400,
        type: 'text/plain',
      });

      // Create an agent with only fileId attached
      const agent = await createAgent({
        id: uuidv4(),
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: [fileId],
          },
        },
      });

      // Grant EDIT permission to user on the agent
      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: authorId,
      });

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: agent.id,
          files: [
            { file_id: userFileId, filepath: '/uploads/user-file.txt' },
            { file_id: fileId, filepath: '/uploads/test.txt' },
            { file_id: unauthorizedFileId, filepath: '/uploads/unauthorized.txt' },
          ],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('You can only delete files you have access to');
      expect(response.body.unauthorizedFiles).toContain(unauthorizedFileId);
      expect(processDeleteRequest).not.toHaveBeenCalled();
    });

    it('should prevent deleting files when user lacks EDIT permission on agent', async () => {
      // Create an agent with the file attached
      const agent = await createAgent({
        id: uuidv4(),
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: [fileId],
          },
        },
      });

      // Grant only VIEW permission to user on the agent
      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: authorId,
      });

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: agent.id,
          files: [
            {
              file_id: fileId,
              filepath: '/uploads/test.txt',
            },
          ],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('You can only delete files you have access to');
      expect(response.body.unauthorizedFiles).toContain(fileId);
      expect(processDeleteRequest).not.toHaveBeenCalled();
    });
  });

  describe('POST /files', () => {
    it('should prevent non-admin users from uploading assistant builder files', async () => {
      const response = await request(app).post('/files').send({
        endpoint: EModelEndpoint.azureAssistants,
        assistant_id: 'asst_test123',
        tool_resource: 'code_interpreter',
        file_id: uuidv4(),
      });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Forbidden');
      expect(processFileUpload).not.toHaveBeenCalled();
      expect(fs.promises.unlink).toHaveBeenCalledWith('/tmp/test.txt');
    });

    it('should allow non-admin chat attachments for assistants', async () => {
      const response = await request(app).post('/files').send({
        endpoint: EModelEndpoint.azureAssistants,
        assistant_id: 'asst_test123',
        tool_resource: 'code_interpreter',
        message_file: true,
        file_id: uuidv4(),
      });

      expect(response.status).toBe(200);
      expect(processFileUpload).toHaveBeenCalled();
    });

    it('should allow admins to upload assistant builder files', async () => {
      currentUserRole = SystemRoles.ADMIN;

      const response = await request(app).post('/files').send({
        endpoint: EModelEndpoint.azureAssistants,
        assistant_id: 'asst_test123',
        tool_resource: 'code_interpreter',
        file_id: uuidv4(),
      });

      expect(response.status).toBe(200);
      expect(processFileUpload).toHaveBeenCalled();
    });
  });

  describe('GET /files/download/:userId/:file_id', () => {
    it('should download Foundry-backed Azure files when Foundry is configured', async () => {
      const foundryFileId = 'assistant-foundry-file-id';
      const fileBuffer = Buffer.from('excel-data');

      await createFile({
        user: otherUserId,
        file_id: foundryFileId,
        filename: 'tableau_3x4.xlsx',
        filepath: `/files/${otherUserId.toString()}/${foundryFileId}/tableau_3x4.xlsx`,
        bytes: fileBuffer.length,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        source: FileSources.azure,
        model: 'gpt-5',
      });

      isFoundryAgentsConfigured.mockReturnValue(true);
      getFoundryFileInfo.mockResolvedValue({
        filename: 'tableau_3x4.xlsx',
      });
      getFoundryFileArrayBuffer.mockResolvedValue(
        fileBuffer.buffer.slice(
          fileBuffer.byteOffset,
          fileBuffer.byteOffset + fileBuffer.byteLength,
        ),
      );

      const response = await request(app)
        .get(`/files/download/${otherUserId.toString()}/${foundryFileId}`)
        .buffer(true)
        .parse(parseBinaryResponse);

      expect(response.status).toBe(200);
      expect(response.headers['content-disposition']).toContain('tableau_3x4.xlsx');
      expect(response.headers['x-file-metadata']).toBeDefined();
      expect(response.body.equals(fileBuffer)).toBe(true);
      expect(getFoundryFileInfo).toHaveBeenCalledWith(foundryFileId);
      expect(getFoundryFileArrayBuffer).toHaveBeenCalledWith(foundryFileId);
    });

    it('should download Azure assistant files even when Foundry is enabled and the stored model is missing', async () => {
      const azureFileId = 'assistant-legacy-file-id';
      const fileBuffer = Buffer.from('legacy-excel-data');
      const getDownloadStream = jest.fn().mockResolvedValue({
        body: Readable.from(fileBuffer),
      });

      getStrategyFunctions.mockReturnValue({ getDownloadStream });
      getOpenAIClient.mockResolvedValue({
        openai: {
          files: {
            retrieve: jest.fn().mockResolvedValue({
              file_id: 'file-underlying-legacy-id',
              filename: 'tableau_3x3.xlsx',
            }),
          },
        },
      });
      isFoundryAgentsConfigured.mockReturnValue(true);
      getFoundryFileInfo.mockRejectedValue(new Error('Not found in Foundry'));

      await createFile({
        user: otherUserId,
        file_id: azureFileId,
        filename: 'tableau_3x3.xlsx',
        filepath: `/files/${otherUserId.toString()}/${azureFileId}/tableau_3x3.xlsx`,
        bytes: fileBuffer.length,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        source: FileSources.azure,
      });

      const response = await request(app)
        .get(`/files/download/${otherUserId.toString()}/${azureFileId}`)
        .buffer(true)
        .parse(parseBinaryResponse);

      expect(response.status).toBe(200);
      expect(response.headers['content-disposition']).toContain('tableau_3x3.xlsx');
      expect(response.body.equals(fileBuffer)).toBe(true);
      expect(getFoundryFileInfo).toHaveBeenCalledWith(azureFileId);
      expect(getOpenAIClient).toHaveBeenCalledWith(
        expect.objectContaining({
          overrideEndpoint: AzureAssistantsOldEndpoint,
        }),
      );
      expect(getDownloadStream).toHaveBeenCalledWith(
        'file-underlying-legacy-id',
        expect.any(Object),
      );
    });
  });
});
