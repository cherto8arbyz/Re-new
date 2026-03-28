/**
 * @template S
 * @template {{ type: string, payload?: any }} A
 * @typedef {(state: S, action: A) => S} Reducer
 */

/**
 * @template S
 * @template {{ type: string, payload?: any }} A
 * @typedef {Object} Store
 * @property {() => S} getState
 * @property {(action: A) => void} dispatch
 * @property {(listener: (state: S) => void) => () => void} subscribe
 */

/**
 * Creates a minimal reactive store with immutable state.
 * @template S
 * @template {{ type: string, payload?: any }} A
 * @param {(state: S, action: A) => S} reducer
 * @param {S} initialState
 * @returns {Store<S, A>}
 */
export function createStore(reducer, initialState) {
  let state = Object.freeze(/** @type {any} */ (structuredClone(initialState)));
  /** @type {Set<(state: S) => void>} */
  const listeners = new Set();

  function getState() {
    return state;
  }

  /** @param {A} action */
  function dispatch(action) {
    const nextState = reducer(state, action);
    state = Object.freeze(/** @type {any} */ (nextState));
    for (const listener of listeners) {
      listener(state);
    }
  }

  /** @param {(state: S) => void} listener */
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { getState, dispatch, subscribe };
}
