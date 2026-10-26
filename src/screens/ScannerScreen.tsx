import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, Alert, SafeAreaView, Pressable, Linking, Dimensions, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { colors, spacing, typography, radius, shadow } from '../constants/theme';
import { icons } from '../constants/icons';
import { CardGuideOverlay, type GuideState } from '../components/CardGuideOverlay';
import { PrimaryButton } from '../components/PrimaryButton';
import { analyzeImageQuality, type QualityReport } from '../services/imageQuality/qualityCheck';
import { persistCapturedImage, deleteFileIfExists } from '../services/storage/fileStorage';
import { getGuideRect, screenRectToImageRect } from '../utils/cardGuideGeometry';
import { createCard, addCardImage, updateCardOcrAndExtraction, deleteCard } from '../repositories/cardsRepo';
import { shouldCleanUpAbandonedCapture } from './scannerLifecycle';
import {
  recognizeCardSide,
  combineOcrResults,
  combineOcrLines,
  OcrUnavailableError,
  OcrTimeoutError,
} from '../services/ocr/ocrService';
import { runExtractionPipeline } from '../services/extraction/pipeline';
import { listCategories } from '../repositories/categoriesRepo';
import { categoryRowsToDictionary } from '../constants/categories';
import { useEventStore } from '../state/eventStore';
import { logError } from '../utils/logger';
import type { CardRow } from '../types/models';
import type { OcrLine } from '../types/extraction';

type Props = NativeStackScreenProps<RootStackParamList, 'Scanner'>;

type Phase = 'front' | 'back-prompt' | 'back' | 'processing';

