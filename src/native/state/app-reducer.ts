import { buildStylistReply, createChatMessage } from '../../shared/chat';
import { buildManualOutfit, generateOutfitRecommendations } from '../../shared/outfits';
import { buildUserProfile, ensureAuthSessionAccessToken, normalizeAvatarGender } from '../../shared/onboarding';
import { normalizeAccentPaletteKey, normalizeCustomAccentHex, normalizeProfileBio } from '../../shared/profile';
import { buildWardrobeItem, createId, DEFAULT_WARDROBE_FILTER, getLayer, normalizeWardrobeSelection } from '../../shared/wardrobe';
import type {
  AppState,
  AppTab,
  AuthSession,
  ChatMessage,
  Outfit,
  SavedLookEntry,
  StylePreference,
  AccentPaletteKey,
  ThemeMode,
  UserProfile,
  WardrobeFilterState,
  WardrobeItem,
} from '../../types/models';

export type AppAction =
  | { type: 'HYDRATE'; payload: Partial<AppState> }
  | { type: 'SET_THEME_MODE'; payload: ThemeMode }
  | { type: 'SET_ACCENT_PALETTE'; payload: AccentPaletteKey }
  | { type: 'SET_CUSTOM_ACCENT_COLOR'; payload: string }
  | { type: 'SET_ACTIVE_TAB'; payload: AppTab }
  | { type: 'SET_ACTIVE_OUTFIT_INDEX'; payload: number }
  | { type: 'SET_SELECTED_DATE'; payload: string }
  | { type: 'SET_CITY'; payload: string }
  | { type: 'SET_LOCATION'; payload: AppState['location'] }
  | { type: 'SET_WARDROBE_FILTER'; payload: Partial<WardrobeFilterState> }
  | { type: 'RESET_WARDROBE_FILTER' }
  | { type: 'COMPLETE_ONBOARDING'; payload: { session: AuthSession; profile: UserProfile } }
  | { type: 'SET_PROFILE_AVATAR'; payload: string }
  | { type: 'SET_PROFILE_AVATAR_ASSETS'; payload: { avatarUrl: string; lookFaceAssetUrl?: string | null } }
  | { type: 'SET_PROFILE_AVATAR_GENDER'; payload: UserProfile['avatarGender'] }
  | { type: 'SET_IDENTITY_REFERENCE_URLS'; payload: string[] }
  | { type: 'SET_PROFILE_BIO'; payload: string }
  | { type: 'ADD_WARDROBE_ITEM'; payload: WardrobeItem }
  | { type: 'ADD_WARDROBE_ITEMS'; payload: WardrobeItem[] }
  | { type: 'REMOVE_WARDROBE_ITEM'; payload: string }
  | { type: 'UPDATE_GARMENT_POSITION'; payload: { itemId: string; position: WardrobeItem['position'] } }
  | { type: 'UPDATE_GARMENT_ADJUSTMENT'; payload: { itemId: string; patch: Partial<Pick<WardrobeItem, 'positionOffsetX' | 'positionOffsetY' | 'scale' | 'rotation'>> } }
  | { type: 'TOGGLE_MANUAL_SELECTION'; payload: string }
  | { type: 'SET_MANUAL_SELECTION_IDS'; payload: string[] }
  | { type: 'CLEAR_MANUAL_SELECTION' }
  | { type: 'SET_GENERATED_LOOKS'; payload: Outfit[] }
  | { type: 'GENERATE_LOOKS' }
  | { type: 'SAVE_CURRENT_LOOK' }
  | { type: 'SAVE_OUTFIT'; payload: { outfit: Outfit; source?: SavedLookEntry['source'] } }
  | { type: 'LOAD_OUTFIT_IN_BUILDER'; payload: Outfit }
  | { type: 'ADD_CHAT_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_CHAT_LOADING'; payload: boolean }
  | { type: 'SET_CHAT_ERROR'; payload: string | null }
  | { type: 'SET_AI_LOADING'; payload: boolean }
  | { type: 'SET_AI_ERROR'; payload: string | null }
  | { type: 'SEND_CHAT'; payload: string };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'HYDRATE': {
      const wardrobeItems = normalizeWardrobeItems(action.payload.wardrobeItems);
      const wardrobeById = new Map(wardrobeItems.map(item => [item.id, item]));
      const normalizedUser = normalizeUserProfile(action.payload.user);
      const normalizedAuthSession = ensureAuthSessionAccessToken(
        action.payload.authSession || state.authSession,
        normalizedUser?.id || state.user?.id,
      );
      return {
        ...state,
        ...action.payload,
        selectedDate: action.payload.selectedDate || state.selectedDate,
        themeMode: normalizeThemeMode(action.payload.themeMode),
        accentPalette: normalizeAccentPalette(action.payload.accentPalette),
        customAccentColor: normalizeCustomAccentColor(action.payload.customAccentColor),
        activeTab: normalizeAppTab(action.payload.activeTab),
        authSession: normalizedAuthSession,
        user: normalizedUser,
        wardrobeItems,
        wardrobeFilter: {
          ...DEFAULT_WARDROBE_FILTER,
          ...(action.payload.wardrobeFilter || {}),
        },
        generatedLooks: normalizeOutfits(action.payload.generatedLooks, wardrobeById),
        savedLooks: normalizeSavedLooks(action.payload.savedLooks, wardrobeById),
        manualSelectionIds: (action.payload.manualSelectionIds || []).filter(id => wardrobeById.has(id)),
      };
    }
    case 'SET_THEME_MODE':
      return { ...state, themeMode: normalizeThemeMode(action.payload) };
    case 'SET_ACCENT_PALETTE':
      return { ...state, accentPalette: normalizeAccentPalette(action.payload) };
    case 'SET_CUSTOM_ACCENT_COLOR': {
      const nextColor = normalizeCustomAccentColor(action.payload);
      if (!nextColor) return state;
      return {
        ...state,
        accentPalette: 'custom',
        customAccentColor: nextColor,
      };
    }
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: normalizeAppTab(action.payload) };
    case 'SET_ACTIVE_OUTFIT_INDEX':
      return { ...state, activeOutfitIndex: action.payload };
    case 'SET_SELECTED_DATE':
      return { ...state, selectedDate: action.payload };
    case 'SET_CITY':
      return { ...state, city: action.payload };
    case 'SET_LOCATION':
      return { ...state, location: action.payload };
    case 'SET_WARDROBE_FILTER':
      return {
        ...state,
        wardrobeFilter: {
          ...state.wardrobeFilter,
          ...action.payload,
        },
      };
    case 'RESET_WARDROBE_FILTER':
      return { ...state, wardrobeFilter: DEFAULT_WARDROBE_FILTER };
    case 'COMPLETE_ONBOARDING':
      return {
        ...state,
        authSession: ensureAuthSessionAccessToken(action.payload.session, action.payload.profile.id),
        user: action.payload.profile,
        activeTab: 'home',
      };
    case 'SET_PROFILE_AVATAR':
      return state.user
        ? {
            ...state,
            user: {
              ...state.user,
              avatarUrl: action.payload,
              profileAvatarUrl: action.payload,
            },
          }
        : state;
    case 'SET_PROFILE_AVATAR_ASSETS': {
      if (!state.user) return state;

      const avatarUrl = String(action.payload.avatarUrl || '').trim();
      const lookFaceAssetUrl = String(action.payload.lookFaceAssetUrl || '').trim();
      const nextLookFaceAssetUrl = lookFaceAssetUrl || String(state.user.lookFaceAssetUrl || '').trim();

      return {
        ...state,
        user: {
          ...state.user,
          avatarUrl,
          profileAvatarUrl: avatarUrl,
          lookFaceAssetUrl: nextLookFaceAssetUrl,
          faceReferenceUrl: nextLookFaceAssetUrl || String(state.user.faceReferenceUrl || '').trim(),
        },
      };
    }
    case 'SET_PROFILE_AVATAR_GENDER':
      return state.user
        ? {
            ...state,
            user: {
              ...state.user,
              avatarGender: normalizeAvatarGender(action.payload),
            },
          }
        : state;
    case 'SET_IDENTITY_REFERENCE_URLS':
      return state.user
        ? {
            ...state,
            user: {
              ...state.user,
              identityReferenceUrls: action.payload,
              faceReferenceUrl: action.payload[0] || state.user.faceReferenceUrl,
            },
          }
        : state;
    case 'SET_PROFILE_BIO':
      return state.user
        ? {
            ...state,
            user: {
              ...state.user,
              bio: normalizeProfileBio(action.payload),
            },
          }
        : state;
    case 'ADD_WARDROBE_ITEM':
      return {
        ...state,
        wardrobeItems: upsertWardrobeItems(state.wardrobeItems, [action.payload]),
      };
    case 'ADD_WARDROBE_ITEMS':
      return {
        ...state,
        wardrobeItems: upsertWardrobeItems(state.wardrobeItems, action.payload),
      };
    case 'REMOVE_WARDROBE_ITEM':
      return {
        ...state,
        wardrobeItems: state.wardrobeItems.filter(item => item.id !== action.payload),
        manualSelectionIds: state.manualSelectionIds.filter(id => id !== action.payload),
        generatedLooks: state.generatedLooks
          .map(outfit => ({
            ...outfit,
            garments: outfit.garments.filter(item => item.id !== action.payload),
            itemRefs: outfit.itemRefs.filter(ref => ref.itemId !== action.payload),
          }))
          .filter(outfit => outfit.garments.length > 0),
        savedLooks: state.savedLooks
          .map(entry => ({
            ...entry,
            outfit: {
              ...entry.outfit,
              garments: entry.outfit.garments.filter(item => item.id !== action.payload),
              itemRefs: entry.outfit.itemRefs.filter(ref => ref.itemId !== action.payload),
            },
          }))
          .filter(entry => entry.outfit.garments.length > 0),
      };
    case 'UPDATE_GARMENT_POSITION':
      return updateGarmentPosition(state, action.payload.itemId, action.payload.position);
    case 'UPDATE_GARMENT_ADJUSTMENT':
      return updateGarmentAdjustment(state, action.payload.itemId, action.payload.patch);
    case 'TOGGLE_MANUAL_SELECTION':
      return toggleManualSelection(state, action.payload);
    case 'SET_MANUAL_SELECTION_IDS':
      return {
        ...state,
        manualSelectionIds: Array.isArray(action.payload)
          ? normalizeWardrobeSelection(
              state.wardrobeItems,
              action.payload.filter(id => state.wardrobeItems.some(item => item.id === id)),
            )
          : [],
      };
    case 'CLEAR_MANUAL_SELECTION':
      return { ...state, manualSelectionIds: [] };
    case 'SET_GENERATED_LOOKS':
      return {
        ...state,
        generatedLooks: action.payload,
        activeOutfitIndex: 0,
        aiError: action.payload.length ? null : state.aiError,
      };
    case 'GENERATE_LOOKS':
      return generateLooks(state);
    case 'SAVE_CURRENT_LOOK':
      return saveCurrentLook(state);
    case 'SAVE_OUTFIT':
      return saveOutfit(state, action.payload.outfit, action.payload.source);
    case 'LOAD_OUTFIT_IN_BUILDER':
      return {
        ...state,
        activeTab: 'looks',
        activeOutfitIndex: 0,
        generatedLooks: [action.payload],
        manualSelectionIds: [],
      };
    case 'ADD_CHAT_MESSAGE':
      return { ...state, chatMessages: [...state.chatMessages, action.payload] };
    case 'SET_CHAT_LOADING':
      return { ...state, chatLoading: action.payload };
    case 'SET_CHAT_ERROR':
      return { ...state, chatError: action.payload };
    case 'SET_AI_LOADING':
      return { ...state, aiLoading: action.payload };
    case 'SET_AI_ERROR':
      return { ...state, aiError: action.payload };
    case 'SEND_CHAT':
      return sendChat(state, action.payload);
    default:
      return state;
  }
}

