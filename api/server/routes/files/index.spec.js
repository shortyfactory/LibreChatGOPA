const express = require('express');
const request = require('supertest');

const passThrough = (_req, _res, next) => next();
const mockedUaParser = jest.fn((req, res, next) => next());

jest.mock('~/server/middleware', () => ({
  createFileLimiters: () => ({
    fileUploadIpLimiter: passThrough,
    fileUploadUserLimiter: passThrough,
  }),
  configMiddleware: passThrough,
  requireJwtAuth: passThrough,
  uaParser: (req, res, next) => mockedUaParser(req, res, next),
  checkBan: passThrough,
}));

jest.mock('./multer', () => ({
  createMulterInstance: jest.fn(async () => ({
    single: () => passThrough,
  })),
}));

jest.mock('./files', () => {
  const express = require('express');

  const router = express.Router();

  router.get('/download/:userId/:file_id', (_req, res) => {
    res.status(200).json({ route: 'download' });
  });

  router.get('/code/download/:session_id/:fileId', (_req, res) => {
    res.status(200).json({ route: 'code-download' });
  });

  router.get('/config', (_req, res) => {
    res.status(200).json({ route: 'config' });
  });

  return router;
});

jest.mock('./images', () => {
  const express = require('express');
  return express.Router();
});

jest.mock('./avatar', () => {
  const express = require('express');
  return express.Router();
});

jest.mock('./speech', () => {
  const express = require('express');
  return express.Router();
});

jest.mock('~/server/routes/assistants/v1', () => {
  const express = require('express');
  return { avatar: express.Router() };
});

jest.mock('~/server/routes/agents/v1', () => {
  const express = require('express');
  return { avatar: express.Router() };
});

const { initialize, shouldSkipUAParser } = require('./index');

const createApp = async () => {
  const router = await initialize();
  const app = express();
  app.use('/files', router);
  return app;
};

describe('files route initialization', () => {
  beforeEach(() => {
    mockedUaParser.mockClear();
  });

  it('should identify standard file downloads as uaParser skip candidates', () => {
    expect(
      shouldSkipUAParser({
        method: 'GET',
        path: '/download/user-id/file-id',
      }),
    ).toBe(true);
  });

  it('should identify code downloads as uaParser skip candidates', () => {
    expect(
      shouldSkipUAParser({
        method: 'GET',
        path: '/code/download/session-id/file-id',
      }),
    ).toBe(true);
  });

  it('should keep uaParser enabled for non-download requests', () => {
    expect(
      shouldSkipUAParser({
        method: 'GET',
        path: '/config',
      }),
    ).toBe(false);
  });

  it('should bypass uaParser for file downloads', async () => {
    const app = await createApp();

    const response = await request(app).get('/files/download/user-id/file-id');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ route: 'download' });
    expect(mockedUaParser).not.toHaveBeenCalled();
  });

  it('should bypass uaParser for code downloads', async () => {
    const app = await createApp();

    const response = await request(app).get('/files/code/download/session-id/file-id');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ route: 'code-download' });
    expect(mockedUaParser).not.toHaveBeenCalled();
  });

  it('should keep uaParser enabled for other files routes', async () => {
    const app = await createApp();

    const response = await request(app).get('/files/config');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ route: 'config' });
    expect(mockedUaParser).toHaveBeenCalledTimes(1);
  });
});
