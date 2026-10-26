import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, shadow } from '../constants/theme';
import { icons } from '../constants/icons';
import { SectionHeader, Divider } from '../components/Basics';
import { PrimaryButton } from '../components/PrimaryButton';
import { getStorageUsage, clearTempFolder, cardsRootDir, ensureAppFolders, type StorageUsage } from '../services/storage/fileStorage';
import { getDb } from '../database/db';
import { logError } from '../utils/logger';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function StorageSettingsScreen() {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(() => {
    setUsage(getStorageUsage());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleClearTemp = () => {
    clearTempFolder();
    refresh();
    Alert.alert('Temporary files cleared.');
  };

  const handleDeleteAll = () => {
    Alert.alert(
      'Delete all cards',
      'This permanently deletes every scanned card, image, company, and representative. This cannot be undone. Consider exporting a backup first.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const db = await getDb();
              await db.execAsync(
                'DELETE FROM cards; DELETE FROM card_images; DELETE FROM company_categories; DELETE FROM phone_numbers; DELETE FROM emails; DELETE FROM representatives; DELETE FROM companies;'
              );
              // The DB rows are gone; also remove the actual photo files, otherwise "delete all
              // cards" leaves every original/thumbnail JPEG orphaned on disk — the storage usage
              // screen would keep showing the same "Card photos" size even though the dashboard
              // now reports zero cards, which is exactly the kind of silent data/state mismatch
              // this action promised not to leave behind.
              const dir = cardsRootDir();
              if (dir.exists) dir.delete();
              ensureAppFolders();
              refresh();
              Alert.alert('All cards deleted.');
            } catch (err) {
              logError('StorageSettingsScreen.deleteAll', err);
              Alert.alert(
                'Could not delete all cards',
                'Some data may not have been removed. Please try again.'
              );
              refresh();
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader title="Storage" icon={icons.storage as any} />

        {usage && (
          <View style={styles.usageCard}>
            <UsageRow label="Card photos" value={formatBytes(usage.cardsBytes)} />
            <UsageRow label="Reports" value={formatBytes(usage.reportsBytes)} />
            <UsageRow label="Backups" value={formatBytes(usage.backupsBytes)} />
            <Divider />
            <UsageRow label="Total" value={formatBytes(usage.totalBytes)} bold />
          </View>
        )}

        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <PrimaryButton label="Clear Temporary Files" variant="outline" onPress={handleClearTemp} disabled={deleting} />
        </View>

        <View style={styles.dangerZone}>
          <View style={styles.dangerWarningRow}>
            <Ionicons name={icons.warning as any} size={16} color={colors.danger} />
            <Text style={styles.dangerWarningText}>This action cannot be undone. Consider a backup first.</Text>
          </View>
          <PrimaryButton label="Delete All Cards" variant="danger" onPress={handleDeleteAll} loading={deleting} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function UsageRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.usageRow}>
      <Text style={[styles.usageLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.usageValue, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  usageCard: {
    backgroundColor: colors.elevatedSurface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.low,
  },
  usageRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  usageLabel: { ...typography.body, color: colors.textSecondary },
  usageValue: { ...typography.body, color: colors.textPrimary },
  bold: { fontWeight: '700', color: colors.textPrimary },
  dangerZone: {
    marginTop: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  dangerWarningRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dangerWarningText: { ...typography.caption, color: colors.danger, flex: 1 },
});
