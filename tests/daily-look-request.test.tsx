import { createDailyLookJobAsync } from '../src/native/services/daily-look';

jest.mock('../src/shared/backend-base-url.js', () => ({
  resolveBackendBaseUrl: jest.fn(() => 'http://api.example.com'),
}));

describe('daily look request pipeline', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('uploads local wardrobe images before creating the paid job', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(mockJsonResponse({ url: 'https://cdn.example.com/top-1.webp' }))
      .mockResolvedValueOnce(mockJsonResponse({
        job_id: 'job-1',
        status: 'processing',
        selected_garment_ids: ['top-1'],
      })) as unknown as typeof fetch;

    const result = await createDailyLookJobAsync({
      accessToken: 'test-token',
      availableGarments: [
        {
          garment_id: 'top-1',
          image_url: 'file:///top-1.jpg',
          category: 'shirt',
          color: 'black',
        },
      ],
      weatherContext: {
        temperature_celsius: 18,
        condition: 'clear',
      },
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('http://api.example.com/api/v1/upload');
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('http://api.example.com/api/v1/daily-look/generate');

    const requestBody = JSON.parse(String((global.fetch as jest.Mock).mock.calls[1][1]?.body || '{}'));
    expect(requestBody.available_garments).toHaveLength(1);
    expect(requestBody.available_garments[0].image_url).toBe('https://cdn.example.com/top-1.webp');
    expect(result.jobId).toBe('job-1');
  });
});

function mockJsonResponse(payload: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  };
}
