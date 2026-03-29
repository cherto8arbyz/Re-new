export interface FaceCaptureDetectorAvailability {
  isSupported: boolean;
  mode: 'live' | 'manual';
  reason: string | null;
}

export async function resolveFaceCaptureDetectorAvailabilityAsync(): Promise<FaceCaptureDetectorAvailability> {
  return {
    isSupported: false,
    mode: 'manual',
    reason: 'На этом устройстве живые подсказки недоступны, поэтому включен ручной режим с серверной проверкой.',
  };
}
