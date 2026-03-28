/**
 * Chat Screen - AI Stylist conversation interface.
 * Messages from user appear on the right, AI responses on the left.
 */

import { addChatMessage, setChatLoading, setChatError, setCity, setLocation } from '../state/actions.js';

export class ChatScreen {
  /**
   * @param {HTMLElement} container
   * @param {import('../state/store.js').Store<import('../state/app-state.js').AppState, any>} store
   * @param {import('../services/agent-orchestrator.js').AgentOrchestrator | null} agentOrchestrator
   */
  constructor(container, store, agentOrchestrator) {
    this.container = container;
    this.store = store;
    this.agentOrchestrator = agentOrchestrator;
    this.awaitingCityInput = false;
    this.pendingPrompt = '';
    this.render(store.getState());
    this.unsubscribe = store.subscribe(state => this.render(state));
  }

  /** @param {import('../state/app-state.js').AppState} state */
  render(state) {
    const hasAI = !!this.agentOrchestrator?.isConfigured();
    const messages = state.chatMessages;
    const isLoading = state.chatLoading;
    const error = state.chatError;

    this.container.innerHTML = `
      <div class="chat">
        <div class="chat__header">
          <div class="chat__header-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
          </div>
          <div class="chat__header-text">
            <h2 class="chat__title">AI Stylist</h2>
            <span class="chat__subtitle">${hasAI ? 'Agentic Gemini Core' : 'Set GEMINI_API_KEY to enable'}</span>
          </div>
        </div>

        <div class="chat__messages" id="chat-messages">
          ${messages.length === 0 ? `
            <div class="chat__welcome">
              <div class="chat__welcome-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
                  <path d="M12 2L9 7h6L12 2z"/>
                  <circle cx="12" cy="14" r="6"/>
                  <path d="M12 10v4l2 2"/>
                </svg>
              </div>
              <p class="chat__welcome-text">Hi! I can style looks from your real wardrobe and adapt to weather, plans, and your vibe.</p>
              <div class="chat__suggestions">
                <button class="chat__suggestion" data-text="What should I wear today?">What should I wear today?</button>
                <button class="chat__suggestion" data-text="Что надеть завтра?">Что надеть завтра?</button>
                <button class="chat__suggestion" data-text="Create a smart casual look">Smart casual look</button>
              </div>
            </div>
          ` : messages.map(msg => `
            <div class="chat__message chat__message--${msg.role}">
              <div class="chat__bubble chat__bubble--${msg.role}">
                ${this._formatMessage(msg.text)}
              </div>
            </div>
          `).join('')}

          ${isLoading ? `
            <div class="chat__message chat__message--model">
              <div class="chat__bubble chat__bubble--model chat__bubble--loading">
                <span class="chat__typing-dot"></span>
                <span class="chat__typing-dot"></span>
                <span class="chat__typing-dot"></span>
              </div>
            </div>
          ` : ''}

          ${error ? `
            <div class="chat__error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              ${error}
            </div>
          ` : ''}
        </div>

        <div class="chat__input-area">
          <input
            class="chat__input"
            id="chat-input"
            type="text"
            placeholder="${hasAI ? 'Ask your stylist agent...' : 'Configure Gemini API key'}"
            ${hasAI ? '' : 'disabled'}
            autocomplete="off"
          />
          <button class="chat__send-btn" id="chat-send" ${hasAI ? '' : 'disabled'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    this._scrollToBottom();
    this.bindEvents();
  }

  /**
   * @param {string} text
   * @returns {string}
   */
  _formatMessage(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  _scrollToBottom() {
    requestAnimationFrame(() => {
      const messagesEl = this.container.querySelector('#chat-messages');
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  bindEvents() {
    const input = /** @type {HTMLInputElement} */ (this.container.querySelector('#chat-input'));
    const sendBtn = this.container.querySelector('#chat-send');

    const send = () => this._sendMessage(input);

    sendBtn?.addEventListener('click', send);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    const suggestions = this.container.querySelectorAll('.chat__suggestion');
    suggestions.forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-text');
        if (text && input) {
          input.value = text;
          send();
        }
      });
    });
  }

  /**
   * @param {HTMLInputElement | null} input
   */
  async _sendMessage(input) {
    const text = input?.value?.trim();
    if (!text) return;

    if (!this.agentOrchestrator?.isConfigured()) return;

    this.store.dispatch(addChatMessage({ role: 'user', text }));
    if (input) input.value = '';

    if (this.awaitingCityInput) {
      const consumedAsCity = await this._tryConsumeCityReply(text);
      if (consumedAsCity) return;
    }

    const state = this.store.getState();
    if (!this.pendingPrompt && this._isLocationMissing(state) && this._isWeatherDependentRequest(text)) {
      this.pendingPrompt = text;
    }

    await this._runAgentMessage(text);
  }

  /**
   * @param {string} cityInput
   * @returns {Promise<boolean>}
   */
  async _tryConsumeCityReply(cityInput) {
    const orchestrator = this.agentOrchestrator;
    if (!orchestrator) return false;

    this.store.dispatch(setChatLoading(true));
    this.store.dispatch(setChatError(null));

    const resolved = await orchestrator.resolveCity(cityInput);
    if (!resolved.success) {
      this.store.dispatch(setChatLoading(false));
      this.store.dispatch(addChatMessage({
        role: 'model',
        text: 'Не смогла распознать этот город. Напиши в формате "Город, страна".',
      }));
      return true;
    }

    const cityLabel = resolved.country
      ? `${resolved.city}, ${resolved.country}`
      : resolved.city;
    this.store.dispatch(setCity(cityLabel));
    this.store.dispatch(setLocation({
      latitude: resolved.latitude,
      longitude: resolved.longitude,
    }));

    this.awaitingCityInput = false;
    const pendingPrompt = this.pendingPrompt;
    this.pendingPrompt = '';
    this.store.dispatch(setChatLoading(false));
    this.store.dispatch(addChatMessage({
      role: 'model',
      text: `Супер, зафиксировала локацию: ${cityLabel}. Сейчас соберу вариант.`,
    }));

    if (pendingPrompt && pendingPrompt !== cityInput) {
      await this._runAgentMessage(pendingPrompt);
    }

    return true;
  }

  /**
   * @param {string} text
   * @returns {boolean}
   */
  _isWeatherDependentRequest(text) {
    return /(что надеть|what should i wear|look|лук|погод|weather|today|tomorrow|сегодня|завтра|outfit)/i.test(String(text || ''));
  }

  /**
   * @param {string} text
   * @returns {boolean}
   */
  _messageRequestsCity(text) {
    return /(в каком.*город|какой у тебя город|город.*\?|which city|what city|your city|city are you in)/i.test(String(text || ''));
  }

  /**
   * @param {string} text
   * @returns {Promise<void>}
   */
  async _runAgentMessage(text) {
    const orchestrator = this.agentOrchestrator;
    if (!orchestrator) return;

    this.store.dispatch(setChatLoading(true));
    this.store.dispatch(setChatError(null));

    const state = this.store.getState();
    const history = state.chatMessages.map(m => ({ role: m.role, text: m.text }));
    const normalizedHistory = (
      history.length > 0 &&
      history[history.length - 1].role === 'user' &&
      history[history.length - 1].text === text
    )
      ? history.slice(0, -1)
      : history;

    try {
      const weatherSummary = state.weather
        ? `${state.weather.temperature}\u00B0C, ${state.weather.condition}`
        : '';
      const result = await orchestrator.chat({
        message: text,
        history: normalizedHistory,
        latitude: state.location.latitude,
        longitude: state.location.longitude,
        date: state.selectedDate,
        city: state.city,
        userStyle: state.user?.style || '',
        weatherSummary,
      });

      this.store.dispatch(setChatLoading(false));
      const message = result.message || 'I could not generate a response. Please try again.';
      this.store.dispatch(addChatMessage({ role: 'model', text: message }));

      const nextState = this.store.getState();
      if (this._isLocationMissing(nextState) && this._messageRequestsCity(message)) {
        this.awaitingCityInput = true;
        if (!this.pendingPrompt) {
          this.pendingPrompt = text;
        }
      } else if (!this._isLocationMissing(nextState)) {
        this.awaitingCityInput = false;
      }
      return;
    }
    catch {
      this.store.dispatch(setChatLoading(false));
      this.store.dispatch(setChatError('Failed to connect to AI. Please try again.'));
    }
  }

  /**
   * @param {import('../state/app-state.js').AppState} state
   * @returns {boolean}
   */
  _isLocationMissing(state) {
    return !state.city || state.location.latitude == null || state.location.longitude == null;
  }

  destroy() {
    this.unsubscribe?.();
  }
}