export function buildOnboardingAction(input: {
  session: AuthSession;
  name: string;
  style: StylePreference;
  avatarUrl: string;
  avatarGender?: UserProfile['avatarGender'];
  lookFaceAssetUrl?: string;
}): AppAction {
  return {
    type: 'COMPLETE_ONBOARDING',
    payload: {
      session: input.session,
      profile: buildUserProfile(input.session, {
        name: input.name,
        style: input.style,
        avatarUrl: input.avatarUrl,
        avatarGender: input.avatarGender,
        lookFaceAssetUrl: input.lookFaceAssetUrl,
      }),
    },
  };
}

export function buildWardrobeAddAction(input: {
  name: string;
  category: WardrobeItem['category'];
  color?: string;
  imageUrl?: string;
}): AppAction {
  return {
    type: 'ADD_WARDROBE_ITEM',
    payload: buildWardrobeItem({
      name: input.name,
      category: input.category,
      color: input.color,
      colors: input.color ? [input.color] : [],
      imageUrl: input.imageUrl,
      thumbnailUrl: input.imageUrl,
      sourceType: input.imageUrl ? 'single_item' : 'manual',
    }),
  };
}

export function buildWardrobeAddBatchAction(inputs: {
  name: string;
  category: WardrobeItem['category'];
  color?: string;
  imageUrl?: string;
}[]): AppAction {
  return {
    type: 'ADD_WARDROBE_ITEMS',
    payload: inputs.map(input => buildWardrobeItem({
      name: input.name,
      category: input.category,
      color: input.color,
      colors: input.color ? [input.color] : [],
      imageUrl: input.imageUrl,
      thumbnailUrl: input.imageUrl,
      sourceType: input.imageUrl ? 'single_item' : 'manual',
    })),
  };
}

