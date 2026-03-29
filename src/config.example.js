/**
 * Reference list of supported config keys.
 * Prefer .env with EXPO_PUBLIC_* variables for local and hosted builds.
 */
export const CONFIG = {
  GEMINI_API_KEY: 'your-gemini-api-key-here',
  DAILY_LOOK_PHOTO_ENABLED: 'true',
  LOOK_PARAMS_MODEL: 'gemini-2.5-flash',
  LOOK_PARAMS_API_KEY: 'your-look-params-model-key-or-empty-to-use-gemini-key',
  NANO_BANANA_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent',
  NANO_BANANA_API_KEY: 'your-gemini-api-key',
  NANO_BANANA_MODEL: 'gemini-3-pro-image-preview',
  DEFAULT_FACE_REFERENCE_URL: '',
  XWEATHER_CLIENT_ID: 'your-xweather-client-id',
  XWEATHER_CLIENT_SECRET: 'your-xweather-client-secret',
  OPENWEATHER_API_KEY: 'your-openweather-api-key',
  GCP_CALENDAR_KEY: 'your-google-calendar-key',
  GOOGLE_CALENDAR_ID: 'primary',
  USER_TIMEZONE: 'Europe/Minsk',
  GOOGLE_WEB_CLIENT_ID: 'your-google-web-client-id',
  // For production/web hosting set your public backend URL.
  // For local dev you can use http://127.0.0.1:8000
  IMAGE_PIPELINE_URL: '',
  AI_PROXY_URL: '',
  BG_REMOVAL_API_URL: 'https://api.remove.bg/v1.0/removebg',
  BG_REMOVAL_API_KEY: '',
  BG_REMOVAL_TIMEOUT_MS: '30000',
  LOOK_FACE_PROVIDER: 'image_pipeline',
  CV_GEMINI_MODEL: 'gemini-2.5-flash',

  // Backend provider: "supabase" | "firebase"
  BACKEND_PROVIDER: 'supabase',

  // Supabase placeholders
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_ANON_KEY: 'your-supabase-anon-key',
  SUPABASE_BUCKET_ORIGINALS: 'wardrobe-originals',
  SUPABASE_BUCKET_CUTOUTS: 'wardrobe-cutouts',

  // Firebase placeholders
  FIREBASE_PROJECT_ID: 'your-firebase-project-id',
  FIREBASE_API_KEY: 'your-firebase-api-key',
};
