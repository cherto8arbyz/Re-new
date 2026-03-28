import { describe, it, expect } from './runner.js';
import { createStore } from '../src/state/store.js';

describe('Store', () => {
  /** @param {{ count: number }} state @param {{ type: string, payload?: any }} action */
  const counterReducer = (state, action) => {
    switch (action.type) {
      case 'INCREMENT': return { ...state, count: state.count + 1 };
      case 'DECREMENT': return { ...state, count: state.count - 1 };
      case 'SET': return { ...state, count: action.payload };
      default: return state;
    }
  };

  it('returns initial state via getState', () => {
    const store = createStore(counterReducer, { count: 0 });
    expect(store.getState().count).toBe(0);
  });

  it('updates state via dispatch', () => {
    const store = createStore(counterReducer, { count: 0 });
    store.dispatch({ type: 'INCREMENT' });
    expect(store.getState().count).toBe(1);
  });

  it('calls subscribers on dispatch', () => {
    const store = createStore(counterReducer, { count: 0 });
    let called = 0;
    store.subscribe(() => { called++; });
    store.dispatch({ type: 'INCREMENT' });
    expect(called).toBe(1);
  });

  it('unsubscribe prevents further notifications', () => {
    const store = createStore(counterReducer, { count: 0 });
    let called = 0;
    const unsub = store.subscribe(() => { called++; });
    store.dispatch({ type: 'INCREMENT' });
    unsub();
    store.dispatch({ type: 'INCREMENT' });
    expect(called).toBe(1);
  });

  it('state is frozen (immutable)', () => {
    const store = createStore(counterReducer, { count: 0 });
    const state = store.getState();
    try {
      // @ts-ignore — intentional mutation test
      state.count = 999;
    } catch {}
    // In strict mode, assignment to frozen object throws.
    // In non-strict it silently fails. Check the value didn't change.
    expect(store.getState().count).toBe(0);
  });

  it('handles multiple sequential dispatches', () => {
    const store = createStore(counterReducer, { count: 0 });
    store.dispatch({ type: 'INCREMENT' });
    store.dispatch({ type: 'INCREMENT' });
    store.dispatch({ type: 'DECREMENT' });
    expect(store.getState().count).toBe(1);
  });

  it('passes payload to reducer', () => {
    const store = createStore(counterReducer, { count: 0 });
    store.dispatch({ type: 'SET', payload: 42 });
    expect(store.getState().count).toBe(42);
  });

  it('unknown action returns state unchanged', () => {
    const store = createStore(counterReducer, { count: 5 });
    store.dispatch({ type: 'UNKNOWN' });
    expect(store.getState().count).toBe(5);
  });
});
