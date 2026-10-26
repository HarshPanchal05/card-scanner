import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, gradients, radius, spacing, shadow } from '../constants/theme';
import { icons } from '../constants/icons';
import { Gradient } from './Gradient';

/** Floating, rounded bottom navigation bar — replaces the stock full-width tab bar. Adapted from
 *  the reference app's floating-pill nav concept (not copied literally): a rounded container with
 *  horizontal margins hovering above the safe area, one gradient-filled circular indicator for the
 *  active tab, plus a dedicated center "Scan" action (the app's single most important action)
 *  rendered as a raised gradient button rather than a plain tab — Scan is not one of the Tab
 *  Navigator's own routes (it's a stack screen reached from Dashboard today), so it's added here
 *  as an extra, always-present button that jumps to the parent stack's Scanner screen. Nothing
 *  about the existing 4 tab routes changes — this only changes how they're drawn. */
const TAB_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; iconOutline: keyof typeof Ionicons.glyphMap; label: string }> = {
  Dashboard: { icon: icons.dashboard, iconOutline: icons.dashboardOutline, label: 'Home' },
  Library: { icon: icons.library, iconOutline: icons.libraryOutline, label: 'Cards' },
  Reports: { icon: icons.reports, iconOutline: icons.reportsOutline, label: 'Reports' },
  Settings: { icon: icons.settings, iconOutline: icons.settingsOutline, label: 'More' },
};

// Tab routes are split around the center Scan button in this fixed order, mirroring the
// reference's "Home · Scan · Cards · Reports · More" layout.
const LEFT_ROUTES = ['Dashboard', 'Library'];
const RIGHT_ROUTES = ['Reports', 'Settings'];

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const renderTab = (routeName: string) => {
    const index = state.routes.findIndex((r) => r.name === routeName);
    if (index === -1) return null;
    const route = state.routes[index];
    const isFocused = state.index === index;
    const meta = TAB_META[routeName];
    const { options } = descriptors[route.key];

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options.title ?? meta.label}
        style={styles.tab}
        hitSlop={8}
      >
        <View style={styles.iconWrap}>
          <Ionicons name={isFocused ? meta.icon : meta.iconOutline} size={26} color={isFocused ? colors.primary : colors.tertiaryText} />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {LEFT_ROUTES.map(renderTab)}

        <Pressable
          onPress={() => navigation.getParent()?.navigate('Scanner')}
          accessibilityRole="button"
          accessibilityLabel="Scan Card"
          style={styles.scanButtonTouch}
          hitSlop={8}
        >
          <Gradient colors={gradients.activeNav} borderRadius={radius.pill} style={styles.scanButton}>
            <Ionicons name={icons.scan} size={24} color={colors.textOnPrimary} />
          </Gradient>
        </Pressable>

        {RIGHT_ROUTES.map(renderTab)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    // Opaque backdrop matching the ordinary page background — NOT a visible panel (it's the same
    // color as the screen behind it), it exists purely so nothing scrolled underneath can ever
    // peek through in the margin around the floating pill below. The pill itself still reads as
    // "floating" because it has its own distinct surface color, shadow, and margin on every side
    // (left/right via this padding, bottom via paddingBottom above, top via the gap before it).
    backgroundColor: colors.background,
    // Explicit stacking above scrollable screen content — Android in particular does not
    // reliably paint an absolutely-positioned sibling on top purely from render order once
    // sibling views have their own elevation (several cards/buttons on these screens do, via
    // theme.ts's shadow.low/medium), so this is asserted explicitly rather than assumed.
    zIndex: 20,
    elevation: 20,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    ...shadow.medium,
  },
  // No text label — the icon alone (larger now that the label's vertical space is free, plus a
  // filled vs. outline glyph and the brand color) carries the active/inactive state.
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xs },
  iconWrap: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  scanButtonTouch: { marginTop: -28 },
  scanButton: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.medium,
  },
});
