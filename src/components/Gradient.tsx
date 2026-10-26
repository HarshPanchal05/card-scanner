import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

/** A diagonal (top-left -> bottom-right) linear-gradient background, with children rendered on
 *  top. Built on `react-native-svg` (already a project dependency for icons/app-icon assets) so
 *  no new native module is required — `expo-linear-gradient` was deliberately not added for this
 *  redesign to avoid an extra native dependency and rebuild on this RAM-constrained machine.
 *
 *  Drawn in a fixed 0-100 logical viewBox and stretched to the real box via
 *  `preserveAspectRatio="none"`, with NO width/height props on <Svg> itself — only
 *  `style={StyleSheet.absoluteFill}`, so standard RN layout (not SVG percentage/unit resolution)
 *  determines the actual pixel box. An earlier version passed `width="100%"`/measured pixel
 *  width/height directly to <Svg>/<Rect>; both were found on-device to sometimes under-fill the
 *  real container (a real, visually-confirmed bug, not hypothetical) — this fixed-viewBox +
 *  preserveAspectRatio approach removes that class of bug entirely by never asking the SVG layer
 *  to resolve a percentage or a measured dimension against anything.
 *
 *  Usage: wrap any content that should sit on a gradient surface (hero headers, primary CTAs, the
 *  active nav pill, the digital card's accent edge). Not meant for large flat fills of ordinary
 *  content surfaces — see theme.ts's `gradients` doc comment for where this is/isn't appropriate. */
export function Gradient({
  colors,
  style,
  children,
  borderRadius = 0,
}: {
  colors: readonly string[];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  borderRadius?: number;
}) {
  const gradientId = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View style={[styles.container, style, { borderRadius, overflow: 'hidden' }]}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            {colors.map((c, i) => (
              <Stop key={c + i} offset={i / Math.max(colors.length - 1, 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#${gradientId})`} />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative' },
});
