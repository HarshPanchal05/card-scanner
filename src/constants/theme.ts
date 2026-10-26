/** Shared design tokens. Kept flat and simple on purpose — no theming engine, no dark mode
 *  toggle: this app is used on a bright expo floor and always renders the same high-contrast
 *  light theme. (Explicit decision, revisited and reaffirmed during the 2026-09 iOS-inspired
 *  redesign — see docs/UI_REDESIGN_PLAN.md.)
 *
 *  2026-09 redesign: extended in place rather than replaced. Every original key keeps its exact
 *  original value — nothing here is a breaking change for any screen already importing from this
 *  file. New keys were added for the redesign's deeper visual pass (elevated surfaces, a fuller
 *  text hierarchy, shadows, a Large-Title-style typography step, more spacing granularity).
 *  `radius.sm/md/lg` were the one deliberate value change (6/10/16 -> 10/14/18): a purely visual,
 *  zero-logic softening that every existing rounded surface in the app picks up automatically.
 *
 *  2026-09 (later) — full brand reskin: `primary` and everything derived from it moved from teal
 *  to a red -> burgundy -> dark-purple identity (crimson primary, deep-wine primaryDark, a plum
 *  secondary, gradient stops for hero/CTA surfaces). Semantic colors (success/warning/danger),
 *  surfaces, and text tokens are unchanged in role — only `primary`-family values and the new
 *  `secondary`/`gradient*` keys are new. Every existing screen importing `colors.primary` picks up
 *  the new brand color automatically with no code change required. */

export const colors = {
  primary: '#B3123B',
  primaryDark: '#5B1236',
  primaryLight: '#FBE7ED',
  secondary: '#6A1B4D',
  accent: '#D63A63',
  success: '#1B8A3D',
  warning: '#B8860B',
  danger: '#C62828',

  // Gradient stops used selectively (hero headers, primary CTAs, active nav state, the digital
  // card's accent edge) — see gradients.hero/gradients.button below. Never used for large flat
  // fills of ordinary content surfaces.
  gradientStart: '#C21E4B',
  gradientMiddle: '#7A1A45',
  gradientEnd: '#3D1240',

  background: '#F6F3F5',
  secondaryBackground: '#F0E9ED',
  surface: '#FFFFFF',
  surfaceAlt: '#F5EEF1',
  elevatedSurface: '#FFFFFF',
  border: '#E7DCE3',
  divider: '#EDE3E8',

  textPrimary: '#1F1420',
  textSecondary: '#5B4A54',
  tertiaryText: '#7A6670',
  textMuted: '#9A8891',
  textOnPrimary: '#FFFFFF',

  overlayDim: 'rgba(0,0,0,0.55)',
  overlayFrameGood: '#2BB673',
  overlayFrameWarn: '#E0A100',
  overlayFrameBad: '#E53935',
} as const;

/** Named gradient stop-lists (top-left -> bottom-right) for the SVG-based <Gradient> component —
 *  see components/Gradient.tsx. Kept centralized so every hero/CTA/active-nav surface in the app
 *  draws from the exact same red -> burgundy -> dark-purple ramp. */
export const gradients = {
  hero: [colors.gradientStart, colors.gradientMiddle, colors.gradientEnd] as const,
  button: [colors.gradientStart, colors.secondary] as const,
  activeNav: [colors.gradientStart, colors.secondary] as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  ms: 12,
  md: 16,
  ml: 20,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const },
  title: { fontSize: 22, fontWeight: '700' as const },
  headline: { fontSize: 17, fontWeight: '600' as const },
  h1: { fontSize: 28, fontWeight: '700' as const },
  h2: { fontSize: 22, fontWeight: '700' as const },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyBold: { fontSize: 16, fontWeight: '600' as const },
  secondary: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  navLabel: { fontSize: 11, fontWeight: '600' as const },
  button: { fontSize: 17, fontWeight: '700' as const },
};

export const touchTarget = {
  minHeight: 52,
};

/** Extra bottom padding every scrollable tab-screen needs so its last item isn't hidden behind
 *  the floating tab bar (components/FloatingTabBar.tsx), which is absolutely positioned and so
 *  doesn't automatically reserve layout space the way the stock full-width tab bar did. */
export const floatingTabBarSpace = 130;

/** Two subtle elevation levels — Android `elevation` + matching iOS-style shadow props, in case
 *  this ever runs on iOS. Deliberately restrained: no heavy Material-style elevation stacking. */
export const shadow = {
  low: {
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  medium: {
    elevation: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
} as const;