function toggleManualSelection(state: AppState, itemId: string): AppState {
  const item = state.wardrobeItems.find(entry => entry.id === itemId);
  if (!item) return state;

  const selection = new Set(state.manualSelectionIds);
  if (selection.has(itemId)) {
    selection.delete(itemId);
  } else {
    selection.add(itemId);
  }

  return {
    ...state,
    manualSelectionIds: normalizeWardrobeSelection(state.wardrobeItems, Array.from(selection)),
  };
}

function generateLooks(state: AppState): AppState {
  const result = generateOutfitRecommendations({
    wardrobe: state.wardrobeItems,
    weather: state.weather,
    userStyle: state.user?.style || '',
    selectedDate: state.selectedDate,
  });

  return {
    ...state,
    generatedLooks: result.outfits,
    activeOutfitIndex: 0,
    aiError: result.success ? null : (result.warnings?.[0] || result.reason || 'Look generation failed.'),
    aiLoading: false,
  };
}

function saveCurrentLook(state: AppState): AppState {
  const outfit = state.generatedLooks[state.activeOutfitIndex] || buildManualOutfit(state.wardrobeItems, state.manualSelectionIds);
  if (!outfit) return state;

  const source = state.generatedLooks[state.activeOutfitIndex]
    ? inferSavedLookSource(outfit, false)
    : 'manual';
  return saveOutfit(state, outfit, source);
}

