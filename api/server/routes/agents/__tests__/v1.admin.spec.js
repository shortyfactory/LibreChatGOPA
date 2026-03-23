const express = require('express');
const request = require('supertest');
const { SystemRoles } = require('librechat-data-provider');

const mockCreateAgent = jest.fn((_req, res) => res.status(201).json({ ok: true }));
const mockGetAgent = jest.fn((_req, res) => res.status(200).json({ id: 'agent_123' }));
const mockGetAgentCategories = jest.fn((_req, res) => res.status(200).json([]));
const mockGetListAgents = jest.fn((_req, res) => res.status(200).json({ data: [] }));

jest.mock('@librechat/api', () => {
  const actual = jest.requireActual('@librechat/api');
  const { SystemRoles } = jest.requireActual('librechat-data-provider');

  return {
    ...actual,
    generateCheckAccess: () => (_req, _res, next) => next(),
    requireAdmin: (req, res, next) => {
      if (req.user?.role === SystemRoles.ADMIN) {
        return next();
      }

      return res.status(403).json({
        error: 'Access denied: Admin privileges required',
        error_code: 'ADMIN_REQUIRED',
      });
    },
  };
});

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (_req, _res, next) => next(),
  configMiddleware: (_req, _res, next) => next(),
  canAccessAgentResource: () => (_req, _res, next) => next(),
}));

jest.mock('~/server/controllers/agents/v1', () => ({
  createAgent: (...args) => mockCreateAgent(...args),
  getAgent: (...args) => mockGetAgent(...args),
  updateAgent: jest.fn((_req, res) => res.status(200).json({ updated: true })),
  duplicateAgent: jest.fn((_req, res) => res.status(201).json({ duplicated: true })),
  deleteAgent: jest.fn((_req, res) => res.status(200).json({ deleted: true })),
  revertAgentVersion: jest.fn((_req, res) => res.status(200).json({ reverted: true })),
  getAgentCategories: (...args) => mockGetAgentCategories(...args),
  getListAgents: (...args) => mockGetListAgents(...args),
  uploadAgentAvatar: jest.fn((_req, res) => res.status(201).json({ avatar: true })),
}));

jest.mock('~/models/Role', () => ({
  getRoleByName: jest.fn(),
}));

jest.mock('../actions', () => {
  const express = require('express');
  const router = express.Router();

  router.get('/', (_req, res) => res.status(200).json({ ok: 'actions' }));

  return router;
});

jest.mock('../tools', () => {
  const express = require('express');
  const router = express.Router();

  router.get('/', (_req, res) => res.status(200).json({ ok: 'tools' }));

  return router;
});

const { v1 } = require('../v1');

describe('agents v1 builder route access', () => {
  let app;
  let currentRole = SystemRoles.USER;

  beforeEach(() => {
    jest.clearAllMocks();
    currentRole = SystemRoles.USER;

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = {
        id: 'user-123',
        email: 'user@test.com',
        role: currentRole,
      };
      next();
    });
    app.use('/agents', v1);
  });

  it('allows non-admin users to create agents', async () => {
    const response = await request(app).post('/agents').send({
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4',
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ ok: true });
    expect(mockCreateAgent).toHaveBeenCalledTimes(1);
  });

  it('allows admins to create agents', async () => {
    currentRole = SystemRoles.ADMIN;

    const response = await request(app).post('/agents').send({
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4',
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ ok: true });
    expect(mockCreateAgent).toHaveBeenCalledTimes(1);
  });

  it('blocks non-admin users from expanded agent settings', async () => {
    const response = await request(app).get('/agents/agent_123/expanded');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Access denied: Admin privileges required',
      error_code: 'ADMIN_REQUIRED',
    });
    expect(mockGetAgent).not.toHaveBeenCalled();
  });

  it('allows admins to access expanded agent settings', async () => {
    currentRole = SystemRoles.ADMIN;

    const response = await request(app).get('/agents/agent_123/expanded');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 'agent_123' });
    expect(mockGetAgent).toHaveBeenCalledTimes(1);
  });

  it('blocks non-admin users from agent actions builder routes', async () => {
    const response = await request(app).get('/agents/actions');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Access denied: Admin privileges required',
      error_code: 'ADMIN_REQUIRED',
    });
  });

  it('allows admins to access agent actions builder routes', async () => {
    currentRole = SystemRoles.ADMIN;

    const response = await request(app).get('/agents/actions');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: 'actions' });
  });

  it('allows non-admin users to update basic agent data', async () => {
    const response = await request(app).patch('/agents/agent_123').send({
      name: 'Updated Agent',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ updated: true });
  });
});
