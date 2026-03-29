import { describe, expect, it } from './runner.js';
import {
  countCapturedIdentitySteps,
  evaluateIdentityCaptureGuidance,
  getNextIdentityCaptureStepIndex,
  isGenerateAvatarDisabled,
  isIdentityCaptureReviewReady,
} from '../src/native/screens/identity-capture.logic.ts';

describe('identity capture submit state', () => {
  it('keeps Generate avatar disabled until exactly five photos are ready', () => {
    expect(isGenerateAvatarDisabled(0, false)).toBe(true);
    expect(isGenerateAvatarDisabled(1, false)).toBe(true);
    expect(isGenerateAvatarDisabled(4, false)).toBe(true);
    expect(isGenerateAvatarDisabled(5, false)).toBe(false);
    expect(isGenerateAvatarDisabled(6, false)).toBe(true);
  });

  it('stays disabled while upload is in progress', () => {
    expect(isGenerateAvatarDisabled(5, true)).toBe(true);
  });
});

describe('identity capture step progression', () => {
  it('counts captured steps and opens review only after all five poses are present', () => {
    const partial = {
      front: { id: 'front' },
      left: { id: 'left' },
      right: { id: 'right' },
    };

    expect(countCapturedIdentitySteps(partial)).toBe(3);
    expect(isIdentityCaptureReviewReady(partial)).toBe(false);
    expect(getNextIdentityCaptureStepIndex(partial)).toBe(3);

    const full = {
      front: { id: 'front' },
      left: { id: 'left' },
      right: { id: 'right' },
      up: { id: 'up' },
      down: { id: 'down' },
    };

    expect(countCapturedIdentitySteps(full)).toBe(5);
    expect(isIdentityCaptureReviewReady(full)).toBe(true);
    expect(getNextIdentityCaptureStepIndex(full)).toBe(4);
  });
});

describe('identity capture live guidance', () => {
  it('returns manual guidance when local detector is unavailable', () => {
    const guidance = evaluateIdentityCaptureGuidance('front', 'manual', null);

    expect(guidance.status).toBe('manual');
    expect(guidance.captureEnabled).toBe(true);
    expect(guidance.message).toBe('Сделайте фото прямо');
  });

  it('blocks capture when no face is present', () => {
    const guidance = evaluateIdentityCaptureGuidance('front', 'live', {
      faceCount: 0,
      primaryFace: null,
    });

    expect(guidance.status).toBe('no_face');
    expect(guidance.captureEnabled).toBe(false);
    expect(guidance.message).toBe('Лицо не найдено');
  });

  it('blocks capture when the face is too small', () => {
    const guidance = evaluateIdentityCaptureGuidance('front', 'live', {
      faceCount: 1,
      primaryFace: {
        areaRatio: 0.18,
        centerOffsetX: 0,
        centerOffsetY: 0,
        yawDegrees: 0,
        pitchDegrees: 0,
      },
    });

    expect(guidance.status).toBe('too_far');
    expect(guidance.captureEnabled).toBe(false);
    expect(guidance.message).toBe('Лицо слишком далеко');
  });

  it('blocks capture when the face is outside the oval', () => {
    const guidance = evaluateIdentityCaptureGuidance('front', 'live', {
      faceCount: 1,
      primaryFace: {
        areaRatio: 0.3,
        centerOffsetX: 0.2,
        centerOffsetY: 0,
        yawDegrees: 0,
        pitchDegrees: 0,
      },
    });

    expect(guidance.status).toBe('off_center');
    expect(guidance.captureEnabled).toBe(false);
    expect(guidance.message).toBe('Поместите лицо в овал');
  });

  it('enforces the requested head pose for each step', () => {
    const wrongPose = evaluateIdentityCaptureGuidance('left', 'live', {
      faceCount: 1,
      primaryFace: {
        areaRatio: 0.32,
        centerOffsetX: 0,
        centerOffsetY: 0,
        yawDegrees: 0,
        pitchDegrees: 0,
      },
    });

    expect(wrongPose.status).toBe('wrong_pose');
    expect(wrongPose.captureEnabled).toBe(false);
    expect(wrongPose.message).toBe('Поверните голову чуть влево');

    const readyPose = evaluateIdentityCaptureGuidance('left', 'live', {
      faceCount: 1,
      primaryFace: {
        areaRatio: 0.34,
        centerOffsetX: 0.02,
        centerOffsetY: 0.01,
        yawDegrees: 18,
        pitchDegrees: 0,
      },
    });

    expect(readyPose.status).toBe('ready');
    expect(readyPose.captureEnabled).toBe(true);
    expect(readyPose.message).toBe('Отлично! Снимаем');
  });
});