function sendChat(state: AppState, message: string): AppState {
  const userMessage = createChatMessage('user', message);
  const draftState = {
    ...state,
    chatMessages: [...state.chatMessages, userMessage],
  };
  const reply = createChatMessage('model', buildStylistReply(message, draftState));

  return {
    ...draftState,
    chatMessages: [...draftState.chatMessages, reply],
    chatError: null,
  };
}

function saveOutfit(state: AppState, outfit: Outfit, explicitSource?: SavedLookEntry['source']): AppState {
  const entry: SavedLookEntry = {
    id: createId('saved-look'),
    createdAt: new Date().toISOString(),
    date: state.selectedDate,
    source: explicitSource || inferSavedLookSource(outfit, false),
    outfit,
  };

  return {
    ...state,
    savedLooks: [entry, ...state.savedLooks],
  };
}

function inferSavedLookSource(outfit: Outfit, fallbackManual: boolean): SavedLookEntry['source'] {
  if (fallbackManual) return 'manual';
  const metadata = outfit.renderMetadata || {};
  const recommendation = typeof metadata.recommendation === 'object' && metadata.recommendation
    ? metadata.recommendation as Record<string, unknown>
    : null;
  const generationSource = String(
    metadata.generationSource ||
    recommendation?.source ||
    '',
  ).toLowerCase();

  if (generationSource.includes('manual')) return 'manual';
  if (generationSource.includes('ai') || generationSource.includes('gemini')) return 'ai';
  return 'fallback';
}

function updateGarmentPosition(
  state: AppState,
  itemId: string,
  position: WardrobeItem['position'],
): AppState {
  return {
    ...state,
    wardrobeItems: state.wardrobeItems.map(item => (
      item.id === itemId ? { ...item, position } : item
    )),
    generatedLooks: state.generatedLooks.map(outfit => ({
      ...outfit,
      garments: outfit.garments.map(item => (
        item.id === itemId ? { ...item, position } : item
      )),
    })),
    savedLooks: state.savedLooks.map(entry => ({
      ...entry,
      outfit: {
        ...entry.outfit,
        garments: entry.outfit.garments.map(item => (
          item.id === itemId ? { ...item, position } : item
        )),
      },
    })),
  };
}

function updateGarmentAdjustment(
  state: AppState,
  itemId: string,
  patch: Partial<Pick<WardrobeItem, 'positionOffsetX' | 'positionOffsetY' | 'scale' | 'rotation'>>,
): AppState {
  const applyPatch = (item: WardrobeItem): WardrobeItem => (
    item.id === itemId ? { ...item, ...patch } : item
  );

  return {
    ...state,
    wardrobeItems: state.wardrobeItems.map(applyPatch),
    generatedLooks: state.generatedLooks.map(outfit => ({
      ...outfit,
      garments: outfit.garments.map(applyPatch),
      itemRefs: outfit.itemRefs,
    })),
    savedLooks: state.savedLooks.map(entry => ({
      ...entry,
      outfit: {
        ...entry.outfit,
        garments: entry.outfit.garments.map(applyPatch),
        itemRefs: entry.outfit.itemRefs,
      },
    })),
  };
}

