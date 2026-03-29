import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, type CameraCapturedPicture, useCameraPermissions } from 'expo-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from 'expo/node_modules/@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { resolveAuthAccessToken } from '../../shared/onboarding';
import type { PickedImageAsset } from '../services/image-picker';
import {
  resolveFaceCaptureDetectorAvailabilityAsync,
  type FaceCaptureDetectorAvailability,
} from '../services/face-capture-detector';
import {
  IdentityUploadError,
  prepareIdentityPhotoForUploadAsync,
  type PreparedIdentityPhoto,
  uploadIdentityReferencePhotosAsync,
} from '../services/identity-upload';
import { useAppContext } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';
import type { ThemeTokens } from '../theme';
import {
  FACE_CAPTURE_CAMERA_RATIO,
  FACE_CAPTURE_OVERLAY,
  IDENTITY_CAPTURE_STEPS,
  type IdentityCaptureStepId,
} from './face-capture.constants';
import {
  countCapturedIdentitySteps,
  evaluateIdentityCaptureGuidance,
  getIdentityCaptureStep,
  getIdentityCaptureSteps,
  getIdentityProgressLabel,
  getIdentityStepReviewLabel,
  getNextIdentityCaptureStepIndex,
  isGenerateAvatarDisabled,
  isIdentityCaptureReviewReady,
  type IdentityCapturePhotoRecord,
} from './identity-capture.logic';

type Props = NativeStackScreenProps<RootStackParamList, 'IdentityCapture'>;

type ScreenMode = 'capture' | 'preview' | 'review';

