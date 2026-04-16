import { generateLookFaceAssetAsync } from '../src/native/services/look-face';

jest.mock('../src/shared/backend-base-url.js', () => ({
  resolveBackendBaseUrl: jest.fn(() => 'http://api.example.com'),
}));

describe('look face asset service', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('prefers the persisted backend URL when the provider returns one', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        success: true,
        look_face_url: 'https://cdn.example.com/look-face.png',
        look_face_data_url: 'data:image/png;base64,legacy-fallback',
      }),
    }) as unknown as typeof fetch;

    const result = await generateLookFaceAssetAsync({
      uri: 'file:///avatar.jpg',
      fileName: 'avatar.jpg',
      mimeType: 'image/jpeg',
      width: 1080,
      height: 1440,
    });

    expect(result.success).toBe(true);
    expect(result.imageDataUrl).toBe('https://cdn.example.com/look-face.png');
  });
});
