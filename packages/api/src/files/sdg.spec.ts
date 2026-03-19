jest.mock('./documents/crud', () => ({
  parseDocument: jest.fn(),
}));

jest.mock('./text', () => ({
  parseTextNative: jest.fn(),
}));

import { parseDocument } from './documents/crud';
import { parseTextNative } from './text';
import { isSDGUploadMimeType, mapSDGInput, normalizeSDGUploadMimeType } from './sdg';

const mockedParseDocument = parseDocument as jest.MockedFunction<typeof parseDocument>;
const mockedParseTextNative = parseTextNative as jest.MockedFunction<typeof parseTextNative>;

describe('sdg', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SDG_API_KEY = 'test-sdg-key';
  });

  afterEach(() => {
    delete process.env.SDG_API_KEY;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('infers MIME types for generic uploads and validates SDG support', () => {
    const normalizedMimeType = normalizeSDGUploadMimeType({
      fileName: 'mapping.txt',
      mimeType: 'application/octet-stream',
    });

    expect(normalizedMimeType).toBe('text/plain');
    expect(isSDGUploadMimeType(normalizedMimeType)).toBe(true);
  });

  it('maps text input and normalizes nested SDG payloads', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: JSON.stringify({
            data: {
              children: [
                {
                  id: 'goal-1',
                  type: 'Concept',
                  name: 'SDG 1',
                  n_occurrences: 3,
                  relevance: '78%',
                  children: [
                    {
                      id: 'target-1-1',
                      type: 'Target',
                      name: 'Target 1.1',
                      n_occurrences: 2,
                    },
                  ],
                },
              ],
            },
          }),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    ) as jest.MockedFunction<typeof fetch>;

    global.fetch = fetchMock;

    const result = await mapSDGInput({
      inputText: ' Poverty reduction ',
      sourceLanguage: 'EN',
    });

    expect(result).toEqual({
      generatedAt: expect.any(String),
      message: null,
      sourceType: 'text',
      sourceLanguage: 'en',
      fileName: null,
      fileMimeType: null,
      textLength: 17,
      totalGoals: 1,
      totalTargets: 1,
      totalOccurrences: 3,
      goals: [
        {
          id: 'goal-1',
          type: 'Concept',
          name: 'SDG 1',
          occurrences: 3,
          relevance: '78%',
          children: [
            {
              id: 'target-1-1',
              type: 'Target',
              name: 'Target 1.1',
              occurrences: 2,
              relevance: null,
              children: [],
            },
          ],
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit?.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Api-Key': 'test-sdg-key',
      }),
    );
    expect(requestInit?.body).toBe(
      JSON.stringify({
        input_text: 'Poverty reduction',
        indicators: 'False',
        source_language: 'en',
      }),
    );
  });

  it('uses the server document parser for supported document uploads', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          children: [
            {
              id: 'goal-2',
              type: 'Concept',
              name: 'SDG 2',
              n_occurrences: 4,
              relevance: '61%',
              children: [],
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    ) as jest.MockedFunction<typeof fetch>;

    global.fetch = fetchMock;
    mockedParseDocument.mockResolvedValue({
      filename: 'policy.pdf',
      bytes: 22,
      filepath: 'document_parser',
      text: 'Policy document contents',
      images: [],
    });

    const result = await mapSDGInput({
      file: {
        originalname: 'policy.pdf',
        mimetype: 'application/pdf',
        path: '/tmp/policy.pdf',
        size: 1024,
      } as Express.Multer.File,
      sourceLanguage: 'fr',
    });

    expect(mockedParseDocument).toHaveBeenCalledWith({
      file: expect.objectContaining({
        originalname: 'policy.pdf',
        mimetype: 'application/pdf',
      }),
    });
    expect(mockedParseTextNative).not.toHaveBeenCalled();
    expect(result.sourceType).toBe('file');
    expect(result.fileName).toBe('policy.pdf');
    expect(result.fileMimeType).toBe('application/pdf');
    expect(result.goals).toHaveLength(1);
  });

  it('uses native text parsing for text uploads and handles empty 204 responses', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    ) as jest.MockedFunction<typeof fetch>;

    global.fetch = fetchMock;
    mockedParseTextNative.mockResolvedValue({
      text: 'Local text file contents',
      bytes: 24,
      source: 'text',
    });

    const result = await mapSDGInput({
      file: {
        originalname: 'mapping.txt',
        mimetype: 'application/octet-stream',
        path: '/tmp/mapping.txt',
        size: 24,
      } as Express.Multer.File,
    });

    expect(mockedParseTextNative).toHaveBeenCalledWith(
      expect.objectContaining({
        originalname: 'mapping.txt',
        mimetype: 'text/plain',
      }),
    );
    expect(result.goals).toEqual([]);
    expect(result.message).toBe('Successful request with no results');
    expect(result.sourceType).toBe('file');
  });

  it('rejects unsupported SDG source languages', async () => {
    await expect(
      mapSDGInput({
        inputText: 'Climate adaptation',
        sourceLanguage: 'xx',
      }),
    ).rejects.toMatchObject({
      message: 'Unsupported SDG source language "xx".',
      statusCode: 400,
      code: 'bad_request',
    });
  });
});
