import { createStore } from './state/store.js';
import { rootReducer } from './state/reducers.js';
import { createInitialState } from './state/app-state.js';
import {
  setWeather,
  setOutfits,
  setWardrobeItems,
  setUser,
  setAuthSession,
  setCity,
  setLocation,
  setAiLoading,
  setAiError,
  selectTab,
  updateWardrobeItem,
} from './state/actions.js';
import { CalendarHeader } from './components/calendar-header.js';
import { OutfitCanvas } from './canvas/outfit-canvas.js';
import { SwipeController } from './canvas/swipe-controller.js';
import { TabBar } from './components/tab-bar.js';
import { OnboardingScreen } from './components/onboarding-screen.js';
import { WardrobeScreen } from './components/wardrobe-screen.js';
import { ChatScreen } from './components/chat-screen.js';
import { ProfileScreen } from './components/profile-screen.js';
import { LoginScreen } from './components/login-screen.js';
import { LookBuilder } from './components/look-builder.js';
import { LookActions } from './components/look-actions.js';
import { AuthService } from './services/auth-service.js';
import { AgentOrchestrator } from './services/agent-orchestrator.js';
import { WeatherService } from './services/weather-service.js';
import { CalendarService } from './services/calendar-service.js';
import { TrendService } from './services/trend-service.js';
import { DailyLookPhotoService } from './services/daily-look-photo-service.js';
import { OutfitRecommendationService } from './services/outfit-recommendation-service.js';
import { createOutfit } from './models/outfit.js';
import { normalizeGarmentSelection } from './models/garment-presentation.js';
import { ServiceTrendProvider, JsonTrendProvider } from './services/trend-provider.js';
import {
  loadWardrobe,
  saveWardrobe,
  setActiveUser,
  setActiveAccessToken,
} from './services/wardrobe-repository.js';
import {
  getGeminiApiKey,
  hasGeminiKey,
  setGeminiApiKey,
} from './services/gemini-provider.js';
import {
  AI_LOOK_UPGRADE_PRICE_USD,
  EXPANDED_AI_LOOK_LIMIT,
  FREE_AI_LOOK_LIMIT,
  STRIPE_AI_LOOK_UPGRADE_URL,
  UPGRADE_CONTEXT_AI_LOOKS,
  buildAiLookUpgradeStorageKey,
  buildAiLookUsageStorageKey,
  buildUpgradePendingContextStorageKey,
  extractUpgradeTargetFromUrl,
  getAiLookLimit,
  isUpgradeSuccessUrl,
  isWardrobeUpgradeStoredValue,
  parseUsageCount,
} from './shared/wardrobe-upgrade.js';
import { installMobileLayout } from './utils/mobile-layout.js';
import { initSimulator } from '../dev_preview/simulator.js';

const ONBOARDING_KEY_PREFIX = 'renew_onboarding_';
const USER_PROFILE_PREFIX = 'renew_user_';
const USER_CONTEXT_PREFIX = 'renew_context_';