function normalizeThemeMode(value: string | undefined): ThemeMode {
  return value === 'light' ? 'light' : 'dark';
}

function normalizeAccentPalette(value: string | undefined): AccentPaletteKey {
  return normalizeAccentPaletteKey(value);
}

function normalizeCustomAccentColor(value: string | null | undefined): string | null {
  return normalizeCustomAccentHex(value);
}

function normalizeAppTab(value: string | undefined): AppTab {
  switch (value) {
    case 'wardrobe':
    case 'looks':
    case 'chat':
    case 'profile':
    case 'home':
      return value;
    case 'add':
      return 'looks';
    case 'history':
      return 'profile';
    default:
      return 'home';
  }
}

function normalizeUserProfile(user: AppState['user'] | undefined): AppState['user'] {
  return user
    ? {
        ...user,
        name: String(user.name || '').trim() || 'User',
        style: user.style,
        avatarGender: normalizeAvatarGender(user.avatarGender),
        bio: normalizeProfileBio(user.bio),
        avatarUrl: String(user.avatarUrl || '').trim(),
        profileAvatarUrl: String(user.profileAvatarUrl || user.avatarUrl || '').trim(),
        lookFaceAssetUrl: String(user.lookFaceAssetUrl || '').trim(),
        faceReferenceUrl: String(user.faceReferenceUrl || '').trim(),
        identityReferenceUrls: Array.isArray(user.identityReferenceUrls)
          ? user.identityReferenceUrls.map(value => String(value || '')).filter(Boolean)
          : [],
      }
    : null;
}

function normalizeWardrobeItems(items: WardrobeItem[] | undefined): WardrobeItem[] {
  return Array.isArray(items)
    ? items
        .filter((item): item is WardrobeItem => Boolean(item && typeof item === 'object' && item.id && item.category))
        .map(item => buildWardrobeItem({
          ...item,
          id: item.id,
          name: item.fullTitle || item.title || item.name,
          title: item.fullTitle || item.title || item.name,
          shortTitle: item.shortTitle,
          fullTitle: item.fullTitle,
          category: item.category,
          reviewState: item.reviewState,
        }))
        .filter(Boolean)
    : [];
}

function normalizeOutfits(outfits: Outfit[] | undefined, wardrobeById: Map<string, WardrobeItem>): Outfit[] {
  return Array.isArray(outfits)
    ? outfits
      .filter((outfit): outfit is Outfit => Boolean(outfit && typeof outfit === 'object'))
      .map(outfit => {
        const garments = normalizeOutfitGarments(outfit.garments, wardrobeById);
        return {
          ...outfit,
          garments,
          itemRefs: garments.map(item => ({
            itemId: item.id,
            category: item.category,
            clothingSlot: item.clothingSlot,
            bodySlot: item.bodySlot,
            layer: getLayer(item),
          })),
        };
      })
    : [];
}

function normalizeSavedLooks(savedLooks: SavedLookEntry[] | undefined, wardrobeById: Map<string, WardrobeItem>): SavedLookEntry[] {
  return Array.isArray(savedLooks)
    ? savedLooks
      .filter((entry): entry is SavedLookEntry => Boolean(entry && typeof entry === 'object' && entry.outfit))
      .map(entry => ({
        ...entry,
        outfit: normalizeOutfits([entry.outfit], wardrobeById)[0] || entry.outfit,
      }))
    : [];
}

function normalizeOutfitGarments(garments: WardrobeItem[] | undefined, wardrobeById: Map<string, WardrobeItem>): WardrobeItem[] {
  return Array.isArray(garments)
    ? garments
      .filter((item): item is WardrobeItem => Boolean(item && typeof item === 'object' && item.id && item.category))
      .map(item => buildWardrobeItem({
        ...(wardrobeById.get(item.id) || item),
        ...item,
        id: item.id,
        name: item.fullTitle || item.title || item.name,
        title: item.fullTitle || item.title || item.name,
        shortTitle: item.shortTitle,
        fullTitle: item.fullTitle,
        category: item.category,
      }))
    : [];
}

function upsertWardrobeItems(existing: WardrobeItem[], incoming: WardrobeItem[]): WardrobeItem[] {
  const next = [...existing];
  for (const item of incoming) {
    const index = next.findIndex(entry => entry.id === item.id);
    if (index >= 0) next[index] = item;
    else next.push(item);
  }
  return next;
}
