import { AppState, type AppStateStatus } from 'react-native';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { AvatarGender } from '../../types/models';
import {
  createDailyLookJobAsync,
  fetchDailyLookJobAsync,
  type DailyLookAvailableGarmentInput,
  type DailyLookGenerateResponse,
  type DailyLookJobResponse,
  type DailyLookWeatherContextInput,
} from '../services/daily-look';
import { useDailyLookJobStore } from '../state/daily-look-store';

const DEFAULT_POLL_INTERVAL_MS = 4000;

interface DailyLookApiClient {
  createJob: typeof createDailyLookJobAsync;
  fetchJob: typeof fetchDailyLookJobAsync;
}

interface AppStateAdapter {
  addEventListener: (
    type: 'change',
    listener: (status: AppStateStatus) => void,
  ) => { remove: () => void };
}

interface UseDailyLookPollingInput {
  enabled?: boolean;
  accessToken: string;
  availableGarments: DailyLookAvailableGarmentInput[];
  weatherContext: DailyLookWeatherContextInput;
  gender?: AvatarGender;
  pollIntervalMs?: number;
  api?: DailyLookApiClient;
  appStateAdapter?: AppStateAdapter;
}

export function useDailyLookPolling(input: UseDailyLookPollingInput) {
  const enabled = input.enabled !== false;
  const pollIntervalMs = Math.max(1000, Math.trunc(input.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS));
  const api = useMemo<DailyLookApiClient>(() => (
    input.api ?? {
      createJob: createDailyLookJobAsync,
      fetchJob: fetchDailyLookJobAsync,
    }
  ), [input.api]);
  const appStateAdapter = useMemo<AppStateAdapter>(
    () => input.appStateAdapter ?? AppState,
    [input.appStateAdapter],
  );

  const jobId = useDailyLookJobStore(state => state.jobId);
  const status = useDailyLookJobStore(state => state.status);
  const selectedGarmentIds = useDailyLookJobStore(state => state.selectedGarmentIds);
  const finalImageUrl = useDailyLookJobStore(state => state.finalImageUrl);
  const prompt = useDailyLookJobStore(state => state.prompt);
  const errorMessage = useDailyLookJobStore(state => state.errorMessage);
  const setStarting = useDailyLookJobStore(state => state.setStarting);
  const setJobCreated = useDailyLookJobStore(state => state.setJobCreated);
  const setJobStatus = useDailyLookJobStore(state => state.setJobStatus);
  const setJobCompleted = useDailyLookJobStore(state => state.setJobCompleted);
  const setJobFailed = useDailyLookJobStore(state => state.setJobFailed);
  const clearJob = useDailyLookJobStore(state => state.clearJob);
  const pollInFlightRef = useRef(false);
  const startInFlightRef = useRef(false);
  const startupHandledRef = useRef(false);

  const startGeneration = useCallback(async () => {
    if (!enabled || startInFlightRef.current) return;

    const accessToken = String(input.accessToken || '').trim();
    if (!accessToken) {
      setJobFailed('Sign in again to generate your daily look.');
      return;
    }

    startInFlightRef.current = true;
    setStarting();

    try {
      const result: DailyLookGenerateResponse = await api.createJob({
        accessToken,
        availableGarments: input.availableGarments,
        weatherContext: input.weatherContext,
        gender: input.gender,
      });

      setJobCreated({
        jobId: result.jobId,
        status: result.status,
        selectedGarmentIds: result.selectedGarmentIds,
      });
    } catch (error) {
      setJobFailed(resolveDailyLookErrorMessage(error));
    } finally {
      startInFlightRef.current = false;
    }
  }, [
    api,
    enabled,
    input.accessToken,
    input.availableGarments,
    input.gender,
    input.weatherContext,
    setJobCreated,
    setJobFailed,
    setStarting,
  ]);

  const pollCurrentJob = useCallback(async () => {
    const accessToken = String(input.accessToken || '').trim();
    const activeJobId = String(useDailyLookJobStore.getState().jobId || '').trim();
    if (!enabled || !accessToken || !activeJobId || pollInFlightRef.current) {
      return;
    }

    pollInFlightRef.current = true;
    try {
      const result: DailyLookJobResponse = await api.fetchJob({
        accessToken,
        jobId: activeJobId,
      });

      if (result.status === 'completed' && result.finalImageUrl) {
        setJobCompleted({
          finalImageUrl: result.finalImageUrl,
          selectedGarmentIds: result.selectedGarmentIds,
          prompt: result.prompt,
        });
        return;
      }

      if (result.status === 'failed') {
        setJobFailed(result.errorMessage || 'AI stylist needs more data. Please try again.');
        return;
      }

      setJobStatus({
        status: result.status,
        selectedGarmentIds: result.selectedGarmentIds,
        prompt: result.prompt,
      });
    } catch (error) {
      setJobFailed(resolveDailyLookErrorMessage(error));
    } finally {
      pollInFlightRef.current = false;
    }
  }, [
    api,
    enabled,
    input.accessToken,
    setJobCompleted,
    setJobFailed,
    setJobStatus,
  ]);

  const generateAnotherVariant = useCallback(async () => {
    clearJob();
    await startGeneration();
  }, [clearJob, startGeneration]);

  const refreshCurrentJob = useCallback(async () => {
    const activeJobId = String(useDailyLookJobStore.getState().jobId || '').trim();
    if (!activeJobId) {
      await startGeneration();
      return;
    }

    useDailyLookJobStore.setState(state => ({
      ...state,
      status: 'processing',
      errorMessage: null,
      lastUpdatedAt: Date.now(),
    }));
    await pollCurrentJob();
  }, [pollCurrentJob, startGeneration]);

  useEffect(() => {
    if (!enabled || startupHandledRef.current) return;
    startupHandledRef.current = true;

    const snapshot = useDailyLookJobStore.getState();
    const hasJobId = Boolean(String(snapshot.jobId || '').trim());
    if (!hasJobId && snapshot.status === 'idle') {
      void startGeneration();
    }
  }, [enabled, startGeneration]);

  useEffect(() => {
    if (!enabled) return;
    if (!jobId) return;
    if (status === 'completed' || status === 'failed' || status === 'idle') return;

    void pollCurrentJob();
    const intervalId = setInterval(() => {
      void pollCurrentJob();
    }, pollIntervalMs);
    const subscription = appStateAdapter.addEventListener('change', nextStatus => {
      if (nextStatus === 'active') {
        void pollCurrentJob();
      }
    });

    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, [appStateAdapter, enabled, jobId, pollCurrentJob, pollIntervalMs, status]);

  return {
    jobId,
    status,
    selectedGarmentIds,
    finalImageUrl,
    prompt,
    errorMessage,
    isLoading: status !== 'completed' && status !== 'failed',
    startGeneration,
    generateAnotherVariant,
    refreshCurrentJob,
  };
}

function resolveDailyLookErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return 'AI stylist needs more data. Please try again.';
}
