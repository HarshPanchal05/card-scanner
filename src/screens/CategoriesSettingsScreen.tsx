import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, shadow, touchTarget } from '../constants/theme';
import { icons } from '../constants/icons';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionHeader, EmptyState } from '../components/Basics';
import {
  listCategories,
  createCategory,
  renameCategory,
  deleteCategory,
  getCategoryCardCounts,
} from '../repositories/categoriesRepo';
import { OTHER_CATEGORY_NAME } from '../constants/categories';
import type { CategoryRow } from '../types/models';

/** Settings → Categories: the category management screen (add / rename / delete, with "Other" as
 *  a permanent, locked fallback bucket) — see leadRepository.ts and categoryManagementLogic.ts for
 *  how these categories feed the offline auto-classifier and how a deleted category's cards are
 *  moved to "Other" rather than lost. */
export function CategoriesSettingsScreen() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [addText, setAddText] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<CategoryRow | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [cats, cardCounts] = await Promise.all([listCategories(), getCategoryCardCounts()]);
    // "Other" always last — every other category alphabetically, matching listCategories' own
    // ordering (it's already ORDER BY name ASC, so this just needs to relocate Other to the end).
    const sorted = [
      ...cats.filter((c) => c.name !== OTHER_CATEGORY_NAME),
      ...cats.filter((c) => c.name === OTHER_CATEGORY_NAME),
    ];
    setCategories(sorted);
    setCounts(cardCounts);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAdd = async () => {
    setAddError(null);
    setAdding(true);
    try {
      await createCategory(addText);
      setAddText('');
      setShowAdd(false);
      await refresh();
    } catch (err: any) {
      setAddError(err?.message ?? 'Could not add category.');
    } finally {
      setAdding(false);
    }
  };

  const openEdit = (category: CategoryRow) => {
    setEditing(category);
    setEditText(category.name);
    setEditError(null);
  };

  const handleRenameSubmit = async () => {
    if (!editing) return;
    setEditError(null);
    setSaving(true);
    try {
      await renameCategory(editing.id, editText);
      setEditing(null);
      await refresh();
    } catch (err: any) {
      setEditError(err?.message ?? 'Could not rename category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await deleteCategory(deleting.id);
      setDeleting(null);
      await refresh();
    } catch (err: any) {
      Alert.alert('Could not delete category', err?.message ?? 'Please try again.');
    } finally {
      setDeletingBusy(false);
    }
  };

  const cardCountLabel = (n: number) => (n === 1 ? '1 card' : `${n} cards`);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <SectionHeader
          title="Your Categories"
          subtitle="Cards are automatically sorted into these based on what the scanner reads — or pick one yourself on the Review screen."
          icon={icons.category as any}
        />
        <PrimaryButton
          label="Add Category"
          onPress={() => {
            setAddText('');
            setAddError(null);
            setShowAdd(true);
          }}
          fullWidth={false}
          icon={<Ionicons name={icons.addPlain as any} size={18} color={colors.textOnPrimary} />}
        />
      </View>

      {!loading && (
        <FlatList
          data={categories}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState icon={icons.category as any} title="No categories yet" message="Add a category to start organizing scanned cards." />
          }
          renderItem={({ item }) => {
            const isOther = item.name === OTHER_CATEGORY_NAME;
            const count = counts[item.id] ?? 0;
            return (
              <View style={styles.categoryRow}>
                <View style={styles.categoryMain}>
                  <View style={styles.categoryNameRow}>
                    <Text style={styles.categoryName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {isOther && (
                      <View style={styles.lockBadge}>
                        <Ionicons name={icons.lock as any} size={12} color={colors.textOnPrimary} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.categoryCount}>
                    {isOther ? 'Permanent fallback · ' : ''}
                    {cardCountLabel(count)}
                  </Text>
                </View>
                {!isOther && (
                  <View style={styles.categoryActions}>
                    <Pressable
                      style={({ pressed }) => [styles.actionPill, pressed && styles.actionPillPressed]}
                      onPress={() => openEdit(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${item.name}`}
                      hitSlop={6}
                    >
                      <Ionicons name={icons.edit as any} size={16} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.actionPill, pressed && styles.actionPillPressed]}
                      onPress={() => setDeleting(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${item.name}`}
                      hitSlop={6}
                    >
                      <Ionicons name={icons.delete as any} size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Add Category */}
      <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Category</Text>
            <TextInput
              style={styles.input}
              value={addText}
              onChangeText={(t) => {
                setAddText(t);
                setAddError(null);
              }}
              placeholder="Category name (e.g. Furniture)"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            {addError && <Text style={styles.errorText}>{addError}</Text>}
            <View style={styles.modalActions}>
              <View style={styles.modalActionHalf}>
                <PrimaryButton label="Cancel" variant="outline" fullWidth={false} onPress={() => setShowAdd(false)} />
              </View>
              <View style={styles.modalActionHalf}>
                <PrimaryButton label="Add Category" fullWidth={false} loading={adding} onPress={handleAdd} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit / rename */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rename Category</Text>
            <TextInput
              style={styles.input}
              value={editText}
              onChangeText={(t) => {
                setEditText(t);
                setEditError(null);
              }}
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            {editError && <Text style={styles.errorText}>{editError}</Text>}
            <View style={styles.modalActions}>
              <View style={styles.modalActionHalf}>
                <PrimaryButton label="Cancel" variant="outline" fullWidth={false} onPress={() => setEditing(null)} />
              </View>
              <View style={styles.modalActionHalf}>
                <PrimaryButton label="Save" fullWidth={false} loading={saving} onPress={handleRenameSubmit} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete confirmation */}
      <Modal visible={!!deleting} transparent animationType="fade" onRequestClose={() => setDeleting(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete "{deleting?.name}"?</Text>
            <Text style={styles.modalBody}>
              This category currently contains {cardCountLabel(deleting ? counts[deleting.id] ?? 0 : 0)}. They will be
              moved to "{OTHER_CATEGORY_NAME}" — no cards, companies, or contact details are deleted.
            </Text>
            <View style={styles.modalActions}>
              <View style={styles.modalActionHalf}>
                <PrimaryButton label="Cancel" variant="outline" fullWidth={false} onPress={() => setDeleting(null)} />
              </View>
              <View style={styles.modalActionHalf}>
                <PrimaryButton
                  label={`Move to ${OTHER_CATEGORY_NAME}`}
                  variant="danger"
                  fullWidth={false}
                  loading={deletingBusy}
                  onPress={handleDeleteConfirm}
                />
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
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    ...shadow.low,
  },
  categoryMain: { flex: 1, minWidth: 0 },
  categoryNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  categoryName: { ...typography.bodyBold, color: colors.textPrimary, flexShrink: 1 },
  lockBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCount: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  categoryActions: { flexDirection: 'row', gap: spacing.xs, flexShrink: 0 },
  actionPill: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPillPressed: { opacity: 0.7 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlayDim, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, width: '100%', ...shadow.medium },
  modalTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  modalBody: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  modalActionHalf: { flex: 1 },
  errorText: { ...typography.caption, color: colors.danger, marginTop: -spacing.xs, marginBottom: spacing.sm },
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
