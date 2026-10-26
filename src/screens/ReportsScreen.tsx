import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, shadow, floatingTabBarSpace } from '../constants/theme';
import { icons } from '../constants/icons';
import { SectionHeader } from '../components/Basics';
import { PrimaryButton } from '../components/PrimaryButton';
import { listEvents, type EventRow } from '../repositories/eventsRepo';
import { listCategories } from '../repositories/categoriesRepo';
import type { CategoryRow } from '../types/models';
import { generateExcelReport } from '../services/reports/excelService';
import { shareFile } from '../services/reports/sharingService';
import { useEventStore } from '../state/eventStore';
import { logError } from '../utils/logger';

type DateRangePreset = 'all' | 'today' | 'week';

export function ReportsScreen() {
  const currentEvent = useEventStore((s) => s.currentEvent);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(undefined);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const [generating, setGenerating] = useState(false);
  const [lastReportUri, setLastReportUri] = useState<string | null>(null);

  useEffect(() => {
    listEvents(true).then(setEvents);
    listCategories().then(setCategories);
    setSelectedEventId(currentEvent?.id);
  }, [currentEvent]);

  const dateBounds = (): { dateFrom?: string; dateTo?: string } => {
    if (datePreset === 'all') return {};
    const now = new Date();
    if (datePreset === 'today') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { dateFrom: start.toISOString() };
    }
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { dateFrom: weekAgo.toISOString() };
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setLastReportUri(null);
    try {
      const eventName = events.find((e) => e.id === selectedEventId)?.name ?? 'AllEvents';
      const uri = await generateExcelReport(
        { eventId: selectedEventId, categoryId: selectedCategoryId, ...dateBounds() },
        eventName
      );
      setLastReportUri(uri);
      // The full result (with its path and a persistent Share button) is still shown inline below,
      // but that can render off the initially-visible screen depending on scroll position — this
      // alert guarantees the user sees success immediately, using the same confirmation pattern
      // already used elsewhere in the app (e.g. "Contact saved successfully"), with the primary
      // next action one tap away.
      Alert.alert('Excel report generated', 'Your report is ready.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Share Report', onPress: () => shareFile(uri, 'xlsx').catch((err: any) => {
            logError('ReportsScreen.handleGenerate.share', err);
            Alert.alert('Sharing failed', err?.message ?? 'Please try again.');
          }) },
      ]);
    } catch (err: any) {
      logError('ReportsScreen.handleGenerate', err);
      Alert.alert('Report generation failed', err?.message ?? "Couldn't generate the report. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleShare = async () => {
    if (!lastReportUri) return;
    try {
      await shareFile(lastReportUri, 'xlsx');
    } catch (err: any) {
      logError('ReportsScreen.handleShare', err);
      Alert.alert('Sharing failed', err?.message ?? 'Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader title="Generate Report" subtitle="Creates an Excel workbook of saved visitor cards, entirely offline." />

        <Text style={styles.filterLabel}>Event</Text>
        <ChipRow
          options={[{ id: undefined, name: 'All Events' }, ...events]}
          selected={selectedEventId}
          onSelect={setSelectedEventId}
        />

        <Text style={styles.filterLabel}>Category</Text>
        <ChipRow
          options={[{ id: undefined, name: 'All Categories' }, ...categories]}
          selected={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />

        <Text style={styles.filterLabel}>Date Range</Text>
        <ChipRow
          options={[
            { id: 'all', name: 'All Time' },
            { id: 'today', name: 'Today' },
            { id: 'week', name: 'Last 7 Days' },
          ]}
          selected={datePreset}
          onSelect={(id) => setDatePreset((id as DateRangePreset) ?? 'all')}
        />

        <View style={{ marginTop: spacing.lg }}>
          <PrimaryButton
            label="Generate Excel Report"
            icon={<Ionicons name={icons.reportsOutline as any} size={18} color={colors.textOnPrimary} />}
            onPress={handleGenerate}
            loading={generating}
          />
        </View>

        {lastReportUri && (
          <View style={styles.resultCard}>
            <View style={styles.resultTitleRow}>
              <Ionicons name={icons.success as any} size={18} color={colors.success} />
              <Text style={styles.resultTitle}>Report generated successfully</Text>
            </View>
            <Text style={styles.resultPath} numberOfLines={2}>{lastReportUri}</Text>
            <View style={{ marginTop: spacing.sm }}>
              <PrimaryButton
                label="Share Report"
                variant="secondary"
                icon={<Ionicons name={icons.share as any} size={18} color={colors.textOnPrimary} />}
                onPress={handleShare}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ChipRow({
  options,
  selected,
  onSelect,
}: {
  options: { id?: string; name: string }[];
  selected?: string;
  onSelect: (id?: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => (
        <Pressable
          key={opt.id ?? 'all'}
          style={[styles.chip, selected === opt.id && styles.chipSelected]}
          onPress={() => onSelect(opt.id)}
        >
          <Text style={[styles.chipText, selected === opt.id && styles.chipTextSelected]}>{opt.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: floatingTabBarSpace },
  filterLabel: { ...typography.bodyBold, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  chipTextSelected: { color: colors.textOnPrimary },
  resultCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.elevatedSurface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.low,
  },
  resultTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  resultTitle: { ...typography.bodyBold, color: colors.success },
  resultPath: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
});
