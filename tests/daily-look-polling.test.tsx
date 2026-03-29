import React from 'react';
import { Text, View } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';

import { useDailyLookPolling } from '../src/native/screens/useDailyLookPolling';
import { resetDailyLookJobStore } from '../src/native/state/daily-look-store';

function PollingProbe({
  api,
  appStateAdapter,
}: {
  api: {
    createJob: Parameters<typeof useDailyLookPolling>[0]['api'] extends infer T
      ? NonNullable<T>['createJob']
      : never;
    fetchJob: Parameters<typeof useDailyLookPolling>[0]['api'] extends infer T
      ? NonNullable<T>['fetchJob']
      : never;
  };
  appStateAdapter: {
    addEventListener: Parameters<typeof useDailyLookPolling>[0]['appStateAdapter'] extends infer T
      ? NonNullable<T>['addEventListener']
      : never;
  };
}) {
  const result = useDailyLookPolling({
    enabled: true,
    accessToken: 'test-access-token',
    availableGarments: [
      {
        garment_id: 'garment-1',
        image_url: 'https://example.com/garment-1.webp',
        category: 'shirt',
        color: 'white',
      },
    ],
    weatherContext: {
      temperature_celsius: 19,
      condition: 'clear',
    },
    pollIntervalMs: 4000,
    api,
    appStateAdapter,
  });

  return (
    <View>
      <Text testID="daily-look-status">{result.status}</Text>
      <Text testID="daily-look-image-url">{result.finalImageUrl || ''}</Text>
      <Text testID="daily-look-selected">{result.selectedGarmentIds.join(',')}</Text>
    </View>
  );
}

describe('useDailyLookPolling', () => {
  beforeEach(() => {
    act(() => {
      resetDailyLookJobStore();
    });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    act(() => {
      resetDailyLookJobStore();
    });
  });

  it('moves from loading to success when the polled job completes', async () => {
    const api = {
      createJob: jest.fn().mockResolvedValue({
        jobId: 'job-1',
        status: 'processing',
        selectedGarmentIds: ['garment-1'],
      }),
      fetchJob: jest.fn()
        .mockResolvedValueOnce({
          id: 'job-1',
          userId: 'user-1',
          status: 'processing',
          selectedGarmentIds: ['garment-1'],
          weatherContext: {},
          prompt: null,
          finalImageUrl: null,
          errorMessage: null,
          createdAt: '2026-03-29T10:00:00.000Z',
          completedAt: null,
        })
        .mockResolvedValueOnce({
          id: 'job-1',
          userId: 'user-1',
          status: 'completed',
          selectedGarmentIds: ['garment-1', 'garment-2'],
          weatherContext: {},
          prompt: 'Weather-ready layered look',
          finalImageUrl: 'https://example.com/final-look.webp',
          errorMessage: null,
          createdAt: '2026-03-29T10:00:00.000Z',
          completedAt: '2026-03-29T10:00:22.000Z',
        }),
    };
    const appStateAdapter = {
      addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    };

    render(<PollingProbe api={api} appStateAdapter={appStateAdapter} />);

    expect(screen.getByTestId('daily-look-status').props.children).toBe('starting');

    await waitFor(() => {
      expect(api.createJob).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(api.fetchJob).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId('daily-look-status').props.children).toBe('processing');
    });

    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(api.fetchJob).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId('daily-look-status').props.children).toBe('completed');
    });
    expect(screen.getByTestId('daily-look-image-url').props.children).toBe('https://example.com/final-look.webp');
    expect(screen.getByTestId('daily-look-selected').props.children).toBe('garment-1,garment-2');
  });
});
