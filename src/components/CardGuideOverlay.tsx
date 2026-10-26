import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Text, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../constants/theme';
import { getGuideRect } from '../utils/cardGuideGeometry';

export type GuideState = 'idle' | 'good' | 'warn' | 'bad';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Single source of truth for the guide's screen position — ScannerScreen crops the captured photo
// to this exact same rectangle (converted to image coordinates), so what the user sees here is
// what actually gets processed. See src/utils/cardGuideGeometry.ts. This visual-only redesign
// keeps that contract exactly: the corner-bracket frame below still occupies the FULL
// GUIDE_WIDTH x GUIDE_HEIGHT bounding box computed here — only the stroke rendering (a full
// rectangle vs. corner brackets) changed, never the box itself.
const GUIDE_RECT = getGuideRect(SCREEN_WIDTH, SCREEN_HEIGHT);
const GUIDE_WIDTH = GUIDE_RECT.width;
const GUIDE_HEIGHT = GUIDE_RECT.height;
const BRACKET_LEN = Math.min(GUIDE_WIDTH, GUIDE_HEIGHT) * 0.16;
const BRACKET_THICKNESS = 3.5;
const CORNER_RADIUS = 18;

const STATE_COLOR: Record<GuideState, string> = {
  idle: '#FFFFFF',
  good: colors.overlayFrameGood,
  warn: colors.overlayFrameWarn,
  bad: colors.overlayFrameBad,
};

const STATE_ICON: Record<GuideState, keyof typeof Ionicons.glyphMap | null> = {
  idle: null,
  good: 'checkmark-circle',
  warn: 'alert-circle',
  bad: 'close-circle',
};

function Corner({ color, corner }: { color: string; corner: 'tl' | 'tr' | 'bl' | 'br' }) {
  const isTop = corner === 'tl' || corner === 'tr';
  const isLeft = corner === 'tl' || corner === 'bl';
  return (
    <View
      style={[
        cornerStyles.base,
        {
          [isTop ? 'top' : 'bottom']: -BRACKET_THICKNESS / 2,
          [isLeft ? 'left' : 'right']: -BRACKET_THICKNESS / 2,
          borderColor: color,
          borderTopWidth: isTop ? BRACKET_THICKNESS : 0,
          borderBottomWidth: !isTop ? BRACKET_THICKNESS : 0,
          borderLeftWidth: isLeft ? BRACKET_THICKNESS : 0,
          borderRightWidth: !isLeft ? BRACKET_THICKNESS : 0,
          borderTopLeftRadius: corner === 'tl' ? CORNER_RADIUS : 0,
          borderTopRightRadius: corner === 'tr' ? CORNER_RADIUS : 0,
          borderBottomLeftRadius: corner === 'bl' ? CORNER_RADIUS : 0,
          borderBottomRightRadius: corner === 'br' ? CORNER_RADIUS : 0,
        },
      ]}
    />
  );
}

export function CardGuideOverlay({ state, instruction }: { state: GuideState; instruction: string }) {
  const strokeColor = STATE_COLOR[state];
  const icon = STATE_ICON[state];
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state !== 'idle') {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);

  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.dimTop} />
      <View style={styles.middleRow}>
        <View style={styles.dimSide} />
        <Animated.View style={{ width: GUIDE_WIDTH, height: GUIDE_HEIGHT, opacity: state === 'idle' ? pulseOpacity : 1 }}>
          <Corner color={strokeColor} corner="tl" />
          <Corner color={strokeColor} corner="tr" />
          <Corner color={strokeColor} corner="bl" />
          <Corner color={strokeColor} corner="br" />
        </Animated.View>
        <View style={styles.dimSide} />
      </View>
      <View style={styles.dimBottom}>
        <View style={[styles.instructionPill, state !== 'idle' && { backgroundColor: withAlpha(strokeColor, 0.92) }]}>
          {icon && <Ionicons name={icon} size={18} color="#fff" style={{ marginRight: spacing.xs }} />}
          <Text style={styles.instructionText}>{instruction}</Text>
        </View>
        {state === 'idle' && <Text style={styles.hintText}>Keep the card steady and well lit</Text>}
      </View>
    </View>
  );
}

/** Small helper so state colors (opaque hex) can be reused as a semi-transparent pill background
 *  without maintaining a second rgba palette in theme.ts. */
function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const cornerStyles = StyleSheet.create({
  base: { position: 'absolute', width: BRACKET_LEN, height: BRACKET_LEN },
});

const dim = colors.overlayDim;

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFill },
  dimTop: { flex: 1, backgroundColor: dim },
  middleRow: { flexDirection: 'row' },
  dimSide: { flex: 1, backgroundColor: dim, height: GUIDE_HEIGHT },
  dimBottom: { flex: 1, backgroundColor: dim, alignItems: 'center', paddingTop: spacing.lg, gap: spacing.xs },
  instructionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    maxWidth: SCREEN_WIDTH * 0.85,
  },
  instructionText: { ...typography.bodyBold, color: '#fff', textAlign: 'center' },
  hintText: { ...typography.caption, color: 'rgba(255,255,255,0.65)', textAlign: 'center' },
});
