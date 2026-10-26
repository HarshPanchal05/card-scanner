import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, shadow, touchTarget } from '../constants/theme';
import { icons } from '../constants/icons';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionHeader, EmptyState } from '../components/Basics';
import { createEvent, renameEvent, archiveEvent, listEvents } from '../repositories/eventsRepo';
import { useEventStore } from '../state/eventStore';
import type { EventRow } from '../types/models';

export function EventsScreen() {
  const { currentEvent, selectEvent } = useEventStore();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [renaming, setRenaming] = useState<EventRow | null>(null);
  const [renameText, setRenameText] = useState('');

  const refresh = useCallback(async () => {
    setEvents(await listEvents(true));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createEvent({ name: newName.trim(), location: newLocation.trim() || null });
    setNewName('');
    setNewLocation('');
    setShowCreate(false);
    await refresh();
  };

  const handleRenameSubmit = async () => {
    if (!renaming || !renameText.trim()) return;
    await renameEvent(renaming.id, renameText.trim());
    setRenaming(null);
    await refresh();
  };

  const handleToggleArchive = async (event: EventRow) => {
    await archiveEvent(event.id, event.isArchived === 0);
    await refresh();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <SectionHeader title="Events" subtitle="Cards scanned are tagged with the currently selected event." icon={icons.event} />
        <PrimaryButton
          label="New Event"
          onPress={() => setShowCreate(true)}
          fullWidth={false}
          icon={<Ionicons name={icons.addPlain as any} size={18} color={colors.textOnPrimary} />}
        />
      </View>

      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <EmptyState icon={icons.event} title="No events yet" message="Create an event to start tagging scans by expo or location." />
        }
        renderItem={({ item }) => {
          const isCurrent = currentEvent?.id === item.id;
          const isArchived = item.isArchived === 1;
          return (
            <View style={[styles.eventRow, isCurrent && styles.eventRowActive]}>
              <Pressable style={styles.eventMain} onPress={() => selectEvent(item)} accessibilityRole="button" accessibilityLabel={`Select event ${item.name}`}>
                <View style={styles.eventNameRow}>
                  <Text style={styles.eventName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {isCurrent && (
                    <View style={styles.currentBadge}>
                      <Ionicons name={icons.checkmark as any} size={13} color={colors.textOnPrimary} />
                    </View>
                  )}
                </View>
                {!!item.location && (
                  <Text style={styles.eventLocation} numberOfLines={1}>
                    {item.location}
                  </Text>
                )}
                {isArchived && <Text style={styles.archivedTag}>Archived</Text>}
              </Pressable>
              <View style={styles.eventActions}>
                <Pressable
                  style={({ pressed }) => [styles.actionPill, pressed && styles.actionPillPressed]}
                  onPress={() => {
                    setRenaming(item);
                    setRenameText(item.name);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Rename ${item.name}`}
                  hitSlop={6}
                >
                  <Ionicons name={icons.edit as any} size={16} color={colors.primary} />
                  <Text style={styles.actionText}>Rename</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.actionPill, pressed && styles.actionPillPressed]}
                  onPress={() => handleToggleArchive(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${isArchived ? 'Unarchive' : 'Archive'} ${item.name}`}
                  hitSlop={6}
                >
                  <Ionicons name={icons.archive as any} size={16} color={colors.textSecondary} />
                  <Text style={[styles.actionText, { color: colors.textSecondary }]}>{isArchived ? 'Unarchive' : 'Archive'}</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Event</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="Event name (e.g. Industrial Expo 2026)"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={styles.input}
              value={newLocation}
              onChangeText={setNewLocation}
              placeholder="Location (optional)"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.modalActions}>
              <View style={styles.modalActionHalf}>
                <PrimaryButton label="Cancel" variant="outline" fullWidth={false} onPress={() => setShowCreate(false)} />
              </View>
              <View style={styles.modalActionHalf}>
                <PrimaryButton label="Create" fullWidth={false} onPress={handleCreate} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rename Event</Text>
            <TextInput style={styles.input} value={renameText} onChangeText={setRenameText} placeholderTextColor={colors.textMuted} />
            <View style={styles.modalActions}>
              <View style={styles.modalActionHalf}>
                <PrimaryButton label="Cancel" variant="outline" fullWidth={false} onPress={() => setRenaming(null)} />
              </View>
              <View style={styles.modalActionHalf}>
                <PrimaryButton label="Save" fullWidth={false} onPress={handleRenameSubmit} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, gap: spacing.md },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, flexGrow: 1 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    ...shadow.low,
  },
  eventRowActive: { backgroundColor: colors.primaryLight },
  eventMain: { flex: 1, minWidth: 0 },
  eventNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  eventName: { ...typography.bodyBold, color: colors.textPrimary, flexShrink: 1 },
  currentBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventLocation: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  archivedTag: { ...typography.caption, color: colors.warning, marginTop: 4, fontWeight: '600' },
  eventActions: { gap: spacing.xs, flexShrink: 0 },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    minHeight: 36,
  },
  actionPillPressed: { opacity: 0.7 },
  actionText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: colors.overlayDim, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, width: '100%', ...shadow.medium },
  modalTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  modalActionHalf: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: touchTarget.minHeight,
    marginBottom: spacing.sm,
    backgroundColor: colors.background,
    ...typography.body,
    color: colors.textPrimary,
  },
});
