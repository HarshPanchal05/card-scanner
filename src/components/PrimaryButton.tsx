import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { colors, gradients, radius, spacing, typography, touchTarget } from '../constants/theme';
import { Gradient } from './Gradient';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  accessibilityLabel?: string;
}

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  fullWidth = true,
  accessibilityLabel,
}: Props) {
  const isDisabled = disabled || loading;
  // The primary action gets the brand gradient (per the redesign's "selective, not everywhere"
  // rule) — rendered as an absolutely-filled background layer behind the label, so the Pressable
  // itself stays the single touch target with its normal press/disabled styling. Every other
  // variant (and a disabled primary button) stays a flat fill, unchanged.
  const showGradient = variant === 'primary' && !isDisabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        showGradient ? styles.transparentBg : variantStyles[variant],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {showGradient && <Gradient colors={gradients.button} borderRadius={radius.md} style={StyleSheet.absoluteFill} />}
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? colors.primary : colors.textOnPrimary} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.label, variant === 'outline' && { color: colors.primary }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primaryDark }, // used only when disabled (no gradient then)
  secondary: { backgroundColor: colors.accent },
  danger: { backgroundColor: colors.danger },
  outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
});

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.minHeight,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  transparentBg: { backgroundColor: 'transparent' },
  fullWidth: { width: '100%' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.button, color: colors.textOnPrimary },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
