import { describe, it, expect } from './runner.js';
import { createStore } from '../src/state/store.js';
import { rootReducer } from '../src/state/reducers.js';
import { createInitialState } from '../src/state/app-state.js';
import {
  addChatMessage,
  setChatLoading,
  setChatError,
  clearChat,
  setAiLoading,
  setAiError,
  ActionType,
} from '../src/state/actions.js';

describe('Chat State — actions', () => {
  it('should create addChatMessage action', () => {
    const action = addChatMessage({ role: 'user', text: 'Hello' });
    expect(action.type).toBe(ActionType.ADD_CHAT_MESSAGE);
    expect(action.payload.role).toBe('user');
    expect(action.payload.text).toBe('Hello');
  });

  it('should create setChatLoading action', () => {
    const action = setChatLoading(true);
    expect(action.type).toBe(ActionType.SET_CHAT_LOADING);
    expect(action.payload).toBe(true);
  });

  it('should create setChatError action', () => {
    const action = setChatError('Network error');
    expect(action.type).toBe(ActionType.SET_CHAT_ERROR);
    expect(action.payload).toBe('Network error');
  });

  it('should create clearChat action', () => {
    const action = clearChat();
    expect(action.type).toBe(ActionType.CLEAR_CHAT);
  });

  it('should create setAiLoading action', () => {
    const action = setAiLoading(true);
    expect(action.type).toBe(ActionType.SET_AI_LOADING);
    expect(action.payload).toBe(true);
  });

  it('should create setAiError action', () => {
    const action = setAiError('AI failed');
    expect(action.type).toBe(ActionType.SET_AI_ERROR);
    expect(action.payload).toBe('AI failed');
  });
});

describe('Chat State — reducers', () => {
  it('should add a chat message to state', () => {
    const store = createStore(rootReducer, createInitialState());
    store.dispatch(addChatMessage({ role: 'user', text: 'Hi there' }));

    const state = store.getState();
    expect(state.chatMessages).toHaveLength(1);
    expect(state.chatMessages[0].role).toBe('user');
    expect(state.chatMessages[0].text).toBe('Hi there');
  });

  it('should accumulate multiple messages', () => {
    const store = createStore(rootReducer, createInitialState());
    store.dispatch(addChatMessage({ role: 'user', text: 'Hello' }));
    store.dispatch(addChatMessage({ role: 'model', text: 'Hi! How can I help?' }));
    store.dispatch(addChatMessage({ role: 'user', text: 'What to wear?' }));

    const state = store.getState();
    expect(state.chatMessages).toHaveLength(3);
    expect(state.chatMessages[1].role).toBe('model');
  });

  it('should set chat loading state', () => {
    const store = createStore(rootReducer, createInitialState());
    store.dispatch(setChatLoading(true));
    expect(store.getState().chatLoading).toBe(true);

    store.dispatch(setChatLoading(false));
    expect(store.getState().chatLoading).toBe(false);
  });

  it('should set chat error', () => {
    const store = createStore(rootReducer, createInitialState());
    store.dispatch(setChatError('Something went wrong'));
    expect(store.getState().chatError).toBe('Something went wrong');
  });

  it('should clear chat error when null is dispatched', () => {
    const store = createStore(rootReducer, createInitialState());
    store.dispatch(setChatError('Error'));
    store.dispatch(setChatError(null));
    expect(store.getState().chatError).toBeNull();
  });

  it('should clear all chat messages', () => {
    const store = createStore(rootReducer, createInitialState());
    store.dispatch(addChatMessage({ role: 'user', text: 'Hello' }));
    store.dispatch(addChatMessage({ role: 'model', text: 'Hi!' }));
    store.dispatch(clearChat());

    expect(store.getState().chatMessages).toHaveLength(0);
    expect(store.getState().chatError).toBeNull();
  });

  it('should set AI loading state', () => {
    const store = createStore(rootReducer, createInitialState());
    store.dispatch(setAiLoading(true));
    expect(store.getState().aiLoading).toBe(true);
  });

  it('should set AI error', () => {
    const store = createStore(rootReducer, createInitialState());
    store.dispatch(setAiError('Gemini unavailable'));
    expect(store.getState().aiError).toBe('Gemini unavailable');
  });

  it('should have correct initial chat state', () => {
    const state = createInitialState();
    expect(state.chatMessages).toHaveLength(0);
    expect(state.chatLoading).toBe(false);
    expect(state.chatError).toBeNull();
    expect(state.aiLoading).toBe(false);
    expect(state.aiError).toBeNull();
  });
});