export function ScannerScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const currentEvent = useEventStore((s) => s.currentEvent);

  const [phase, setPhase] = useState<Phase>('front');
  const [capturing, setCapturing] = useState(false);
  const [guideState, setGuideState] = useState<GuideState>('idle');
  const [instruction, setInstruction] = useState('Place the front of the card inside the frame');

  const cardRef = useRef<CardRow | null>(null);
  const frontUriRef = useRef<string | null>(null);
  const backUriRef = useRef<string | null>(null);
  // The captured photo cropped to exactly what the on-screen guide rectangle shows — this, NOT
  // the full original photo, is what quality analysis and OCR run against (see
  // src/utils/cardGuideGeometry.ts). The full, uncropped photo is still what gets persisted as
  // the card's saved image (frontUriRef/backUriRef above) — this ref is only ever used as OCR
  // input, never written to disk permanently.
  const frontRoiUriRef = useRef<string | null>(null);
  const backRoiUriRef = useRef<string | null>(null);
  // True only once finishCapture has actually been invoked for the current card (regardless of
  // whether it goes on to succeed or fail) — distinguishes "user is still mid-capture, hasn't
  // attempted OCR/extraction yet" from "OCR/extraction was attempted" for the abandonment cleanup
  // below. A card whose extraction write itself fails deliberately stays recoverable (see the
  // catch block in finishCapture) — this flag ensures that case is never swept up as abandoned.
  const finishCaptureStartedRef = useRef(false);

  // Cleans up a card that was created (front photo captured, so it exists in the DB and Card
  // Library) but then abandoned before the user ever reached/attempted finishCapture — e.g. they
  // backed out at the "does this card have a back?" prompt, or navigated away mid-capture. Without
  // this, that card would sit forever with status 'captured' and no company/representative data:
  // a permanent junk entry that inflates Dashboard counts and can never be usefully reviewed.
  // Cards that DO reach finishCapture keep their existing behavior untouched, including the
  // intentional "extraction failed, recover manually from Card Library" path.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      const card = cardRef.current;
      if (!card || !shouldCleanUpAbandonedCapture({ hasCard: true, finishCaptureStarted: finishCaptureStartedRef.current })) return;
      cardRef.current = null;
      deleteCard(card.id)
        .then((images) => {
          for (const img of images) {
            deleteFileIfExists(img.originalUri);
            if (img.thumbnailUri) deleteFileIfExists(img.thumbnailUri);
          }
        })
        .catch((err) => logError('ScannerScreen.abandonedCaptureCleanup', err));
    });
    return unsubscribe;
  }, [navigation]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    setGuideState('idle');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.95, skipProcessing: false });
      if (!photo) throw new Error('Camera did not return an image.');

      // Crop to exactly what the guide rectangle shows on screen — everything outside it (the
      // dimmed region in CardGuideOverlay) must never reach quality analysis or OCR. No fallback
      // to the full image if this fails: a failed crop is a failed capture (see the outer catch).
      const screenSize = Dimensions.get('window');
      const guideRectOnScreen = getGuideRect(screenSize.width, screenSize.height);
      const roiRect = screenRectToImageRect(guideRectOnScreen, screenSize, { width: photo.width, height: photo.height });
      const roi = await ImageManipulator.manipulateAsync(photo.uri, [{ crop: { originX: roiRect.x, originY: roiRect.y, width: roiRect.width, height: roiRect.height } }], {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      if (__DEV__) {
        // Developer-only debug trail (logcat only — no UI surface) so the crop can be verified by
        // pulling both files during device QA: `adb shell run-as <pkg> cat <path>`.
        console.log('[ScannerScreen] ROI crop', { photoSize: { width: photo.width, height: photo.height }, roiRect, originalUri: photo.uri, roiUri: roi.uri });
      }

      const report: QualityReport = await analyzeImageQuality(roi.uri, { width: roiRect.width, height: roiRect.height });
      if (!report.passed) {
        setGuideState('bad');
        setInstruction(report.message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setGuideState('good');

      if (phase === 'front') {
        if (!currentEvent) throw new Error('No active event selected.');
        const card = await createCard(currentEvent.id);
        cardRef.current = card;
        try {
          const persisted = await persistCapturedImage({
            tempUri: photo.uri,
            cardDisplayId: card.displayId,
            side: 'front',
          });
          frontUriRef.current = persisted.uri;
          frontRoiUriRef.current = roi.uri;
          await addCardImage({
            cardId: card.id,
            side: 'front',
            originalUri: persisted.uri,
            thumbnailUri: persisted.thumbnailUri,
            width: photo.width,
            height: photo.height,
            qualityScore: report.metrics.blurVariance,
          });
        } catch (persistErr) {
          // Image persistence failed (e.g. device out of storage) after the card row was
          // already created — delete it rather than leaving an empty, image-less "phantom" card
          // behind in the Card Library.
          await deleteCard(card.id).catch(() => {});
          cardRef.current = null;
          throw persistErr;
        }
        setPhase('back-prompt');
      } else if (phase === 'back') {
        const card = cardRef.current!;
        const persisted = await persistCapturedImage({
          tempUri: photo.uri,
          cardDisplayId: card.displayId,
          side: 'back',
        });
        backUriRef.current = persisted.uri;
        backRoiUriRef.current = roi.uri;
        await addCardImage({
          cardId: card.id,
          side: 'back',
          originalUri: persisted.uri,
          thumbnailUri: persisted.thumbnailUri,
          width: photo.width,
          height: photo.height,
          qualityScore: report.metrics.blurVariance,
        });
        await finishCapture(card);
      }
    } catch (err: any) {
      Alert.alert('Capture failed', err?.message ?? 'Please try again.');
    } finally {
      setCapturing(false);
    }
  }, [phase, capturing, currentEvent]);

  const finishCapture = useCallback(async (card: CardRow) => {
    finishCaptureStartedRef.current = true;
    setPhase('processing');
    setInstruction('Reading card details…');

    let rawOcrText = '';
    let ocrLines: OcrLine[] = [];
    let ocrFailed = false;
    try {
      // OCR runs on the guide-cropped ROI, never the full original photo — see the ROI crop in
      // handleCapture. No fallback to frontUriRef/backUriRef (the full images) on failure: a
      // failed ROI recognition is reported as an OCR failure below, not silently retried against
      // the uncropped original (which would reintroduce the outside-the-frame-text bug).
      const frontResult = await recognizeCardSide(frontRoiUriRef.current!, 'front');
      let backResult = null;
      if (backRoiUriRef.current) {
        backResult = await recognizeCardSide(backRoiUriRef.current, 'back');
      }
      rawOcrText = combineOcrResults(frontResult, backResult);
      ocrLines = combineOcrLines(frontResult, backResult);
    } catch (err) {
      ocrFailed = true;
      if (err instanceof OcrUnavailableError) {
        Alert.alert(
          'On-device text recognition unavailable',
          'This build cannot run OCR (it needs a development build, not Expo Go). You can still fill in the card details manually.'
        );
      } else if (err instanceof OcrTimeoutError) {
        Alert.alert('Text recognition timed out', 'You can still fill in the card details manually.');
      } else {
        logError('ScannerScreen.ocr', err);
        Alert.alert("Couldn't read the card clearly", 'Please fill in the details manually.');
      }
    }

    try {
      // Custom (user-created) categories have no hand-curated keyword dictionary — this is what
      // lets a category the user only just created in Settings → Categories participate in
      // classification immediately, with no code change (see constants/categories.ts).
      const categories = await listCategories();
      const extraDictionary = categoryRowsToDictionary(categories);
      const extraction = runExtractionPipeline(rawOcrText, extraDictionary, ocrLines);
      await updateCardOcrAndExtraction(card.id, {
        rawOcrText,
        extractionJson: JSON.stringify(extraction),
        confidenceJson: JSON.stringify(extraction.confidence),
        status: 'needs_review',
      });
      navigation.replace('Review', { cardId: card.id });
    } catch (err) {
      // The photos are already safely on disk and the card row already exists (created before
      // this function ran) — only the extraction/status write failed. Never leave the user
      // staring at "Reading card details…" forever: surface it and send them somewhere they can
      // recover the card from (it's already visible in the Card Library as status "captured").
      logError('ScannerScreen.finishCapture', err);
      Alert.alert(
        'Could not finish processing this card',
        "The photos were saved. Open it from the Card Library to fill in the details manually.",
        [{ text: 'OK', onPress: () => navigation.replace('MainTabs') }]
      );
    }
  }, [navigation]);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    // Once denied with "Don't ask again" (canAskAgain: false), Android will never show the
    // system dialog again — requestPermission() would silently no-op, leaving the user stuck.
    // The only way forward at that point is the app's Settings page.
    const canAskAgain = permission.canAskAgain;
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <View style={styles.permissionIconWrap}>
          <Ionicons name={icons.scanOutline as any} size={30} color={colors.primary} />
        </View>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          {canAskAgain
            ? 'This app scans business cards using the camera. Grant camera access to continue.'
            : 'Camera access was denied. Enable it for this app in Android Settings to scan cards.'}
        </Text>
        <PrimaryButton
          label={canAskAgain ? 'Grant Camera Access' : 'Open Settings'}
          onPress={canAskAgain ? requestPermission : () => Linking.openSettings()}
          accessibilityLabel={canAskAgain ? 'Grant Camera Access' : 'Open Settings'}
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      {phase !== 'back-prompt' && phase !== 'processing' && (
        <CardGuideOverlay state={guideState} instruction={instruction} />
      )}

      {phase === 'back-prompt' && (
        <View style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Does this card have information on the back?</Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <PrimaryButton
                label="Yes, scan back"
                onPress={() => {
                  setPhase('back');
                  setInstruction('Place the back of the card inside the frame');
                  setGuideState('idle');
                }}
              />
              <PrimaryButton
                label="No, continue"
                variant="outline"
                onPress={() => finishCapture(cardRef.current!)}
              />
            </View>
          </View>
        </View>
      )}

      {phase === 'processing' && (
        <View style={styles.promptOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.processingText}>{instruction}</Text>
        </View>
      )}

      {(phase === 'front' || phase === 'back') && (
        <View style={styles.captureBar}>
          <Pressable
            onPress={handleCapture}
            disabled={capturing}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Capture card photo"
            style={({ pressed }) => [
              styles.captureButton,
              capturing && styles.captureButtonDisabled,
              pressed && !capturing && styles.captureButtonPressed,
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  permissionIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  permissionTitle: { ...typography.title, color: colors.textPrimary },
  permissionBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  captureBar: {
    position: 'absolute',
    bottom: spacing.xxl,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.35)',
    ...shadow.medium,
  },
  captureButtonDisabled: { opacity: 0.5 },
  captureButtonPressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
  promptOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlayDim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  promptCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    ...shadow.medium,
  },
  promptTitle: { ...typography.headline, color: colors.textPrimary, textAlign: 'center' },
  processingText: { ...typography.headline, color: '#fff' },
});
