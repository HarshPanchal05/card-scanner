import React, { useRef, useState } from 'react';
import { View, Image, StyleSheet, Animated, Dimensions, Text, Pressable } from 'react-native';
import {
  PinchGestureHandler,
  PanGestureHandler,
  State,
  type HandlerStateChangeEvent,
  type PinchGestureHandlerEventPayload,
  type PanGestureHandlerEventPayload,
} from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius, touchTarget } from '../constants/theme';
import { icons } from '../constants/icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CardImage {
  side: 'front' | 'back';
  uri: string;
}

/** Pinch-to-zoom + pan image viewer with a front/back switcher. Built on RN's built-in Animated
 *  API (no reanimated dependency) — gesture-handler dispatches directly into Animated.Values via
 *  Animated.event, which is sufficient for a simple zoom/pan viewer. */
export function ImageViewer({ images, onClose }: { images: CardImage[]; onClose?: () => void }) {
  const [activeSide, setActiveSide] = useState<'front' | 'back'>(images[0]?.side ?? 'front');
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const lastScale = useRef(1);

  const active = images.find((i) => i.side === activeSide) ?? images[0];

  const onPinchEvent = Animated.event([{ nativeEvent: { scale } }], { useNativeDriver: true });
  const onPinchStateChange = (event: HandlerStateChangeEvent<PinchGestureHandlerEventPayload>) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      lastScale.current *= event.nativeEvent.scale;
      lastScale.current = Math.max(1, Math.min(4, lastScale.current));
      scale.setValue(1);
      scale.setOffset(lastScale.current);
    }
  };

  const onPanEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX, translationY: translateY } }],
    { useNativeDriver: true }
  );
  const onPanStateChange = (event: HandlerStateChangeEvent<PanGestureHandlerEventPayload>) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      translateX.extractOffset();
      translateY.extractOffset();
    }
  };

  const resetZoom = () => {
    lastScale.current = 1;
    scale.setOffset(0);
    scale.setValue(1);
    translateX.setOffset(0);
    translateX.setValue(0);
    translateY.setOffset(0);
    translateY.setValue(0);
  };

  return (
    <View style={styles.container}>
      {onClose && (
        <Pressable
          style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close image viewer"
          hitSlop={8}
        >
          <Ionicons name={icons.close as any} size={22} color="#fff" />
        </Pressable>
      )}

      <PanGestureHandler onGestureEvent={onPanEvent} onHandlerStateChange={onPanStateChange} minPointers={1} maxPointers={2}>
        <Animated.View style={styles.imageArea}>
          <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
            <Animated.View style={{ transform: [{ scale }, { translateX }, { translateY }] }}>
              {active ? (
                <Image source={{ uri: active.uri }} style={styles.image} resizeMode="contain" />
              ) : (
                <Text style={styles.noImage}>No image available</Text>
              )}
            </Animated.View>
          </PinchGestureHandler>
        </Animated.View>
      </PanGestureHandler>

      {images.length > 1 && (
        <View style={styles.tabRow}>
          {images.map((img) => (
            <Pressable
              key={img.side}
              onPress={() => {
                setActiveSide(img.side);
                resetZoom();
              }}
              style={[styles.tab, activeSide === img.side && styles.tabActive]}
              accessibilityRole="button"
              accessibilityLabel={`Show ${img.side === 'front' ? 'front' : 'back'} of card`}
              accessibilityState={{ selected: activeSide === img.side }}
            >
              <Text style={[styles.tabText, activeSide === img.side && styles.tabTextActive]}>
                {img.side === 'front' ? 'Front' : 'Back'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  imageArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.75 },
  noImage: { color: '#fff', ...typography.body },
  closeButton: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.lg,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  closeButtonPressed: { backgroundColor: 'rgba(255,255,255,0.28)' },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  tab: {
    paddingHorizontal: spacing.lg,
    minHeight: touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: 'rgba(255,255,255,0.7)', ...typography.bodyBold },
  tabTextActive: { color: '#fff' },
});
