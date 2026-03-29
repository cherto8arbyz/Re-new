import { create } from 'zustand';

import type { DailyLookJobStatus } from '../services/daily-look';

export interface DailyLookStoreSnapshot {
  jobId: string | null;
  status: DailyLookJobStatus;
  selectedGarmentIds: string[];
  finalImageUrl: string | null;
  prompt: string | null;
  errorMessage: string | null;
  lastUpdatedAt: number | null;
}

interface DailyLookStoreState extends DailyLookStoreSnapshot {
  setStarting: () => void;
  setJobCreated: (input: { jobId: string; status: DailyLookJobStatus; selectedGarmentIds: string[] }) => void;
  setJobStatus: (input: { status: DailyLookJobStatus; selectedGarmentIds?: string[]; prompt?: string | null }) => void;
  setJobCompleted: (input: { finalImageUrl: string; selectedGarmentIds: string[]; prompt?: string | null }) => void;
  setJobFailed: (errorMessage: string) => void;
  clearJob: () => void;
}

const INITIAL_DAILY_LOOK_STATE: DailyLookStoreSnapshot = {
  jobId: null,
  status: 'idle',
  selectedGarmentIds: [],
  finalImageUrl: null,
  prompt: null,
  errorMessage: null,
  lastUpdatedAt: null,
};

export const useDailyLookJobStore = create<DailyLookStoreState>(set => ({
  ...INITIAL_DAILY_LOOK_STATE,
  setStarting: () => set({
    ...INITIAL_DAILY_LOOK_STATE,
    status: 'starting',
    lastUpdatedAt: Date.now(),
  }),
  setJobCreated: input => set(state => ({
    ...state,
    jobId: input.jobId,
    status: input.status === 'idle' ? 'processing' : input.status,
    selectedGarmentIds: input.selectedGarmentIds,
    errorMessage: null,
    lastUpdatedAt: Date.now(),
  })),
  setJobStatus: input => set(state => ({
    ...state,
    status: input.status,
    selectedGarmentIds: input.selectedGarmentIds ?? state.selectedGarmentIds,
    prompt: input.prompt ?? state.prompt,
    errorMessage: null,
    lastUpdatedAt: Date.now(),
  })),
  setJobCompleted: input => set(state => ({
    ...state,
    status: 'completed',
    finalImageUrl: input.finalImageUrl,
    selectedGarmentIds: input.selectedGarmentIds,
    prompt: input.prompt ?? state.prompt,
    errorMessage: null,
    lastUpdatedAt: Date.now(),
  })),
  setJobFailed: errorMessage => set(state => ({
    ...state,
    status: 'failed',
    errorMessage,
    lastUpdatedAt: Date.now(),
  })),
  clearJob: () => set({ ...INITIAL_DAILY_LOOK_STATE }),
}));

export function resetDailyLookJobStore(): void {
  useDailyLookJobStore.setState({ ...INITIAL_DAILY_LOOK_STATE });
}
