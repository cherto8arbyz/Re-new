import { selectTab } from '../state/actions.js';

/**
 * @typedef {'history' | 'wardrobe' | 'add' | 'chat' | 'profile'} TabId
 */

/**
 * SVG icons for each tab.
 * @type {Record<TabId, { icon: string, label: string }>}
 */
const TABS = {
  history: {
    label: 'History',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 8v4l2 2"/>
      <circle cx="12" cy="12" r="9"/>
      <path d="M3 12h1M20 12h1M12 3v1M12 20v1"/>
    </svg>`,
  },
  wardrobe: {
    label: 'Wardrobe',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L9 7h6L12 2z"/>
      <path d="M9 7c-3 0-6 1-6 3v10c0 1 1 2 2 2h14c1 0 2-1 2-2V10c0-2-3-3-6-3"/>
      <line x1="12" y1="7" x2="12" y2="14"/>
      <path d="M9 14h6"/>
    </svg>`,
  },
  add: {
    label: 'Look',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>`,
  },
  chat: {
    label: 'Chat',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      <line x1="8" y1="9" x2="16" y2="9"/>
      <line x1="8" y1="13" x2="13" y2="13"/>
    </svg>`,
  },
  profile: {
    label: 'Profile',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>`,
  },
};

/** @type {TabId[]} */
const TAB_ORDER = ['history', 'wardrobe', 'add', 'chat', 'profile'];

/**
 * Bottom Tab Bar Component.
 */
export class TabBar {
  /**
   * @param {HTMLElement} container
   * @param {import('../state/store.js').Store<import('../state/app-state.js').AppState, any>} store
   */
  constructor(container, store) {
    this.container = container;
    this.store = store;
    this.render(store.getState());
    this.store.subscribe(state => this.render(state));
  }

  /** @param {import('../state/app-state.js').AppState} state */
  render(state) {
    this.container.innerHTML = '';
    this.container.className = 'tab-bar';

    const nav = document.createElement('nav');
    nav.className = 'tab-bar__nav';

    for (const tabId of TAB_ORDER) {
      const tab = TABS[tabId];
      const btn = document.createElement('button');
      btn.className = `tab-bar__item${state.activeTab === tabId ? ' tab-bar__item--active' : ''}${tabId === 'add' ? ' tab-bar__item--center' : ''}`;
      btn.setAttribute('aria-label', tab.label);
      btn.dataset.tab = tabId;

      btn.innerHTML = `
        <span class="tab-bar__icon">${tab.icon}</span>
        <span class="tab-bar__label">${tab.label}</span>
      `;

      btn.addEventListener('click', () => {
        this.store.dispatch(selectTab(tabId));
      });

      nav.appendChild(btn);
    }

    this.container.appendChild(nav);
  }
}
