/**
 * @typedef {{ role: 'user' | 'model', text: string, timestamp?: number }} ChatMessage
 */

/**
 * @typedef {Object} AppState
 * @property {string} selectedDate - ISO date string (YYYY-MM-DD)
 * @property {string} city
 * @property {import('../models/weather.js').Weather | null} weather
 * @property {import('../models/outfit.js').Outfit[]} outfitAlternatives
 * @property {number} activeOutfitIndex
 * @property {'history' | 'wardrobe' | 'add' | 'chat' | 'profile'} activeTab
 * @property {import('../models/user.js').User | null} user
 * @property {{ user: { id: string, email: string, name: string, provider: string }, accessToken?: string, refreshToken?: string, isDevelopmentFallback?: boolean } | null} authSession
 * @property {boolean} onboardingComplete
 * @property {{ latitude: number | null, longitude: number | null }} location
 * @property {import('../models/garment.js').Garment[]} wardrobeItems
 * @property {ChatMessage[]} chatMessages
 * @property {boolean} chatLoading
 * @property {string | null} chatError
 * @property {boolean} aiLoading
 * @property {string | null} aiError
 */

/**
 * @returns {AppState}
 */
export function createInitialState() {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  return {
    selectedDate: iso,
    city: '',
    weather: null,
    outfitAlternatives: [],
    activeOutfitIndex: 0,
    activeTab: 'add',
    user: null,
    authSession: null,
    onboardingComplete: false,
    location: {
      latitude: null,
      longitude: null,
    },
    wardrobeItems: [],
    chatMessages: [],
    chatLoading: false,
    chatError: null,
    aiLoading: false,
    aiError: null,
  };
}
