const {
  EModelEndpoint,
  AzureAssistantsNewEndpoint,
  AzureAssistantsOldEndpoint,
} = require('librechat-data-provider');

const mockHandleError = jest.fn();
jest.mock('@librechat/api', () => ({
  handleError: (...args) => mockHandleError(...args),
}));

const mockGetModelsConfig = jest.fn();
jest.mock('~/server/controllers/ModelController', () => ({
  getModelsConfig: (...args) => mockGetModelsConfig(...args),
}));

const mockLogViolation = jest.fn();
jest.mock('~/cache', () => ({
  logViolation: (...args) => mockLogViolation(...args),
}));

const validateModel = require('./validateModel');

describe('validateModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([AzureAssistantsNewEndpoint, AzureAssistantsOldEndpoint])(
    'should validate assistant alias endpoint %s against azureAssistants models',
    async (endpoint) => {
      mockGetModelsConfig.mockResolvedValue({
        [EModelEndpoint.azureAssistants]: ['gpt-4.1'],
      });

      const req = {
        body: {
          endpoint,
          endpointType: EModelEndpoint.azureAssistants,
          model: 'gpt-4.1',
        },
      };
      const res = {};
      const next = jest.fn();

      await validateModel(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockHandleError).not.toHaveBeenCalled();
    },
  );

  it('should return an error when the selected model is not available', async () => {
    mockGetModelsConfig.mockResolvedValue({
      [EModelEndpoint.azureAssistants]: ['gpt-4.1'],
    });

    const req = {
      body: {
        endpoint: AzureAssistantsOldEndpoint,
        endpointType: EModelEndpoint.azureAssistants,
        model: 'gpt-5',
      },
    };
    const res = {};
    const next = jest.fn();

    await validateModel(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockLogViolation).toHaveBeenCalledTimes(1);
    expect(mockHandleError).toHaveBeenCalledWith(res, { text: 'Illegal model request' });
  });
});
