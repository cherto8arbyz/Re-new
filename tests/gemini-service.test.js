import { describe, it, expect } from './runner.js';

// Mock fetch for testing
let mockFetchResponse = {};
let mockFetchCalls = [];

globalThis.fetch = async (url, options) => {
  mockFetchCalls.push({ url, options });
  return {
    ok: mockFetchResponse.ok ?? true,
    status: mockFetchResponse.status ?? 200,
    json: async () => mockFetchResponse.json ?? {},
    text: async () => mockFetchResponse.text ?? '',
  };
};

// Import after fetch mock is set
const { GeminiService } = await import('../src/services/gemini-service.js');

function resetMocks() {
  mockFetchResponse = {};
  mockFetchCalls = [];
}

describe('GeminiService — initialization', () => {
  it('should create instance with API key', () => {
    const service = new GeminiService('test-api-key');
    expect(service).toBeTruthy();
  });

  it('should throw if no API key provided', () => {
    expect(() => new GeminiService('')).toThrow();
  });
});

describe('GeminiService — analyzeGarmentText', () => {
  it('should send garment description and return parsed JSON', async () => {
    resetMocks();
    const validResponse = {
      name: 'Beige Wide Pants',
      category: 'pants',
      color: '#C4A882',
      zIndex: 1,
      styleTags: ['smart casual', 'y2k'],
    };
    mockFetchResponse = {
      ok: true,
      json: {
        candidates: [{
          content: { parts: [{ text: JSON.stringify(validResponse) }] },
        }],
      },
    };

    const service = new GeminiService('test-key');
    const result = await service.analyzeGarmentText('Бежевые широкие брюки');

    expect(result.success).toBeTruthy();
    expect(result.data.name).toBe('Beige Wide Pants');
    expect(result.data.category).toBe('pants');
    expect(result.data.color).toBe('#C4A882');
    expect(result.data.zIndex).toBe(1);
  });

  it('should handle malformed JSON from Gemini gracefully', async () => {
    resetMocks();
    mockFetchResponse = {
      ok: true,
      json: {
        candidates: [{
          content: { parts: [{ text: 'not valid json at all' }] },
        }],
      },
    };

    const service = new GeminiService('test-key');
    const result = await service.analyzeGarmentText('Some garment');

    expect(result.success).toBeFalsy();
    expect(result.error).toBeTruthy();
  });

  it('should handle API error response', async () => {
    resetMocks();
    mockFetchResponse = { ok: false, status: 500, text: 'Internal Server Error' };

    const service = new GeminiService('test-key');
    const result = await service.analyzeGarmentText('Some garment');

    expect(result.success).toBeFalsy();
    expect(result.error).toBeTruthy();
  });

  it('should validate returned category is valid', async () => {
    resetMocks();
    mockFetchResponse = {
      ok: true,
      json: {
        candidates: [{
          content: { parts: [{ text: JSON.stringify({
            name: 'Hat', category: 'INVALID_CATEGORY', color: '#000', zIndex: 0, styleTags: [],
          }) }] },
        }],
      },
    };

    const service = new GeminiService('test-key');
    const result = await service.analyzeGarmentText('A hat');

    expect(result.success).toBeFalsy();
    expect(result.error).toBeTruthy();
  });
});

describe('GeminiService — generateOutfit', () => {
  it('should send wardrobe and weather, return garment IDs', async () => {
    resetMocks();
    const aiResponse = {
      selectedIds: ['shirt-white', 'pants-chino', 'shoes-sneakers'],
      styleName: 'Smart Casual',
    };
    mockFetchResponse = {
      ok: true,
      json: {
        candidates: [{
          content: { parts: [{ text: JSON.stringify(aiResponse) }] },
        }],
      },
    };

    const wardrobe = [
      { id: 'shirt-white', name: 'White Shirt', category: 'shirt' },
      { id: 'pants-chino', name: 'Chino Pants', category: 'pants' },
      { id: 'shoes-sneakers', name: 'White Sneakers', category: 'shoes' },
    ];

    const service = new GeminiService('test-key');
    const result = await service.generateOutfit('0°C, Sunny', wardrobe);

    expect(result.success).toBeTruthy();
    expect(result.data.selectedIds).toHaveLength(3);
    expect(result.data.styleName).toBe('Smart Casual');
  });

  it('should handle empty wardrobe', async () => {
    resetMocks();
    const service = new GeminiService('test-key');
    const result = await service.generateOutfit('20°C, Sunny', []);

    expect(result.success).toBeFalsy();
    expect(result.error).toBeTruthy();
  });

  it('should handle API failure during outfit generation', async () => {
    resetMocks();
    mockFetchResponse = { ok: false, status: 429, text: 'Rate limited' };

    const service = new GeminiService('test-key');
    const result = await service.generateOutfit('10°C, Cloudy', [{ id: 'x' }]);

    expect(result.success).toBeFalsy();
  });
});

describe('GeminiService — chat', () => {
  it('should send message with wardrobe context and return response', async () => {
    resetMocks();
    mockFetchResponse = {
      ok: true,
      json: {
        candidates: [{
          content: { parts: [{ text: 'Try your trench coat with the chino pants!' }] },
        }],
      },
    };

    const wardrobe = [{ id: 'coat-trench', name: 'Trench Coat', category: 'outerwear' }];
    const service = new GeminiService('test-key');
    const result = await service.chat('What should I wear today?', wardrobe, []);

    expect(result.success).toBeTruthy();
    expect(result.data.message).toBeTruthy();
  });

  it('should include chat history in request', async () => {
    resetMocks();
    mockFetchResponse = {
      ok: true,
      json: {
        candidates: [{
          content: { parts: [{ text: 'Great choice!' }] },
        }],
      },
    };

    const history = [
      { role: 'user', text: 'I like casual style' },
      { role: 'model', text: 'Noted! I will recommend casual outfits.' },
    ];
    const service = new GeminiService('test-key');
    const result = await service.chat('Thanks!', [], history);

    expect(result.success).toBeTruthy();
    // 2 history entries + 1 current message = 3 contents
    const lastCall = mockFetchCalls[mockFetchCalls.length - 1];
    const body = JSON.parse(lastCall.options.body);
    expect(body.contents.length).toBeGreaterThan(2);
  });

  it('should handle API error in chat', async () => {
    resetMocks();
    mockFetchResponse = { ok: false, status: 503, text: 'Service Unavailable' };

    const service = new GeminiService('test-key');
    const result = await service.chat('Hello', [], []);

    expect(result.success).toBeFalsy();
  });
});

describe('GeminiService — extractJSON', () => {
  it('should extract JSON from markdown code blocks', async () => {
    resetMocks();
    const jsonData = { name: 'Test', category: 'shirt', color: '#FFF', zIndex: 1, styleTags: [] };
    mockFetchResponse = {
      ok: true,
      json: {
        candidates: [{
          content: { parts: [{ text: '```json\n' + JSON.stringify(jsonData) + '\n```' }] },
        }],
      },
    };

    const service = new GeminiService('test-key');
    const result = await service.analyzeGarmentText('White shirt');

    expect(result.success).toBeTruthy();
    expect(result.data.name).toBe('Test');
  });
});
