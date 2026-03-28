import { qs } from '../utils/dom.js';
import { formatDateShort, getDayNameRu, isToday, addDays } from '../utils/date.js';
import { navigateDay } from '../state/actions.js';
import { attachSwipe } from '../utils/gesture.js';

/**
 * Calendar Header Component.
 * Shows swipeable date with weather info, left/right day navigation.
 */
export class CalendarHeader {
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
    const { selectedDate, city, weather } = state;
    const prevDay = addDays(selectedDate, -1);
    const nextDay = addDays(selectedDate, 1);

    const tempStr = weather ? `${weather.temperature > 0 ? '+' : ''}${weather.temperature}\u00B0C` : '--\u00B0C';
    const condIcon = weather?.icon || '\u2600\uFE0F';
    const todayLabel = isToday(selectedDate) ? '\u0421\u0415\u0413\u041E\u0414\u041D\u042F' : getDayNameRu(selectedDate);

    this.container.innerHTML = `
      <div class="calendar-header">
        <button class="cal-nav cal-nav--prev" aria-label="Previous day">
          <span class="cal-nav__day">${getDayNameRu(prevDay)}</span>
        </button>

        <div class="cal-center">
          <div class="cal-center__date">${formatDateShort(selectedDate)}</div>
          <div class="cal-center__label">${todayLabel}</div>
          <div class="cal-center__weather">
            <span class="cal-center__city">${city || 'Город не указан'}</span>
            ${city ? '<span class="cal-center__separator">\u00B7</span>' : ''}
            <span class="cal-center__icon">${condIcon}</span>
            <span class="cal-center__temp">${tempStr}</span>
          </div>
        </div>

        <button class="cal-nav cal-nav--next" aria-label="Next day">
          <span class="cal-nav__day">${getDayNameRu(nextDay)}</span>
        </button>
      </div>
    `;

    // Bind navigation
    const prevBtn = qs('.cal-nav--prev', this.container);
    const nextBtn = qs('.cal-nav--next', this.container);
    prevBtn?.addEventListener('click', () => this.store.dispatch(navigateDay(-1)));
    nextBtn?.addEventListener('click', () => this.store.dispatch(navigateDay(1)));

    // Swipe on header
    const center = qs('.cal-center', this.container);
    if (center) {
      attachSwipe({
        element: center,
        onSwipe: dir => this.store.dispatch(navigateDay(dir === 'left' ? 1 : -1)),
        threshold: 40,
      });
    }
  }
}
