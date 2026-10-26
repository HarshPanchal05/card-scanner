import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, touchTarget } from '../constants/theme';
import { icons } from '../constants/icons';
import type { CategoryRow } from '../types/models';
import { OTHER_CATEGORY_NAME } from '../constants/categories';

/** Single-select category chooser for the Review screen. Exactly one category is ever selected —
 *  tapping a different chip replaces the selection (never adds to it) and always counts as an
 *  explicit user choice, which the caller should treat as a manual override (see ReviewScreen's
 *  `categorySource` handling). */
export function CategoryPicker({
  allCategories,
  selected,
  onChange,
  onCreateCustom,
}: {
  allCategories: CategoryRow[];
  selected: string;
  onChange: (name: string) => void;
  onCreateCustom: (name: string) => void;
}) {
  const [customText, setCustomText] = useState('');

  const addCustom = () => {
    const name = customText.trim();
    if (!name) return;
    if (!allCategories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      onCreateCustom(name);
    }
    onChange(name);
    setCustomText('');
  };

  const orderedCategories = [
    ...allCategories.filter((c) => c.name !== OTHER_CATEGORY_NAME),
    ...(allCategories.some((c) => c.name === OTHER_CATEGORY_NAME)
      ? []
      : [{ id: 'other-virtual', name: OTHER_CATEGORY_NAME, isCustom: 0 as const, createdAt: '' }]),
  ];

  return (
    <View>
      <View style={styles.chipWrap}>
        {orderedCategories.map((cat) => {
          const isSelected = selected === cat.name;
          return (
            <Pressable
              key={cat.id}
              onPress={() => onChange(cat.name)}
              style={[styles.chip, isSelected && styles.chipSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{cat.name}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.customRow}>
        <TextInput
          style={styles.customInput}
          value={customText}
          onChangeText={setCustomText}
          placeholder="Add custom category"
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={addCustom}
        />
        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
          onPress={addCustom}
          accessibilityRole="button"
          accessibilityLabel="Add custom category"
          hitSlop={6}
        >
          <Ionicons name={icons.addPlain as any} size={18} color={colors.primary} />
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 4,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  chipTextSelected: { color: colors.textOnPrimary },
  customRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: touchTarget.minHeight,
    backgroundColor: colors.surface,
    ...typography.body,
    color: colors.textPrimary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    minHeight: touchTarget.minHeight,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addButtonPressed: { opacity: 0.7 },
  addButtonText: { ...typography.bodyBold, color: colors.primary },
});
