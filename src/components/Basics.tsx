import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, shadow } from '../constants/theme';

export function SectionHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        {icon && <Ionicons name={icon} size={16} color={colors.textSecondary} style={{ marginRight: spacing.xs }} />}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  icon,
  action,
}: {
  title: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.emptyState}>
      {icon && (
        <View style={styles.emptyIconWrap}>
          <Ionicons name={icon} size={30} color={colors.textMuted} />
        </View>
      )}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action && <View style={{ marginTop: spacing.md, width: '100%' }}>{action}</View>}
    </View>
  );
}

export function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function CategoryChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
      {onRemove ? (
        <Text onPress={onRemove} style={styles.chipRemove}>
          ×
        </Text>
      ) : null}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  sectionHeader: { marginBottom: spacing.sm },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { ...typography.headline, color: colors.textPrimary },
  sectionSubtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: 2 },

  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: { ...typography.headline, color: colors.textPrimary, marginBottom: spacing.xs },
  emptyMessage: { ...typography.secondary, color: colors.textSecondary, textAlign: 'center' },

  statTile: {
    flexBasis: '48%',
    backgroundColor: colors.elevatedSurface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.low,
  },
  statValue: { ...typography.title, color: colors.primary },
  statLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  chipRemove: { marginLeft: 6, fontSize: 16, color: colors.textMuted, paddingHorizontal: 2 },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
});
