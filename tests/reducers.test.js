import { describe, it, expect } from './runner.js';
import { rootReducer } from '../src/state/reducers.js';
import { navigateDay, swipeOutfit, selectTab, setWeather, setOutfits } from '../src/state/actions.js';
import { createInitialState } from '../src/state/app-state.js';

describe('Reducers', () => {
  it('NAVIGATE_DAY +1 increments date', () => {
    const state = { ...createInitialState(), selectedDate: '2026-03-21' };
    const next = rootReducer(state, navigateDay(1));
    expect(next.selectedDate).toBe('2026-03-22');
  });

  it('NAVIGATE_DAY -1 decrements date', () => {
    const state = { ...createInitialState(), selectedDate: '2026-03-01' };
    const next = rootReducer(state, navigateDay(-1));
    expect(next.selectedDate).toBe('2026-02-28');
  });

  it('NAVIGATE_DAY crosses year boundary', () => {
    const state = { ...createInitialState(), selectedDate: '2025-12-31' };
    const next = rootReducer(state, navigateDay(1));
    expect(next.selectedDate).toBe('2026-01-01');
  });

  it('NAVIGATE_DAY resets weather and outfits', () => {
    const state = {
      ...createInitialState(),
      selectedDate: '2026-03-21',
      weather: /** @type {any} */ ({ temperature: 10 }),
      outfitAlternatives: [/** @type {any} */ ({})],
      activeOutfitIndex: 2,
    };
    const next = rootReducer(state, navigateDay(1));
    expect(next.weather).toBeNull();
    expect(next.outfitAlternatives).toHaveLength(0);
    expect(next.activeOutfitIndex).toBe(0);
  });

  it('SWIPE_OUTFIT left increments index', () => {
    const state = {
      ...createInitialState(),
      outfitAlternatives: [/** @type {any} */ ({}), /** @type {any} */ ({}), /** @type {any} */ ({})],
      activeOutfitIndex: 0,
    };
    const next = rootReducer(state, swipeOutfit('left'));
    expect(next.activeOutfitIndex).toBe(1);
  });

  it('SWIPE_OUTFIT right decrements index', () => {
    const state = {
      ...createInitialState(),
      outfitAlternatives: [/** @type {any} */ ({}), /** @type {any} */ ({}), /** @type {any} */ ({})],
      activeOutfitIndex: 2,
    };
    const next = rootReducer(state, swipeOutfit('right'));
    expect(next.activeOutfitIndex).toBe(1);
  });

  it('SWIPE_OUTFIT clamps at 0', () => {
    const state = {
      ...createInitialState(),
      outfitAlternatives: [/** @type {any} */ ({})],
      activeOutfitIndex: 0,
    };
    const next = rootReducer(state, swipeOutfit('right'));
    expect(next.activeOutfitIndex).toBe(0);
  });

  it('SWIPE_OUTFIT clamps at max', () => {
    const state = {
      ...createInitialState(),
      outfitAlternatives: [/** @type {any} */ ({}), /** @type {any} */ ({})],
      activeOutfitIndex: 1,
    };
    const next = rootReducer(state, swipeOutfit('left'));
    expect(next.activeOutfitIndex).toBe(1);
  });

  it('SELECT_TAB changes active tab', () => {
    const state = createInitialState();
    const next = rootReducer(state, selectTab('wardrobe'));
    expect(next.activeTab).toBe('wardrobe');
  });

  it('SET_WEATHER updates weather', () => {
    const state = createInitialState();
    const weather = /** @type {any} */ ({ temperature: 15, condition: 'sunny' });
    const next = rootReducer(state, setWeather(weather));
    expect(next.weather).toEqual(weather);
  });

  it('SET_OUTFITS resets activeOutfitIndex to 0', () => {
    const state = { ...createInitialState(), activeOutfitIndex: 3 };
    const outfits = [/** @type {any} */ ({}), /** @type {any} */ ({})];
    const next = rootReducer(state, setOutfits(outfits));
    expect(next.outfitAlternatives).toHaveLength(2);
    expect(next.activeOutfitIndex).toBe(0);
  });

  it('unknown action returns state unchanged', () => {
    const state = createInitialState();
    const next = rootReducer(state, /** @type {any} */ ({ type: 'UNKNOWN' }));
    expect(next).toEqual(state);
  });
});
