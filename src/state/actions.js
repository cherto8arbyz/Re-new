/** @enum {string} */
export const ActionType = {
  NAVIGATE_DAY: 'NAVIGATE_DAY',
  SET_WEATHER: 'SET_WEATHER',
  SET_OUTFITS: 'SET_OUTFITS',
  SWIPE_OUTFIT: 'SWIPE_OUTFIT',
  SELECT_TAB: 'SELECT_TAB',
  SET_CITY: 'SET_CITY',
  SET_LOCATION: 'SET_LOCATION',
  SET_USER: 'SET_USER',
  SET_AUTH_SESSION: 'SET_AUTH_SESSION',
  COMPLETE_ONBOARDING: 'COMPLETE_ONBOARDING',
  SET_AVATAR_URL: 'SET_AVATAR_URL',
  ADD_WARDROBE_ITEM: 'ADD_WARDROBE_ITEM',
  REMOVE_WARDROBE_ITEM: 'REMOVE_WARDROBE_ITEM',
  SET_WARDROBE_ITEMS: 'SET_WARDROBE_ITEMS',
  UPDATE_WARDROBE_ITEM: 'UPDATE_WARDROBE_ITEM',
  ADD_CHAT_MESSAGE: 'ADD_CHAT_MESSAGE',
  SET_CHAT_LOADING: 'SET_CHAT_LOADING',
  SET_CHAT_ERROR: 'SET_CHAT_ERROR',
  CLEAR_CHAT: 'CLEAR_CHAT',
  SET_AI_LOADING: 'SET_AI_LOADING',
  SET_AI_ERROR: 'SET_AI_ERROR',
};

/**
 * @typedef {{ type: string, payload?: any }} Action
 */

/** @param {1 | -1} direction */
export function navigateDay(direction) {
  return { type: ActionType.NAVIGATE_DAY, payload: direction };
}

/** @param {import('../models/weather.js').Weather} weather */
export function setWeather(weather) {
  return { type: ActionType.SET_WEATHER, payload: weather };
}

/** @param {import('../models/outfit.js').Outfit[]} outfits */
export function setOutfits(outfits) {
  return { type: ActionType.SET_OUTFITS, payload: outfits };
}

/** @param {'left' | 'right'} direction */
export function swipeOutfit(direction) {
  return { type: ActionType.SWIPE_OUTFIT, payload: direction };
}

/** @param {'history' | 'wardrobe' | 'add' | 'chat' | 'profile'} tab */
export function selectTab(tab) {
  return { type: ActionType.SELECT_TAB, payload: tab };
}

/** @param {string} city */
export function setCity(city) {
  return { type: ActionType.SET_CITY, payload: city };
}

/** @param {{ latitude: number | null, longitude: number | null }} location */
export function setLocation(location) {
  return { type: ActionType.SET_LOCATION, payload: location };
}

/** @param {import('../models/user.js').User} user */
export function setUser(user) {
  return { type: ActionType.SET_USER, payload: user };
}

/** @param {{ user: { id: string, email: string, name: string, provider: string }, accessToken?: string, refreshToken?: string, isDevelopmentFallback?: boolean } | null} session */
export function setAuthSession(session) {
  return { type: ActionType.SET_AUTH_SESSION, payload: session };
}

export function completeOnboarding() {
  return { type: ActionType.COMPLETE_ONBOARDING };
}

/** @param {string} avatarUrl */
export function setAvatarUrl(avatarUrl) {
  return { type: ActionType.SET_AVATAR_URL, payload: avatarUrl };
}

/** @param {import('../models/garment.js').Garment} garment */
export function addWardrobeItem(garment) {
  return { type: ActionType.ADD_WARDROBE_ITEM, payload: garment };
}

/** @param {string} garmentId */
export function removeWardrobeItem(garmentId) {
  return { type: ActionType.REMOVE_WARDROBE_ITEM, payload: garmentId };
}

/** @param {import('../models/garment.js').Garment[]} items */
export function setWardrobeItems(items) {
  return { type: ActionType.SET_WARDROBE_ITEMS, payload: items };
}

/**
 * @param {string} garmentId
 * @param {Partial<import('../models/garment.js').Garment>} patch
 */
export function updateWardrobeItem(garmentId, patch) {
  return { type: ActionType.UPDATE_WARDROBE_ITEM, payload: { garmentId, patch } };
}

/** @param {import('../state/app-state.js').ChatMessage} message */
export function addChatMessage(message) {
  return { type: ActionType.ADD_CHAT_MESSAGE, payload: { ...message, timestamp: message.timestamp || Date.now() } };
}

/** @param {boolean} loading */
export function setChatLoading(loading) {
  return { type: ActionType.SET_CHAT_LOADING, payload: loading };
}

/** @param {string | null} error */
export function setChatError(error) {
  return { type: ActionType.SET_CHAT_ERROR, payload: error };
}

export function clearChat() {
  return { type: ActionType.CLEAR_CHAT };
}

/** @param {boolean} loading */
export function setAiLoading(loading) {
  return { type: ActionType.SET_AI_LOADING, payload: loading };
}

/** @param {string | null} error */
export function setAiError(error) {
  return { type: ActionType.SET_AI_ERROR, payload: error };
}
