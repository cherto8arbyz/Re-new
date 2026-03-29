import {
  FACE_CAPTURE_MAX_CENTER_OFFSET_X,
  FACE_CAPTURE_MAX_CENTER_OFFSET_Y,
  FACE_CAPTURE_MIN_FACE_AREA_RATIO,
  IDENTITY_CAPTURE_REQUIRED_PHOTO_COUNT,
  IDENTITY_CAPTURE_STEPS,
  type IdentityCaptureStepDefinition,
  type IdentityCaptureStepId,
} from './face-capture.constants.ts';

export const MIN_IDENTITY_PHOTO_COUNT = IDENTITY_CAPTURE_REQUIRED_PHOTO_COUNT;
export const MAX_IDENTITY_PHOTO_COUNT = IDENTITY_CAPTURE_REQUIRED_PHOTO_COUNT;
export const MAX_IDENTITY_UPLOAD_BYTES = 2 * 1024 * 1024;
export const IDENTITY_IMAGE_MAX_DIMENSION = 1024;

export type IdentityCapturePhotoRecord<T> = Partial<Record<IdentityCaptureStepId, T>>;

export interface IdentityFaceObservation {
  faceCount: number;
  primaryFace?: {
    areaRatio: number;
    centerOffsetX: number;
    centerOffsetY: number;
    yawDegrees?: number | null;
    pitchDegrees?: number | null;
  } | null;
}

export interface IdentityCaptureGuidanceResult {
  status: 'manual' | 'no_face' | 'multiple_faces' | 'too_far' | 'off_center' | 'wrong_pose' | 'ready';
  message: string;
  captureEnabled: boolean;
}

export function getIdentityCaptureSteps(): readonly IdentityCaptureStepDefinition[] {
  return IDENTITY_CAPTURE_STEPS;
}

export function getIdentityCaptureStep(index: number): IdentityCaptureStepDefinition {
  return IDENTITY_CAPTURE_STEPS[normalizeStepIndex(index)];
}

export function getIdentityProgressLabel(photoCount: number): string {
  return `${normalizePhotoCount(photoCount)}/${MIN_IDENTITY_PHOTO_COUNT}`;
}

export function getIdentityProgressRatio(photoCount: number): number {
  return Math.min(normalizePhotoCount(photoCount) / MIN_IDENTITY_PHOTO_COUNT, 1);
}

export function getRemainingIdentitySlots(photoCount: number): number {
  return Math.max(MAX_IDENTITY_PHOTO_COUNT - normalizePhotoCount(photoCount), 0);
}

export function isGenerateAvatarDisabled(photoCount: number, isUploading: boolean): boolean {
  if (isUploading) return true;
  return normalizePhotoCount(photoCount) !== MIN_IDENTITY_PHOTO_COUNT;
}

export function countCapturedIdentitySteps<T>(photos: IdentityCapturePhotoRecord<T>): number {
  return IDENTITY_CAPTURE_STEPS.reduce((count, step) => (
    photos[step.id] ? count + 1 : count
  ), 0);
}

export function isIdentityCaptureReviewReady<T>(photos: IdentityCapturePhotoRecord<T>): boolean {
  return countCapturedIdentitySteps(photos) === IDENTITY_CAPTURE_REQUIRED_PHOTO_COUNT;
}

export function getNextIdentityCaptureStepIndex<T>(photos: IdentityCapturePhotoRecord<T>): number {
  const nextIndex = IDENTITY_CAPTURE_STEPS.findIndex(step => !photos[step.id]);
  return nextIndex >= 0 ? nextIndex : IDENTITY_CAPTURE_STEPS.length - 1;
}

export function evaluateIdentityCaptureGuidance(
  stepId: IdentityCaptureStepId,
  mode: 'manual' | 'live',
  observation?: IdentityFaceObservation | null,
): IdentityCaptureGuidanceResult {
  const step = IDENTITY_CAPTURE_STEPS.find(entry => entry.id === stepId) || IDENTITY_CAPTURE_STEPS[0];

  if (mode === 'manual') {
    return {
      status: 'manual',
      message: step.instruction,
      captureEnabled: true,
    };
  }

  if (!observation || observation.faceCount <= 0 || !observation.primaryFace) {
    return {
      status: 'no_face',
      message: 'Лицо не найдено',
      captureEnabled: false,
    };
  }

  if (observation.faceCount > 1) {
    return {
      status: 'multiple_faces',
      message: 'В кадре должно быть только одно лицо',
      captureEnabled: false,
    };
  }

  if (observation.primaryFace.areaRatio < FACE_CAPTURE_MIN_FACE_AREA_RATIO) {
    return {
      status: 'too_far',
      message: 'Лицо слишком далеко',
      captureEnabled: false,
    };
  }

  if (
    Math.abs(observation.primaryFace.centerOffsetX) > FACE_CAPTURE_MAX_CENTER_OFFSET_X ||
    Math.abs(observation.primaryFace.centerOffsetY) > FACE_CAPTURE_MAX_CENTER_OFFSET_Y
  ) {
    return {
      status: 'off_center',
      message: 'Поместите лицо в овал',
      captureEnabled: false,
    };
  }

  const yawDegrees = Number(observation.primaryFace.yawDegrees ?? 0);
  const pitchDegrees = Number(observation.primaryFace.pitchDegrees ?? 0);
  if (
    yawDegrees < step.yawRange.min ||
    yawDegrees > step.yawRange.max ||
    pitchDegrees < step.pitchRange.min ||
    pitchDegrees > step.pitchRange.max
  ) {
    return {
      status: 'wrong_pose',
      message: step.instruction,
      captureEnabled: false,
    };
  }

  return {
    status: 'ready',
    message: 'Отлично! Снимаем',
    captureEnabled: true,
  };
}

export function getIdentityStepReviewLabel(stepId: IdentityCaptureStepId): string {
  return (IDENTITY_CAPTURE_STEPS.find(step => step.id === stepId) || IDENTITY_CAPTURE_STEPS[0]).reviewLabel;
}

function normalizePhotoCount(photoCount: number): number {
  if (!Number.isFinite(photoCount)) return 0;
  return Math.max(0, Math.trunc(photoCount));
}

function normalizeStepIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(IDENTITY_CAPTURE_STEPS.length - 1, Math.trunc(index)));
}
