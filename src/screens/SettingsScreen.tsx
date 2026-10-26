import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../types/navigation';
import { colors, radius, spacing, typography, shadow, floatingTabBarSpace } from '../constants/theme';
import { icons } from '../constants/icons';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Settings'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function SettingsScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.largeTitle}>Settings</Text>

        <Text style={styles.groupLabel}>DATA</Text>
        <View style={styles.group}>
          <SettingsRow
            icon={icons.event as any}
            title="Events"
            subtitle="Create, switch, and archive expo events"
            onPress={() => navigation.navigate('Events')}
          />
          <RowDivider />
          <SettingsRow
            icon={icons.category as any}
            title="Categories"
            subtitle="Manage categories and how cards are auto-classified"
            onPress={() => navigation.navigate('Categories')}
          />
          <RowDivider />
          <SettingsRow
            icon={icons.storage as any}
            title="Storage"
            subtitle="Usage, cleanup, and backup/restore"
            onPress={() => navigation.navigate('StorageSettings')}
          />
          <RowDivider />
          <SettingsRow
            icon={icons.backup as any}
            title="Backup & Restore"
            subtitle="Export or restore all data as a local zip"
            onPress={() => navigation.navigate('BackupRestore')}
            isLast
          />
        </View>

        <Text style={styles.groupLabel}>ABOUT</Text>
        <View style={styles.group}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutText}>Industrial Card Scanner</Text>
            <Text style={styles.aboutMeta}>Offline-first · On-device OCR · No cloud required</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, isLast && styles.rowLast, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.rowIconWrap}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name={icons.forward as any} size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function RowDivider() {
  return <View style={styles.rowDivider} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: floatingTabBarSpace },
  largeTitle: { ...typography.largeTitle, color: colors.textPrimary, marginBottom: spacing.lg },
  groupLabel: { ...typography.caption, color: colors.textMuted, fontWeight: '700', marginBottom: spacing.xs, marginLeft: spacing.xs },
  group: {
    backgroundColor: colors.elevatedSurface,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    ...shadow.low,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  rowLast: {},
  rowPressed: { backgroundColor: colors.surfaceAlt },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginLeft: spacing.md + 32 + spacing.sm },
  rowTitle: { ...typography.bodyBold, color: colors.textPrimary },
  rowSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  aboutRow: { padding: spacing.md, alignItems: 'center' },
  aboutText: { ...typography.bodyBold, color: colors.textMuted },
  aboutMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
});
