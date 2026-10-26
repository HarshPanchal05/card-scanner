import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, shadow } from '../constants/theme';
import { icons } from '../constants/icons';
import { SectionHeader } from '../components/Basics';
import { PrimaryButton } from '../components/PrimaryButton';
import { exportBackup, previewBackup, restoreBackup, InvalidBackupError, type BackupProgress } from '../services/backup/backupService';
import { shareFile } from '../services/reports/sharingService';
import { logError } from '../utils/logger';

export function BackupRestoreScreen() {
  const [exporting, setExporting] = useState(false);
  const [exportPhase, setExportPhase] = useState<BackupProgress['phase'] | null>(null);
  const [lastBackupUri, setLastBackupUri] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    setLastBackupUri(null);
    try {
      const uri = await exportBackup((p) => setExportPhase(p.phase));
      setLastBackupUri(uri);
      // The full result (with its path and a persistent Share button) is still shown inline below,
      // but that can render off the initially-visible screen depending on scroll position — this
      // alert guarantees the user sees success immediately, using the same confirmation pattern
      // already used elsewhere in the app (e.g. "Contact saved successfully"), with the primary
      // next action one tap away.
      Alert.alert('Backup created', 'Your backup is ready.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Share Backup', onPress: () => shareFile(uri, 'zip').catch((err: any) => {
            logError('BackupRestoreScreen.handleExport.share', err);
            Alert.alert('Sharing failed', err?.message ?? 'Please try again.');
          }) },
      ]);
    } catch (err: any) {
      logError('BackupRestoreScreen.handleExport', err);
      Alert.alert('Backup failed', err?.message ?? 'Please try again.');
    } finally {
      setExporting(false);
      setExportPhase(null);
    }
  };

  const handleShareBackup = async () => {
    if (!lastBackupUri) return;
    try {
      await shareFile(lastBackupUri, 'zip');
    } catch (err: any) {
      logError('BackupRestoreScreen.handleShareBackup', err);
      Alert.alert('Sharing failed', err?.message ?? 'Please try again.');
    }
  };

  const handleRestore = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: 'application/zip', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    const uri = picked.assets[0].uri;

    try {
      const { preview } = await previewBackup(uri);
      const counts = preview.manifest.counts;
      Alert.alert(
        'Restore backup?',
        `This backup was exported on ${preview.manifest.exportedAt.slice(0, 10)} and contains ${counts.cards ?? 0} cards, ${counts.companies ?? 0} companies. Restoring merges this data with what's on this device and does not delete anything currently here. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            onPress: async () => {
              setRestoring(true);
              try {
                await restoreBackup(uri);
                Alert.alert('Restore complete', 'Your data has been restored.');
              } catch (err: any) {
                logError('BackupRestoreScreen.handleRestore', err);
                Alert.alert('Restore failed', err?.message ?? 'Please try again.');
              } finally {
                setRestoring(false);
              }
            },
          },
        ]
      );
    } catch (err) {
      if (err instanceof InvalidBackupError) {
        Alert.alert('Invalid backup file', err.message);
      } else {
        logError('BackupRestoreScreen.previewBackup', err);
        Alert.alert('Could not read backup file', (err as Error)?.message ?? 'Please try again.');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader
          title="Backup & Restore"
          icon={icons.backup as any}
          subtitle="Exports the full database and every card photo into a single zip file stored on this device."
        />

        <View style={styles.includesCard}>
          <IncludesRow label="Card information" />
          <IncludesRow label="Company information" />
          <IncludesRow label="Representatives" />
          <IncludesRow label="Original card photos" />
        </View>

        <PrimaryButton
          label={exporting ? exportPhaseLabel(exportPhase) : 'Create Backup'}
          icon={<Ionicons name={icons.backup as any} size={18} color={colors.textOnPrimary} />}
          onPress={handleExport}
          loading={exporting}
        />

        {lastBackupUri && (
          <View style={styles.resultCard}>
            <View style={styles.resultTitleRow}>
              <Ionicons name={icons.success as any} size={18} color={colors.success} />
              <Text style={styles.resultTitle}>Backup created successfully</Text>
            </View>
            <Text style={styles.resultPath} numberOfLines={2}>{lastBackupUri}</Text>
            <View style={{ marginTop: spacing.sm }}>
              <PrimaryButton
                label="Share Backup"
                variant="secondary"
                icon={<Ionicons name={icons.share as any} size={18} color={colors.textOnPrimary} />}
                onPress={handleShareBackup}
              />
            </View>
          </View>
        )}

        <View style={{ height: spacing.xl }} />

        <SectionHeader title="Restore" subtitle="Choose a previously exported .zip backup file to restore." />
        <PrimaryButton label="Choose Backup File" variant="outline" onPress={handleRestore} loading={restoring} />
      </ScrollView>
    </SafeAreaView>
  );
}

function IncludesRow({ label }: { label: string }) {
  return (
    <View style={styles.includesRow}>
      <Ionicons name={icons.success as any} size={16} color={colors.success} />
      <Text style={styles.includesText}>{label}</Text>
    </View>
  );
}

function exportPhaseLabel(phase: BackupProgress['phase'] | null): string {
  switch (phase) {
    case 'dumping_database':
      return 'Exporting database…';
    case 'archiving_images':
      return 'Archiving card photos…';
    case 'writing_zip':
      return 'Writing backup file…';
    default:
      return 'Export Backup';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  resultCard: {
    marginTop: spacing.md,
    backgroundColor: colors.elevatedSurface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.low,
  },
  resultTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  resultTitle: { ...typography.bodyBold, color: colors.success },
  resultPath: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  includesCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    gap: 6,
  },
  includesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  includesText: { ...typography.secondary, color: colors.textSecondary },
});
