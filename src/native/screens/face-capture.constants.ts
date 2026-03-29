export type IdentityCaptureStepId = 'front' | 'left' | 'right' | 'up' | 'down';

export interface IdentityCaptureStepDefinition {
  id: IdentityCaptureStepId;
  title: string;
  instruction: string;
  reviewLabel: string;
  yawRange: {
    min: number;
    max: number;
  };
  pitchRange: {
    min: number;
    max: number;
  };
}

export const IDENTITY_CAPTURE_REQUIRED_PHOTO_COUNT = 5;
export const FACE_CAPTURE_MIN_FACE_AREA_RATIO = 0.26;
export const FACE_CAPTURE_MAX_CENTER_OFFSET_X = 0.14;
export const FACE_CAPTURE_MAX_CENTER_OFFSET_Y = 0.14;
export const FACE_CAPTURE_READY_HOLD_MS = 450;
export const FACE_CAPTURE_CAMERA_RATIO = 3 / 4;

export const FACE_CAPTURE_OVERLAY = {
  widthRatio: 0.66,
  heightRatio: 0.78,
  centerYOffsetRatio: -0.03,
} as const;

export const IDENTITY_CAPTURE_STEPS: readonly IdentityCaptureStepDefinition[] = [
  {
    id: 'front',
    title: 'Шаг 1 из 5',
    instruction: 'Сделайте фото прямо',
    reviewLabel: 'Прямо',
    yawRange: { min: -8, max: 8 },
    pitchRange: { min: -8, max: 8 },
  },
  {
    id: 'left',
    title: 'Шаг 2 из 5',
    instruction: 'Поверните голову чуть влево',
    reviewLabel: 'Влево',
    yawRange: { min: 15, max: 26 },
    pitchRange: { min: -12, max: 12 },
  },
  {
    id: 'right',
    title: 'Шаг 3 из 5',
    instruction: 'Поверните голову чуть вправо',
    reviewLabel: 'Вправо',
    yawRange: { min: -26, max: -15 },
    pitchRange: { min: -12, max: 12 },
  },
  {
    id: 'up',
    title: 'Шаг 4 из 5',
    instruction: 'Поднимите подбородок чуть вверх',
    reviewLabel: 'Вверх',
    yawRange: { min: -12, max: 12 },
    pitchRange: { min: 10, max: 20 },
  },
  {
    id: 'down',
    title: 'Шаг 5 из 5',
    instruction: 'Опустите подбородок чуть вниз',
    reviewLabel: 'Вниз',
    yawRange: { min: -12, max: 12 },
    pitchRange: { min: -20, max: -10 },
  },
] as const;