const PAGE_STUBS = {
  history: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l2 2"/></svg>`,
    title: 'Outfit History',
    desc: 'Your past looks and wear statistics will appear here.',
  },
  profile: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/></svg>`,
    title: 'Profile',
    desc: 'Your style preferences, body measurements, and account settings.',
  },
};

/** @type {(() => void) | null} */
let activeCleanup = null;

/**
 * Main application bootstrap.
 */
export async function initApp() {
  initSimulator();

  const screen = document.querySelector('.phone-screen');
  if (!screen) return;

  const authService = new AuthService();
  let existingSession = null;
  try {
    existingSession = await authService.consumeOAuthRedirectSession();
  } catch (err) {
    console.error('OAuth callback handling failed:', err);
  }
  existingSession = existingSession || authService.getCurrentSession();

  if (!existingSession) {
    showLogin(screen, authService);
    return;
  }

  await routeAuthenticated(screen, authService, existingSession);
}

/**
 * @param {Element} screen
 * @param {AuthService} authService
 */
function showLogin(screen, authService) {
  cleanupActiveView();
  clearAppScreens(screen);

  const container = document.createElement('div');
  container.className = 'app-screen';
  screen.appendChild(container);

  new LoginScreen(container, {
    onLogin: async () => {
      const session = await authService.signInLocal();
      await routeAuthenticated(screen, authService, session);
    },
  });
}

/**
 * @param {Element} screen
 * @param {AuthService} authService
 * @param {{ user: { id: string, email: string, name: string, provider: string }, accessToken?: string, refreshToken?: string, isDevelopmentFallback?: boolean }} session
 */
async function routeAuthenticated(screen, authService, session) {
  const onboardingDone = localStorage.getItem(`${ONBOARDING_KEY_PREFIX}${session.user.id}`) === 'true';

  if (!onboardingDone) {
    showOnboarding(screen, session, async () => {
      await showMainApp(screen, authService, session);
    });
    return;
  }

  await showMainApp(screen, authService, session);
}

/**
 * @param {Element} screen
 * @param {{ user: { id: string, email: string, name: string, provider: string }, accessToken?: string, refreshToken?: string, isDevelopmentFallback?: boolean }} session
 * @param {() => Promise<void>} onComplete
 */
function showOnboarding(screen, session, onComplete) {
  cleanupActiveView();
  clearAppScreens(screen);

  const onboardingContainer = document.createElement('div');
  onboardingContainer.className = 'app-screen';
  screen.appendChild(onboardingContainer);

  activeCleanup = installMobileLayout(onboardingContainer);

  const store = createStore(rootReducer, createInitialState());
  store.dispatch(setAuthSession(session));

  new OnboardingScreen(onboardingContainer, store, async () => {
    localStorage.setItem(`${ONBOARDING_KEY_PREFIX}${session.user.id}`, 'true');

    const state = store.getState();
    if (state.user) {
      localStorage.setItem(`${USER_PROFILE_PREFIX}${session.user.id}`, JSON.stringify(state.user));
    }

    onboardingContainer.remove();
    await onComplete();
  });
}

/**
 * @param {Element} app
 * @param {(key: string) => void} onSaved
 */
function showApiKeyPrompt(app, onSaved) {
  const banner = document.createElement('div');
  banner.className = 'api-key-banner';
  banner.id = 'api-key-banner';
  banner.innerHTML = `
    <div class="api-key-banner__content">
      <span class="api-key-banner__label">Enable Agentic AI</span>
      <div class="api-key-banner__row">
        <input class="api-key-banner__input" id="api-key-input" type="password" placeholder="GEMINI_API_KEY" />
        <button class="api-key-banner__btn" id="api-key-save">Save</button>
      </div>
      <button class="api-key-banner__dismiss" id="api-key-dismiss">&times;</button>
    </div>
  `;

  if (app.firstChild) {
    app.insertBefore(banner, app.firstChild);
  } else {
    app.appendChild(banner);
  }

  banner.querySelector('#api-key-save')?.addEventListener('click', () => {
    const input = /** @type {HTMLInputElement} */ (banner.querySelector('#api-key-input'));
    const key = input?.value?.trim();
    if (key) {
      setGeminiApiKey(key);
      onSaved(key);
      banner.remove();
    }
  });

  banner.querySelector('#api-key-dismiss')?.addEventListener('click', () => {
    banner.remove();
  });
}

/**
 * @param {Element} screen
 * @param {AuthService} authService
 * @param {{ user: { id: string, email: string, name: string, provider: string }, accessToken?: string, refreshToken?: string, isDevelopmentFallback?: boolean }} session
 */
async function showMainApp(screen, authService, session) {
  cleanupActiveView();
  clearAppScreens(screen);

  const app = document.createElement('div');
  app.className = 'app-screen';

  const headerContainer = document.createElement('div');
  headerContainer.className = 'app-header';

  const canvasWrapper = document.createElement('div');
  canvasWrapper.className = 'app-canvas-wrapper';

  const canvasEl = document.createElement('div');
  canvasWrapper.appendChild(canvasEl);

  const tabBarContainer = document.createElement('div');
  tabBarContainer.className = 'app-tab-bar';

  app.appendChild(headerContainer);
  app.appendChild(canvasWrapper);
  app.appendChild(tabBarContainer);
  screen.appendChild(app);

  activeCleanup = installMobileLayout(app);

  const weatherService = new WeatherService();
  const calendarService = new CalendarService();
  const trendService = new TrendService();
  const trendProvider = new ServiceTrendProvider();
  const fallbackTrendProvider = new JsonTrendProvider();
  const dailyLookPhotoService = new DailyLookPhotoService();
  const recommendationService = new OutfitRecommendationService();

  const initialState = createInitialState();
  const store = createStore(rootReducer, initialState);

  store.dispatch(setAuthSession(session));
  setActiveUser(session.user.id);
  setActiveAccessToken(session.accessToken || '');

  const aiUpgradeStorageKey = buildAiLookUpgradeStorageKey(session.user.id);
  const aiUsageStorageKey = buildAiLookUsageStorageKey(session.user.id);
  const pendingUpgradeContextStorageKey = buildUpgradePendingContextStorageKey(session.user.id);
  let aiLookUpgradeUnlocked = isWardrobeUpgradeStoredValue(localStorage.getItem(aiUpgradeStorageKey));
  let aiLookUsageCount = parseUsageCount(localStorage.getItem(aiUsageStorageKey));

  const getAiGenerationLimit = () => getAiLookLimit(aiLookUpgradeUnlocked);

  const saveAiLookUsageState = () => {
    localStorage.setItem(aiUpgradeStorageKey, aiLookUpgradeUnlocked ? 'expanded' : 'free');
    localStorage.setItem(aiUsageStorageKey, String(aiLookUsageCount));
  };

  const closeAiUpgradeModal = () => {
    app.querySelector('#ai-upgrade-modal')?.remove();
  };

  /**
   * @param {string} [note]
   */
  const openAiUpgradeModal = (note = '') => {
    closeAiUpgradeModal();
    const limit = getAiGenerationLimit();
    const modal = document.createElement('div');
    modal.id = 'ai-upgrade-modal';
    modal.className = 'ai-upgrade-modal';
    modal.innerHTML = `
      <div class="ai-upgrade-card">
        <button class="ai-upgrade-close" id="ai-upgrade-close" aria-label="Close AI upgrade modal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="ai-upgrade-eyebrow">AI Looks Plus</div>
        <h3 class="ai-upgrade-title">Unlock 20 AI generations</h3>
        <p class="ai-upgrade-copy">
          You already used ${aiLookUsageCount}/${limit} AI generations. Upgrade for $${AI_LOOK_UPGRADE_PRICE_USD} and expand to ${EXPANDED_AI_LOOK_LIMIT}.
        </p>
        ${note ? `<p class="ai-upgrade-note">${note}</p>` : ''}
        <button class="ai-upgrade-pay" id="ai-upgrade-pay">Pay $${AI_LOOK_UPGRADE_PRICE_USD}</button>
      </div>
    `;

    app.appendChild(modal);
    modal.querySelector('#ai-upgrade-close')?.addEventListener('click', () => {
      closeAiUpgradeModal();
    });
    modal.querySelector('#ai-upgrade-pay')?.addEventListener('click', () => {
      localStorage.setItem(pendingUpgradeContextStorageKey, UPGRADE_CONTEXT_AI_LOOKS);
      closeAiUpgradeModal();
      window.open(STRIPE_AI_LOOK_UPGRADE_URL, '_blank', 'noopener,noreferrer');
    });
  };

  const consumeAiUpgradeSuccessFromUrl = () => {
    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    if (!isUpgradeSuccessUrl(currentUrl)) return;

    const target = extractUpgradeTargetFromUrl(currentUrl);
    const pendingContext = String(localStorage.getItem(pendingUpgradeContextStorageKey) || '').trim().toLowerCase();
    const shouldUnlock = target
      ? target === UPGRADE_CONTEXT_AI_LOOKS
      : pendingContext === UPGRADE_CONTEXT_AI_LOOKS;
    if (!shouldUnlock) return;

    aiLookUpgradeUnlocked = true;
    localStorage.removeItem(pendingUpgradeContextStorageKey);
    saveAiLookUsageState();

    try {
      const parsed = new URL(currentUrl);
      parsed.searchParams.delete('wardrobeUpgrade');
      parsed.searchParams.delete('upgrade');
      parsed.searchParams.delete('payment');
      parsed.searchParams.delete('status');
      parsed.searchParams.delete('upgradeTarget');
      parsed.searchParams.delete('target');
      parsed.searchParams.delete('context');
      if (window.history?.replaceState) {
        window.history.replaceState({}, '', parsed.toString());
      }
    } catch {
      // ignore malformed URL cleanup
    }
  };

  consumeAiUpgradeSuccessFromUrl();

  const savedUserRaw = localStorage.getItem(`${USER_PROFILE_PREFIX}${session.user.id}`);
  if (savedUserRaw) {
    try {
      const parsedUser = JSON.parse(savedUserRaw);
      if (parsedUser && typeof parsedUser === 'object') {
        const lookFaceFallback = parsedUser.lookFaceAssetUrl || parsedUser.faceReferenceUrl || '';
        if (lookFaceFallback && !parsedUser.lookFaceAssetUrl) {
          parsedUser.lookFaceAssetUrl = lookFaceFallback;
        }
        if (lookFaceFallback && !parsedUser.faceReferenceUrl) {
          parsedUser.faceReferenceUrl = lookFaceFallback;
        }
        if (!parsedUser.profileAvatarUrl && parsedUser.avatarUrl) {
          parsedUser.profileAvatarUrl = parsedUser.avatarUrl;
        }
      }
      store.dispatch(setUser(parsedUser));
    } catch {
      // ignore malformed local profile cache
    }
  }

  const savedContextRaw = localStorage.getItem(`${USER_CONTEXT_PREFIX}${session.user.id}`);
  if (savedContextRaw) {
    try {
      const parsed = JSON.parse(savedContextRaw);
      if (typeof parsed?.city === 'string') {
        store.dispatch(setCity(parsed.city));
      }
      if (parsed?.location && typeof parsed.location === 'object') {
        const latitude = typeof parsed.location.latitude === 'number' ? parsed.location.latitude : null;
        const longitude = typeof parsed.location.longitude === 'number' ? parsed.location.longitude : null;
        store.dispatch(setLocation({ latitude, longitude }));
      }
    } catch {
      // ignore malformed context cache
    }
  }

  const wardrobe = await loadWardrobe(session.user.id);
  store.dispatch(setWardrobeItems(wardrobe));

  let agentOrchestrator = buildAgentOrchestrator(store, session, weatherService, calendarService, trendService);

  if (!hasGeminiKey()) {
    showApiKeyPrompt(app, () => {
      agentOrchestrator = buildAgentOrchestrator(store, session, weatherService, calendarService, trendService);
      if (chatScreen) {
        chatScreen.agentOrchestrator = agentOrchestrator;
        chatScreen.render(store.getState());
      }
      void loadDataForDate(
        store,
        store.getState().selectedDate,
        agentOrchestrator,
        weatherService,
        trendService,
        dailyLookPhotoService,
        recommendationService,
        trendProvider,
        fallbackTrendProvider,
      );
    });
  }

  const calendarHeader = new CalendarHeader(headerContainer, store);
  const outfitCanvas = new OutfitCanvas(canvasEl);
  const swipeController = new SwipeController(canvasWrapper, store);
  const tabBar = new TabBar(tabBarContainer, store);
  void calendarHeader;
  void swipeController;
  void tabBar;

  /** @type {WardrobeScreen | null} */
  let wardrobeScreen = null;
  /** @type {ChatScreen | null} */
  let chatScreen = null;
  /** @type {ProfileScreen | null} */
  let profileScreen = null;
  /** @type {LookBuilder | null} */
  let lookBuilder = null;
  /** @type {string[]} */
  let manualSelectedIds = [];
  /** @type {import('./models/outfit.js').Outfit | null} */
  let manualOutfit = null;

  const nanoStatus = document.createElement('div');
  nanoStatus.className = 'nano-status';
  nanoStatus.style.display = 'none';
  canvasWrapper.appendChild(nanoStatus);

  /**
   * @param {import('./state/app-state.js').AppState} state
   */
  const renderAddCanvas = (state) => {
    const userPhoto = state.user?.profileAvatarUrl || state.user?.avatarUrl || '';
    const outfit = manualOutfit || state.outfitAlternatives[state.activeOutfitIndex] || null;
    const total = manualOutfit ? 1 : state.outfitAlternatives.length;
    const index = manualOutfit ? 0 : state.activeOutfitIndex;
    const emptyMessage = state.aiLoading
      ? 'Generating today looks...'
      : state.aiError || 'Add more wardrobe items or build look manually';
    const shouldForceLayered = Boolean(manualOutfit);
    const isManualMode = Boolean(manualOutfit);

    outfitCanvas.render(outfit, index, total, userPhoto, {
      forceLayered: shouldForceLayered,
      emptyMessage,
      draggable: isManualMode,
      onGarmentMove: (garmentId, patch) => {
        store.dispatch(updateWardrobeItem(garmentId, patch));
      },
    });
    renderNanoStatus(nanoStatus, outfit, state.aiError, Boolean(manualOutfit));
  };

  let lastSavedWardrobeJSON = JSON.stringify(store.getState().wardrobeItems);

  store.subscribe(state => {
    const nextWardrobeJSON = JSON.stringify(state.wardrobeItems);
    if (nextWardrobeJSON !== lastSavedWardrobeJSON) {
      lastSavedWardrobeJSON = nextWardrobeJSON;
      void saveWardrobe(state.wardrobeItems, session.user.id);
    }
  });
  let lastUserJSON = JSON.stringify(store.getState().user || null);
  store.subscribe(state => {
    const nextUserJSON = JSON.stringify(state.user || null);
    if (nextUserJSON === lastUserJSON) return;
    lastUserJSON = nextUserJSON;
    if (!state.user) return;
    localStorage.setItem(`${USER_PROFILE_PREFIX}${session.user.id}`, nextUserJSON);
  });

  let lastContextJSON = JSON.stringify({
    city: store.getState().city,
    location: store.getState().location,
  });
  store.subscribe(state => {
    const nextContext = {
      city: state.city,
      location: state.location,
    };
    const nextContextJSON = JSON.stringify(nextContext);
    if (nextContextJSON !== lastContextJSON) {
      lastContextJSON = nextContextJSON;
      localStorage.setItem(`${USER_CONTEXT_PREFIX}${session.user.id}`, nextContextJSON);
    }
  });

  store.subscribe(state => {
    if (state.activeTab === 'add') {
      headerContainer.style.display = '';
      canvasWrapper.style.display = '';
      nanoStatus.style.display = '';
      removePageStub(app);
      removeWardrobeView(app);
      removeChatView(app, chatScreen);
      removeProfileView(app, profileScreen);
      chatScreen = null;
      profileScreen = null;
      wardrobeScreen?.destroy();
      wardrobeScreen = null;

      if (!app.querySelector('#look-actions-view')) {
        const lookActionsContainer = document.createElement('div');
        lookActionsContainer.id = 'look-actions-view';
        lookActionsContainer.className = 'look-builder-view';
        app.insertBefore(lookActionsContainer, tabBarContainer);
        new LookActions(lookActionsContainer, {
          onAddFromWardrobe: () => {
            const stateNow = store.getState();
            const current = stateNow.outfitAlternatives[stateNow.activeOutfitIndex];
            const selected = current?.garments?.map(g => g.id) || [];
            manualSelectedIds = selected;
            manualOutfit = buildManualOutfit(stateNow, manualSelectedIds);
            /** @type {any} */ (lookBuilder)?.setSelection(selected);
            renderAddCanvas(store.getState());
          },
          onUploadNewItem: () => {
            localStorage.setItem('renew_wardrobe_add_mode', 'single_item');
            store.dispatch(selectTab('wardrobe'));
          },
          onUploadOutfitPhoto: () => {
            localStorage.setItem('renew_wardrobe_add_mode', 'person_outfit');
            store.dispatch(selectTab('wardrobe'));
          },
          onGenerateAiLook: () => {
            const limit = getAiGenerationLimit();
            if (aiLookUsageCount >= limit) {
              openAiUpgradeModal(`Free AI limit is ${FREE_AI_LOOK_LIMIT}. Upgrade to unlock ${EXPANDED_AI_LOOK_LIMIT} generations.`);
              return;
            }

            manualSelectedIds = [];
            manualOutfit = null;
            void (async () => {
              const result = await loadDataForDate(
                store,
                store.getState().selectedDate,
                agentOrchestrator,
                weatherService,
                trendService,
                dailyLookPhotoService,
                recommendationService,
                trendProvider,
                fallbackTrendProvider,
              );

              if (result.generated) {
                aiLookUsageCount += 1;
                saveAiLookUsageState();
              }
            })();
          },
        });
      }

      if (!app.querySelector('#look-builder-view')) {
        lookBuilder?.destroy();
        const lookBuilderContainer = document.createElement('div');
        lookBuilderContainer.id = 'look-builder-view';
        lookBuilderContainer.className = 'look-builder-view';
        app.insertBefore(lookBuilderContainer, tabBarContainer);
        lookBuilder = new LookBuilder(lookBuilderContainer, store, {
          /** @param {string[]} itemIds */
          onSelectionChange: (itemIds) => {
            manualSelectedIds = itemIds;
            manualOutfit = buildManualOutfit(store.getState(), manualSelectedIds);
            renderAddCanvas(store.getState());
          },
        });
      }

      manualOutfit = buildManualOutfit(state, manualSelectedIds);
      renderAddCanvas(state);
    } else if (state.activeTab === 'wardrobe') {
      headerContainer.style.display = 'none';
      canvasWrapper.style.display = 'none';
      nanoStatus.style.display = 'none';
      removePageStub(app);
      removeChatView(app, chatScreen);
      removeProfileView(app, profileScreen);
      removeLookBuilderView(app, lookBuilder);
      removeLookActionsView(app);
      lookBuilder = null;
      chatScreen = null;
      profileScreen = null;

      if (!app.querySelector('#wardrobe-view')) {
        wardrobeScreen?.destroy();
        const wardrobeContainer = document.createElement('div');
        wardrobeContainer.id = 'wardrobe-view';
        wardrobeContainer.className = 'wardrobe-view';
        app.insertBefore(wardrobeContainer, tabBarContainer);
        wardrobeScreen = new WardrobeScreen(wardrobeContainer, store);
      }
    } else if (state.activeTab === 'chat') {
      headerContainer.style.display = 'none';
      canvasWrapper.style.display = 'none';
      nanoStatus.style.display = 'none';
      removePageStub(app);
      removeWardrobeView(app);
      removeProfileView(app, profileScreen);
      removeLookBuilderView(app, lookBuilder);
      removeLookActionsView(app);
      lookBuilder = null;
      wardrobeScreen?.destroy();
      wardrobeScreen = null;
      profileScreen = null;

      if (!app.querySelector('#chat-view')) {
        chatScreen?.destroy();
        const chatContainer = document.createElement('div');
        chatContainer.id = 'chat-view';
        chatContainer.className = 'chat-view';
        app.insertBefore(chatContainer, tabBarContainer);
        chatScreen = new ChatScreen(chatContainer, store, agentOrchestrator);
      }
    } else if (state.activeTab === 'profile') {
      headerContainer.style.display = 'none';
      canvasWrapper.style.display = 'none';
      nanoStatus.style.display = 'none';
      removePageStub(app);
      removeWardrobeView(app);
      removeChatView(app, chatScreen);
      removeLookBuilderView(app, lookBuilder);
      removeLookActionsView(app);
      lookBuilder = null;
      chatScreen = null;
      wardrobeScreen?.destroy();
      wardrobeScreen = null;

      if (!app.querySelector('#profile-view')) {
        profileScreen?.destroy();
        const profileContainer = document.createElement('div');
        profileContainer.id = 'profile-view';
        profileContainer.className = 'profile-view';
        app.insertBefore(profileContainer, tabBarContainer);
        profileScreen = new ProfileScreen(profileContainer, store);
      }
    } else {
      headerContainer.style.display = 'none';
      canvasWrapper.style.display = 'none';
      nanoStatus.style.display = 'none';
      removeWardrobeView(app);
      removeChatView(app, chatScreen);
      removeProfileView(app, profileScreen);
      removeLookBuilderView(app, lookBuilder);
      removeLookActionsView(app);
      lookBuilder = null;
      chatScreen = null;
      profileScreen = null;
      wardrobeScreen?.destroy();
      wardrobeScreen = null;
      showPageStub(app, state.activeTab, tabBarContainer);
    }
  });

  let currentDate = '';
  store.subscribe(async state => {
    if (state.selectedDate !== currentDate) {
      currentDate = state.selectedDate;
      await loadDataForDate(
        store,
        state.selectedDate,
        agentOrchestrator,
        weatherService,
        trendService,
        dailyLookPhotoService,
        recommendationService,
        trendProvider,
        fallbackTrendProvider,
      );
    }
  });

  await loadDataForDate(
    store,
    store.getState().selectedDate,
    agentOrchestrator,
    weatherService,
    trendService,
    dailyLookPhotoService,
    recommendationService,
    trendProvider,
    fallbackTrendProvider,
  );
}

/**
 * @param {import('./state/store.js').Store<import('./state/app-state.js').AppState, any>} store
 * @param {{ user: { id: string, email: string, name: string, provider: string }, accessToken?: string, refreshToken?: string, isDevelopmentFallback?: boolean }} session
 * @param {WeatherService} weatherService
 * @param {CalendarService} calendarService
 * @param {TrendService} trendService
 * @returns {AgentOrchestrator | null}
 */
function buildAgentOrchestrator(store, session, weatherService, calendarService, trendService) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  return new AgentOrchestrator({
    apiKey,
    weatherService,
    calendarService,
    trendService,
    getWardrobeState: () => store.getState().wardrobeItems,
    getAuthSession: () => session,
  });
}

/**
 * @param {import('./state/store.js').Store<import('./state/app-state.js').AppState, any>} store
 * @param {string} date
 * @param {AgentOrchestrator | null} agentOrchestrator
 * @param {WeatherService} weatherService
 * @param {TrendService} trendService
 * @param {DailyLookPhotoService} dailyLookPhotoService
 * @param {OutfitRecommendationService} recommendationService
 * @param {ServiceTrendProvider} trendProvider
 * @param {JsonTrendProvider} fallbackTrendProvider
 */
async function loadDataForDate(
  store,
  date,
  agentOrchestrator,
  weatherService,
  trendService,
  dailyLookPhotoService,
  recommendationService,
  trendProvider,
  fallbackTrendProvider,
) {
  const state = store.getState();
  const latitude = state.location.latitude;
  const longitude = state.location.longitude;
  const region = state.city || 'global';

  try {
    store.dispatch(setAiLoading(true));
    store.dispatch(setAiError(null));

    const weather = await weatherService.getCurrentWeather(latitude, longitude);
    const weatherModel = weatherService.toWeatherModel(weather);
    store.dispatch(setWeather(weatherModel));

    let trendSignals = [];
    try {
      trendSignals = await trendProvider.getSignals({
        date,
        region,
        accessToken: state.authSession?.accessToken,
      });
      if (!trendSignals || trendSignals.length === 0) {
        trendSignals = await fallbackTrendProvider.getSignals({ date, region });
      }
    } catch {
      trendSignals = await fallbackTrendProvider.getSignals({ date, region });
    }

    const recommendation = recommendationService.generateSuggestions({
      date,
      weather: weatherModel,
      user: state.user,
      wardrobe: state.wardrobeItems,
      trendSignals,
    });

    if (!recommendation.success || recommendation.suggestions.length === 0) {
      const reason = recommendation.reason || 'not_enough_items';
      const message = reason.startsWith('not_enough_items')
        ? 'Not enough wardrobe items to build look. Add at least top, bottom, and shoes.'
        : reason === 'empty_wardrobe'
        ? 'Your wardrobe is empty. Add items to start generating looks.'
        : 'AI failed to build a look. Try manual outfit builder.';
      store.dispatch(setAiError(message));
      store.dispatch(setOutfits([]));
      store.dispatch(setAiLoading(false));
      return { generated: false };
    }

    const renderedSuggestions = await attachPhotorealisticDailyLook({
      outfits: recommendation.suggestions,
      store,
      date,
      region,
      weatherSummary: `${weather.temperature}\u00B0C, ${weather.condition}`,
      trendSignals,
      dailyLookPhotoService,
    });

    store.dispatch(setOutfits(renderedSuggestions));
    store.dispatch(setAiLoading(false));
    return { generated: renderedSuggestions.length > 0 };
  } catch (err) {
    store.dispatch(setAiLoading(false));
    store.dispatch(setAiError('AI failed, showing manual wardrobe builder.'));
    try {
      const fallbackWeather = await weatherService.getCurrentWeather(latitude, longitude);
      const fallbackWeatherModel = weatherService.toWeatherModel(fallbackWeather);
      store.dispatch(setWeather(fallbackWeatherModel));
      const fallbackRecommendation = recommendationService.generateSuggestions({
        date,
        weather: fallbackWeatherModel,
        user: state.user,
        wardrobe: state.wardrobeItems,
        trendSignals: [],
      });
      store.dispatch(setOutfits(fallbackRecommendation.suggestions || []));
    } catch {
      // keep existing state on secondary fallback failure
    }
    console.error('Failed to load daily look:', err);
    return { generated: false };
  }
}

/**
 * @param {{
 *  outfits: import('./models/outfit.js').Outfit[],
 *  store: import('./state/store.js').Store<import('./state/app-state.js').AppState, any>,
 *  date: string,
 *  region: string,
 *  weatherSummary: string,
 *  trendSignals: import('./models/domain-models.js').TrendSignal[],
 *  dailyLookPhotoService: DailyLookPhotoService
 * }} input
 * @returns {Promise<import('./models/outfit.js').Outfit[]>}
 */
async function attachPhotorealisticDailyLook(input) {
  if (input.outfits.length === 0) return input.outfits;
  if (!input.dailyLookPhotoService.isEnabled()) return input.outfits;

  const first = input.outfits[0];
  const state = input.store.getState();
  const city = state.city || input.region || 'Unknown city';

  const renderResult = await input.dailyLookPhotoService.generateDailyLookPhoto({
    date: input.date,
    city,
    weatherSummary: input.weatherSummary,
    styleName: first.styleName || first.name || 'Daily look',
    garments: first.garments,
    faceReferenceUrl: state.user?.profileAvatarUrl || state.user?.avatarUrl || undefined,
    trendSignals: input.trendSignals,
  });

  if (!renderResult.success) {
    return [{
      ...first,
      renderMetadata: {
        ...(first.renderMetadata || {}),
        nanoBanana: {
          renderError: renderResult.error,
        },
      },
    }, ...input.outfits.slice(1)];
  }

  const renderedFirst = {
    ...first,
    photoUrl: renderResult.photoUrl,
    renderMetadata: {
      ...(first.renderMetadata || {}),
      nanoBanana: {
        renderParameters: renderResult.renderParameters,
        usedFaceReference: renderResult.usedFaceReference,
      },
    },
  };

  return [renderedFirst, ...input.outfits.slice(1)];
}

/**
 * @param {HTMLElement} badge
 * @param {import('./models/outfit.js').Outfit | null} outfit
 * @param {string | null} aiError
 * @param {boolean} isManual
 */
function renderNanoStatus(badge, outfit, aiError, isManual) {
  if (isManual) {
    badge.textContent = 'Manual look mode';
    return;
  }

  const model = outfit?.renderMetadata?.nanoBanana?.renderParameters?.renderer_model;
  const error = outfit?.renderMetadata?.nanoBanana?.renderError || aiError;
  if (model) {
    badge.textContent = `Nano Banana: called (${model})`;
  } else if (error) {
    badge.textContent = 'Nano Banana: failed -> fallback layered';
  } else {
    badge.textContent = 'Nano Banana: pending';
  }
}

/**
 * @param {import('./state/app-state.js').AppState} state
 * @param {string[]} selectedIds
 * @returns {import('./models/outfit.js').Outfit | null}
 */
function buildManualOutfit(state, selectedIds) {
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) return null;
  const itemsById = new Map(state.wardrobeItems.map(item => [item.id, item]));
  const garments = normalizeGarmentSelection(state.wardrobeItems, selectedIds)
    .map(id => itemsById.get(id))
    .filter(Boolean);
  if (garments.length === 0) return null;

  return createOutfit({
    name: 'Manual look',
    styleName: 'Manual Try-On',
    confidenceScore: 1,
    garments: /** @type {import('./models/garment.js').Garment[]} */ (garments),
  });
}

/**
 * @param {Element} app
 * @param {string} tabId
 * @param {Element} beforeEl
 */
function showPageStub(app, tabId, beforeEl) {
  removePageStub(app);

  const stub = PAGE_STUBS[/** @type {keyof typeof PAGE_STUBS} */ (tabId)];
  if (!stub) return;

  const el = document.createElement('div');
  el.className = 'page-stub';
  el.id = 'page-stub';
  el.innerHTML = `
    <div class="page-stub__icon">${stub.icon}</div>
    <div class="page-stub__title">${stub.title}</div>
    <div class="page-stub__desc">${stub.desc}</div>
  `;

  app.insertBefore(el, beforeEl);
}

/** @param {Element} app */
function removePageStub(app) {
  app.querySelector('#page-stub')?.remove();
}

/** @param {Element} app */
function removeWardrobeView(app) {
  app.querySelector('#wardrobe-view')?.remove();
}

/**
 * @param {Element} app
 * @param {ChatScreen | null} chatScreen
 */
function removeChatView(app, chatScreen) {
  chatScreen?.destroy();
  app.querySelector('#chat-view')?.remove();
}

/**
 * @param {Element} app
 * @param {ProfileScreen | null} profileScreen
 */
function removeProfileView(app, profileScreen) {
  profileScreen?.destroy();
  app.querySelector('#profile-view')?.remove();
}

/**
 * @param {Element} app
 * @param {LookBuilder | null} lookBuilder
 */
function removeLookBuilderView(app, lookBuilder) {
  lookBuilder?.destroy();
  app.querySelector('#look-builder-view')?.remove();
}

/** @param {Element} app */
function removeLookActionsView(app) {
  app.querySelector('#look-actions-view')?.remove();
}

/** @param {Element} screen */
function clearAppScreens(screen) {
  screen.querySelectorAll('.app-screen').forEach(el => el.remove());
}

function cleanupActiveView() {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initApp());
} else {
  initApp();
}