export function IdentityCaptureScreen({ navigation }: Props) {
  const { state, dispatch, theme } = useAppContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const cameraRef = useRef<CameraView | null>(null);
  const permissionRequestedRef = useRef(false);

  const [permissionResponse, requestPermission] = useCameraPermissions();
  const [screenMode, setScreenMode] = useState<ScreenMode>('capture');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraMountError, setCameraMountError] = useState<string | null>(null);
  const [detectorAvailability, setDetectorAvailability] = useState<FaceCaptureDetectorAvailability>({
    isSupported: false,
    mode: 'manual',
    reason: null,
  });
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [capturedPhotos, setCapturedPhotos] = useState<IdentityCapturePhotoRecord<PreparedIdentityPhoto>>({});
  const [previewPhoto, setPreviewPhoto] = useState<PreparedIdentityPhoto | null>(null);
  const [previewStepId, setPreviewStepId] = useState<IdentityCaptureStepId | null>(null);
  const [returnToReviewAfterPreview, setReturnToReviewAfterPreview] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedStepId, setFailedStepId] = useState<IdentityCaptureStepId | null>(null);

  const steps = getIdentityCaptureSteps();
  const activeStep = getIdentityCaptureStep(activeStepIndex);
  const capturedCount = countCapturedIdentitySteps(capturedPhotos);
  const progressLabel = getIdentityProgressLabel(capturedCount);
  const isReviewReady = isIdentityCaptureReviewReady(capturedPhotos);
  const guidance = evaluateIdentityCaptureGuidance(activeStep.id, detectorAvailability.mode, null);
  const orderedPreparedPhotos = useMemo(
    () => steps.map(step => capturedPhotos[step.id]).filter((photo): photo is PreparedIdentityPhoto => Boolean(photo)),
    [capturedPhotos, steps],
  );
  const submitDisabled = isGenerateAvatarDisabled(orderedPreparedPhotos.length, isUploading);
  const captureDisabled = (
    isPreparing
    || isUploading
    || !cameraReady
    || (detectorAvailability.mode === 'live' && !guidance.captureEnabled)
  );

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const availability = await resolveFaceCaptureDetectorAvailabilityAsync();
      if (!isMounted) return;
      setDetectorAvailability(availability);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (permissionRequestedRef.current) return;
    if (permissionResponse?.granted) return;

    permissionRequestedRef.current = true;
    void requestPermission();
  }, [permissionResponse, requestPermission]);

  const handleCaptureStep = useCallback(async () => {
    if (captureDisabled) {
      if (!cameraReady) {
        setError('Камера еще запускается. Попробуйте через секунду.');
      } else if (detectorAvailability.mode === 'live' && !guidance.captureEnabled) {
        setError(guidance.message);
      }
      return;
    }

    if (!cameraRef.current) {
      setError('Превью камеры недоступно.');
      return;
    }

    setError(null);
    setFailedStepId(null);
    setIsPreparing(true);

    try {
      const capturedPicture = await cameraRef.current.takePictureAsync({
        quality: 1,
        exif: false,
        base64: false,
        skipProcessing: false,
      });
      const prepared = await prepareIdentityPhotoForUploadAsync(
        mapCapturedPictureToPickedAsset(capturedPicture, activeStep.id),
        activeStepIndex + 1,
      );

      setPreviewPhoto(prepared);
      setPreviewStepId(activeStep.id);
      setScreenMode('preview');
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : 'Не удалось сделать фото.');
    } finally {
      setIsPreparing(false);
    }
  }, [activeStep.id, activeStepIndex, cameraReady, captureDisabled, detectorAvailability.mode, guidance.captureEnabled, guidance.message]);

  const handleUsePreview = useCallback(() => {
    if (!previewPhoto || !previewStepId) return;

    const nextPhotos = {
      ...capturedPhotos,
      [previewStepId]: previewPhoto,
    };
    const nextStepIndex = getNextIdentityCaptureStepIndex(nextPhotos);
    const readyForReview = isIdentityCaptureReviewReady(nextPhotos);

    setCapturedPhotos(nextPhotos);
    setActiveStepIndex(nextStepIndex);
    setScreenMode(readyForReview || returnToReviewAfterPreview ? 'review' : 'capture');
    setPreviewPhoto(null);
    setPreviewStepId(null);
    setReturnToReviewAfterPreview(false);
  }, [capturedPhotos, previewPhoto, previewStepId, returnToReviewAfterPreview]);

  const handleRetakeCurrentPreview = useCallback(() => {
    setPreviewPhoto(null);
    setPreviewStepId(null);
    setScreenMode('capture');
  }, []);

  const handleOpenReview = useCallback(() => {
    if (!isReviewReady) return;
    setScreenMode('review');
    setError(null);
  }, [isReviewReady]);

  const handleRetakeStep = useCallback((stepId: IdentityCaptureStepId) => {
    const targetIndex = steps.findIndex(step => step.id === stepId);
    setPreviewPhoto(null);
    setPreviewStepId(null);
    setReturnToReviewAfterPreview(true);
    setActiveStepIndex(targetIndex >= 0 ? targetIndex : 0);
    setScreenMode('capture');
    setError(null);
    setFailedStepId(null);
  }, [steps]);

  const handleSubmit = useCallback(async () => {
    if (submitDisabled) {
      setError('Нужно подтвердить ровно 5 ракурсов перед отправкой.');
      return;
    }

    const accessToken = resolveAuthAccessToken(state.authSession, state.user?.id);
    if (!accessToken) {
      setError('Сессия истекла. Войдите снова перед загрузкой identity-фото.');
      return;
    }

    setIsUploading(true);
    setError(null);
    setFailedStepId(null);

    try {
      const result = await uploadIdentityReferencePhotosAsync({
        photos: orderedPreparedPhotos,
        accessToken,
      });
      dispatch({ type: 'SET_IDENTITY_REFERENCE_URLS', payload: result.referenceUrls });
      Alert.alert(
        'Identity готов',
        'Пять фото прошли проверку и сохранены для генерации аватара.',
      );
      navigation.goBack();
    } catch (uploadError) {
      if (uploadError instanceof IdentityUploadError) {
        const failedIndex = typeof uploadError.failedIndex === 'number' ? uploadError.failedIndex : -1;
        const failedStep = steps[failedIndex]?.id || null;
        setFailedStepId(failedStep);
        setError(uploadError.message);
        setScreenMode('review');
      } else {
        setError(uploadError instanceof Error ? uploadError.message : 'Не удалось загрузить identity-фото.');
      }
    } finally {
      setIsUploading(false);
    }
  }, [dispatch, navigation, orderedPreparedPhotos, state.authSession, state.user?.id, steps, submitDisabled]);

  if (!permissionResponse || (!permissionResponse.granted && permissionResponse.canAskAgain)) {
    return (
      <SafeAreaView style={styles.safe}>
        <PermissionGate
          loading={!permissionResponse}
          onGrantPress={() => void requestPermission()}
          onBackPress={() => navigation.goBack()}
          theme={theme}
        />
      </SafeAreaView>
    );
  }

  if (!permissionResponse.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <PermissionBlocked
          onBackPress={() => navigation.goBack()}
          onOpenSettings={() => void Linking.openSettings()}
          theme={theme}
        />
      </SafeAreaView>
    );
  }

  const supportText = screenMode === 'preview'
    ? 'Проверьте свет, фокус и положение головы. Если ракурс плохой, переснимите его сейчас.'
    : detectorAvailability.mode === 'manual'
      ? (detectorAvailability.reason || 'Держите лицо внутри овала и снимайте каждый ракурс последовательно.')
      : (cameraMountError || guidance.message);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={18} color={theme.colors.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>Identity capture</Text>
            <Text style={styles.headerTitle}>
              {screenMode === 'review' ? 'Проверьте 5 ракурсов' : activeStep.title}
            </Text>
          </View>
          <View style={styles.progressBadge}>
            <Text style={styles.progressBadgeText}>{progressLabel}</Text>
          </View>
        </View>

        <StepRail
          activeStepIndex={activeStepIndex}
          capturedPhotos={capturedPhotos}
          failedStepId={failedStepId}
          theme={theme}
        />

        {screenMode === 'review' ? (
          <ScrollView contentContainerStyle={styles.reviewContent} showsVerticalScrollIndicator={false}>
            <View style={styles.reviewIntro}>
              <Text style={styles.reviewTitle}>Сводка из 5 фото</Text>
              <Text style={styles.reviewText}>
                Нажмите на любой кадр, если хотите переснять конкретный ракурс до отправки на сервер.
              </Text>
            </View>

            <View style={styles.reviewGrid}>
              {steps.map(step => {
                const photo = capturedPhotos[step.id];
                const hasFailure = failedStepId === step.id;
                return (
                  <Pressable
                    key={step.id}
                    onPress={() => handleRetakeStep(step.id)}
                    style={[styles.reviewCard, hasFailure && styles.reviewCardFailure]}
                  >
                    {photo ? (
                      <Image source={{ uri: photo.previewUri }} resizeMode="cover" style={styles.reviewImage} />
                    ) : (
                      <View style={styles.reviewPlaceholder}>
                        <Ionicons name="camera-outline" size={28} color={theme.colors.muted} />
                      </View>
                    )}
                    <View style={styles.reviewMeta}>
                      <Text style={styles.reviewLabel}>{getIdentityStepReviewLabel(step.id)}</Text>
                      <Text style={styles.reviewRetake}>Нажмите, чтобы переснять</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={() => void handleSubmit()}
              disabled={submitDisabled}
              style={[styles.submitButton, submitDisabled && styles.submitButtonDisabled]}
            >
              {isUploading ? <ActivityIndicator size="small" color={theme.colors.accentContrast} /> : null}
              <Text style={styles.submitText}>Сгенерировать аватар</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <>
            <View style={styles.cameraShell}>
              {screenMode === 'preview' && previewPhoto ? (
                <Image source={{ uri: previewPhoto.previewUri }} resizeMode="cover" style={styles.cameraPreviewImage} />
              ) : (
                <>
                  <CameraView
                    ref={cameraRef}
                    facing="front"
                    mirror
                    mode="picture"
                    style={styles.camera}
                    onCameraReady={() => {
                      setCameraReady(true);
                      setCameraMountError(null);
                    }}
                    onMountError={event => {
                      setCameraReady(false);
                      setCameraMountError(event.message || 'Камера не смогла открыться.');
                    }}
                  />
                  <View pointerEvents="none" style={styles.overlay}>
                    <View style={styles.overlayTop} />
                    <View style={styles.overlayMiddle}>
                      <View style={styles.overlaySide} />
                      <View
                        style={[
                          styles.faceOval,
                          guidance.captureEnabled ? styles.faceOvalReady : styles.faceOvalNeutral,
                        ]}
                      />
                      <View style={styles.overlaySide} />
                    </View>
                    <View style={styles.overlayBottom} />
                  </View>
                </>
              )}
            </View>

            <View style={styles.bottomPanel}>
              <Text style={styles.stepPrompt}>
                {screenMode === 'preview' ? 'Проверьте этот ракурс' : activeStep.instruction}
              </Text>
              <Text style={styles.stepSupport}>{supportText}</Text>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <View style={styles.captureActions}>
                {screenMode === 'preview' ? (
                  <>
                    <Pressable onPress={handleRetakeCurrentPreview} style={[styles.secondaryAction, styles.flexAction]}>
                      <Text style={styles.secondaryActionText}>Переснять ракурс</Text>
                    </Pressable>
                    <Pressable onPress={handleUsePreview} style={[styles.primaryAction, styles.flexAction]}>
                      <Text style={styles.primaryActionText}>Использовать фото</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      onPress={handleOpenReview}
                      disabled={!isReviewReady}
                      style={[styles.secondaryAction, styles.flexAction, !isReviewReady && styles.disabledAction]}
                    >
                      <Text style={styles.secondaryActionText}>Сетка 5 фото</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void handleCaptureStep()}
                      disabled={captureDisabled}
                      style={[styles.primaryAction, styles.flexAction, captureDisabled && styles.disabledAction]}
                    >
                      {isPreparing ? <ActivityIndicator size="small" color={theme.colors.accentContrast} /> : null}
                      <Text style={styles.primaryActionText}>Сделать фото</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function mapCapturedPictureToPickedAsset(
  picture: CameraCapturedPicture,
  stepId: IdentityCaptureStepId,
): PickedImageAsset {
  return {
    uri: picture.uri,
    width: picture.width,
    height: picture.height,
    fileName: `identity-${stepId}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: null,
    base64: null,
  };
}

function PermissionGate({
  loading,
  onGrantPress,
  onBackPress,
  theme,
}: {
  loading: boolean;
  onGrantPress: () => void;
  onBackPress: () => void;
  theme: ThemeTokens;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.permissionShell}>
      <Text style={styles.permissionTitle}>Готовим камеру</Text>
      <Text style={styles.permissionText}>
        {loading
          ? 'Проверяем доступ к фронтальной камере.'
          : 'Без камеры нельзя собрать 5 контрольных ракурсов для вашего цифрового двойника.'}
      </Text>
      <View style={styles.permissionActions}>
        <Pressable onPress={onBackPress} style={[styles.secondaryAction, styles.flexAction]}>
          <Text style={styles.secondaryActionText}>Назад</Text>
        </Pressable>
        <Pressable onPress={onGrantPress} style={[styles.primaryAction, styles.flexAction]}>
          <Text style={styles.primaryActionText}>Разрешить камеру</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PermissionBlocked({
  onBackPress,
  onOpenSettings,
  theme,
}: {
  onBackPress: () => void;
  onOpenSettings: () => void;
  theme: ThemeTokens;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.permissionShell}>
      <Text style={styles.permissionTitle}>Камера нужна для создания вашего цифрового двойника</Text>
      <Text style={styles.permissionText}>
        Мы перешли на строгую живую съемку из 5 ракурсов. Дайте доступ к камере и вернитесь на этот экран.
      </Text>
      <View style={styles.permissionActions}>
        <Pressable onPress={onBackPress} style={[styles.secondaryAction, styles.flexAction]}>
          <Text style={styles.secondaryActionText}>Назад</Text>
        </Pressable>
        <Pressable onPress={onOpenSettings} style={[styles.primaryAction, styles.flexAction]}>
          <Text style={styles.primaryActionText}>Открыть настройки</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StepRail({
  activeStepIndex,
  capturedPhotos,
  failedStepId,
  theme,
}: {
  activeStepIndex: number;
  capturedPhotos: IdentityCapturePhotoRecord<PreparedIdentityPhoto>;
  failedStepId: IdentityCaptureStepId | null;
  theme: ThemeTokens;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.stepRail}>
      {IDENTITY_CAPTURE_STEPS.map((step, index) => {
        const isActive = index === activeStepIndex;
        const isDone = Boolean(capturedPhotos[step.id]);
        const isFailed = failedStepId === step.id;
        return (
          <View
            key={step.id}
            style={[
              styles.stepChip,
              isDone && styles.stepChipDone,
              isActive && styles.stepChipActive,
              isFailed && styles.stepChipFailed,
            ]}
          >
            <Text style={styles.stepChipLabel}>{step.reviewLabel}</Text>
          </View>
        );
      })}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const cameraHeight = 432;
  const ovalWidth = cameraHeight * FACE_CAPTURE_CAMERA_RATIO * FACE_CAPTURE_OVERLAY.widthRatio;
  const ovalHeight = cameraHeight * FACE_CAPTURE_OVERLAY.heightRatio;

  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    root: {
      flex: 1,
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      paddingBottom: theme.spacing.md,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    backButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    headerCopy: {
      flex: 1,
      gap: 2,
    },
    headerEyebrow: {
      color: theme.colors.muted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    headerTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '900',
    },
    progressBadge: {
      minWidth: 58,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.colors.accentMuted,
      backgroundColor: theme.colors.accentSoft,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    progressBadgeText: {
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: '900',
    },
    stepRail: {
      flexDirection: 'row',
      gap: 8,
    },
    stepChip: {
      flex: 1,
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    stepChipActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    stepChipDone: {
      borderColor: theme.colors.success,
    },
    stepChipFailed: {
      borderColor: theme.colors.danger,
    },
    stepChipLabel: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '800',
    },
    cameraShell: {
      position: 'relative',
      height: cameraHeight,
      overflow: 'hidden',
      borderRadius: theme.radius.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    camera: {
      width: '100%',
      height: '100%',
    },
    cameraPreviewImage: {
      width: '100%',
      height: '100%',
      backgroundColor: theme.colors.panel,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
    },
    overlayTop: {
      flex: 0.17,
      backgroundColor: 'rgba(5, 7, 11, 0.48)',
    },
    overlayMiddle: {
      flex: 0.66,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    overlaySide: {
      flex: 1,
      height: '100%',
      backgroundColor: 'rgba(5, 7, 11, 0.48)',
    },
    overlayBottom: {
      flex: 0.17,
      backgroundColor: 'rgba(5, 7, 11, 0.48)',
    },
    faceOval: {
      width: ovalWidth,
      height: ovalHeight,
      borderRadius: ovalHeight / 2,
      borderWidth: 3,
      backgroundColor: 'transparent',
      transform: [{ translateY: cameraHeight * FACE_CAPTURE_OVERLAY.centerYOffsetRatio }],
    },
    faceOvalNeutral: {
      borderColor: 'rgba(255,255,255,0.84)',
    },
    faceOvalReady: {
      borderColor: theme.colors.success,
    },
    bottomPanel: {
      gap: theme.spacing.sm,
      borderRadius: theme.radius.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.md,
    },
    stepPrompt: {
      color: theme.colors.text,
      fontSize: 26,
      lineHeight: 30,
      fontWeight: '900',
    },
    stepSupport: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
    },
    error: {
      color: theme.colors.danger,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '700',
    },
    captureActions: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    flexAction: {
      flex: 1,
    },
    primaryAction: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accent,
      paddingHorizontal: 18,
    },
    secondaryAction: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceElevated,
      paddingHorizontal: 18,
    },
    disabledAction: {
      opacity: 0.45,
    },
    primaryActionText: {
      color: theme.colors.accentContrast,
      fontSize: 14,
      fontWeight: '900',
    },
    secondaryActionText: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '800',
    },
    reviewContent: {
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.xl,
    },
    reviewIntro: {
      gap: theme.spacing.xs,
      borderRadius: theme.radius.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.md,
    },
    reviewTitle: {
      color: theme.colors.text,
      fontSize: 24,
      lineHeight: 28,
      fontWeight: '900',
    },
    reviewText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
    },
    reviewGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    reviewCard: {
      width: '47%',
      overflow: 'hidden',
      borderRadius: theme.radius.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    reviewCardFailure: {
      borderColor: theme.colors.danger,
    },
    reviewImage: {
      width: '100%',
      height: 156,
      backgroundColor: theme.colors.panel,
    },
    reviewPlaceholder: {
      width: '100%',
      height: 156,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceElevated,
    },
    reviewMeta: {
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    reviewLabel: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '900',
    },
    reviewRetake: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
    },
    submitButton: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accent,
      paddingHorizontal: 18,
    },
    submitButtonDisabled: {
      opacity: 0.45,
    },
    submitText: {
      color: theme.colors.accentContrast,
      fontSize: 14,
      fontWeight: '900',
    },
    permissionShell: {
      flex: 1,
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      backgroundColor: theme.colors.background,
    },
    permissionTitle: {
      maxWidth: 320,
      color: theme.colors.text,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '900',
    },
    permissionText: {
      maxWidth: 340,
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
    },
    permissionActions: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      width: '100%',
    },
  });
}
