import { ActionType } from './actions.js';
import { addDays } from '../utils/date.js';

/**
 * Root reducer for the application state.
 * @param {import('./app-state.js').AppState} state
 * @param {import('./actions.js').Action} action
 * @returns {import('./app-state.js').AppState}
 */
export function rootReducer(state, action) {
  switch (action.type) {
    case ActionType.NAVIGATE_DAY:
      return handleNavigateDay(state, action.payload);
    case ActionType.SET_WEATHER:
      return { ...state, weather: action.payload };
    case ActionType.SET_OUTFITS:
      return { ...state, outfitAlternatives: action.payload, activeOutfitIndex: 0 };
    case ActionType.SWIPE_OUTFIT:
      return handleSwipeOutfit(state, action.payload);
    case ActionType.SELECT_TAB:
      return { ...state, activeTab: action.payload };
    case ActionType.SET_CITY:
      return { ...state, city: action.payload };
    case ActionType.SET_LOCATION:
      return { ...state, location: action.payload };
    case ActionType.SET_USER:
      return { ...state, user: action.payload };
    case ActionType.SET_AUTH_SESSION:
      return { ...state, authSession: action.payload };
    case ActionType.COMPLETE_ONBOARDING:
      return { ...state, onboardingComplete: true };
    case ActionType.SET_AVATAR_URL:
      return state.user
        ? { ...state, user: { ...state.user, avatarUrl: action.payload, profileAvatarUrl: action.payload } }
        : state;
    case ActionType.ADD_WARDROBE_ITEM:
      return { ...state, wardrobeItems: upsertWardrobeItems(state.wardrobeItems, [action.payload]) };
    case ActionType.REMOVE_WARDROBE_ITEM:
      return { ...state, wardrobeItems: state.wardrobeItems.filter(g => g.id !== action.payload) };
    case ActionType.SET_WARDROBE_ITEMS:
      return { ...state, wardrobeItems: upsertWardrobeItems([], action.payload) };
    case ActionType.UPDATE_WARDROBE_ITEM:
      return {
        ...state,
        wardrobeItems: state.wardrobeItems.map(item => (
          item.id === action.payload.garmentId
            ? { ...item, ...(action.payload.patch || {}) }
            : item
        )),
      };
    case ActionType.ADD_CHAT_MESSAGE:
      return { ...state, chatMessages: [...state.chatMessages, action.payload] };
    case ActionType.SET_CHAT_LOADING:
      return { ...state, chatLoading: action.payload };
    case ActionType.SET_CHAT_ERROR:
      return { ...state, chatError: action.payload };
    case ActionType.CLEAR_CHAT:
      return { ...state, chatMessages: [], chatError: null };
    case ActionType.SET_AI_LOADING:
      return { ...state, aiLoading: action.payload };
    case ActionType.SET_AI_ERROR:
      return { ...state, aiError: action.payload };
    default:
      return state;
  }
}

/**
 * @param {import('./app-state.js').AppState} state
 * @param {1 | -1} direction
 * @returns {import('./app-state.js').AppState}
 */
function handleNavigateDay(state, direction) {
  const newDate = addDays(state.selectedDate, direction);
  return {
    ...state,
    selectedDate: newDate,
    weather: null,
    outfitAlternatives: [],
    activeOutfitIndex: 0,
  };
}

/**
 * @param {import('./app-state.js').AppState} state
 * @param {'left' | 'right'} direction
 * @returns {import('./app-state.js').AppState}
 */
function handleSwipeOutfit(state, direction) {
  const delta = direction === 'left' ? 1 : -1;
  const maxIndex = Math.max(0, state.outfitAlternatives.length - 1);
  const newIndex = Math.max(0, Math.min(maxIndex, state.activeOutfitIndex + delta));
  return { ...state, activeOutfitIndex: newIndex };
}

/**
 * Inserts or replaces wardrobe items by id so repeated batch confirmation is idempotent.
 * @param {import('./app-state.js').AppState['wardrobeItems']} existing
 * @param {import('../models/garment.js').Garment[]} incoming
 * @returns {import('./app-state.js').AppState['wardrobeItems']}
 */
function upsertWardrobeItems(existing, incoming) {
  const next = [...existing];
  for (const item of incoming) {
    const index = next.findIndex(entry => entry.id === item.id);
    if (index >= 0) next[index] = item;
    else next.push(item);
  }
  return next;
}
