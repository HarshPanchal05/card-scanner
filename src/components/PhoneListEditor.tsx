import React from 'react';
import { View, TextInput, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, touchTarget } from '../constants/theme';
import { icons } from '../constants/icons';
import type { PhoneKind } from '../types/models';

export interface EditablePhone {
  rawValue: string;
  kind: PhoneKind;
}

const KIND_CYCLE: PhoneKind[] = ['mobile', 'office', 'landline', 'whatsapp', 'fax', 'other'];

const KIND_LABEL: Record<PhoneKind, string> = {
  mobile: 'Mobile',
  office: 'Office',
  landline: 'Landline',
  whatsapp: 'WhatsApp',
  fax: 'Fax',
  other: 'Other',
};

export function PhoneListEditor({
  phones,
  onChange,
}: {
  phones: EditablePhone[];
  onChange: (phones: EditablePhone[]) => void;
}) {
  const updateAt = (index: number, patch: Partial<EditablePhone>) => {
    const next = phones.map((p, i) => (i === index ? { ...p, ...patch } : p));
    onChange(next);
  };

  const removeAt = (index: number) => {
    onChange(phones.filter((_, i) => i !== index));
  };

  const cycleKind = (index: number) => {
    const current = phones[index].kind;
    const nextKind = KIND_CYCLE[(KIND_CYCLE.indexOf(current) + 1) % KIND_CYCLE.length];
    updateAt(index, { kind: nextKind });
  };

  return (
    <View>
      {phones.map((phone, index) => (
        <View key={index} style={styles.row}>
          <TextInput
            style={styles.input}
            value={phone.rawValue}
            onChangeText={(text) => updateAt(index, { rawValue: text })}
            keyboardType="phone-pad"
            placeholder="Phone number"
            placeholderTextColor={colors.textMuted}
          />
          <Pressable
            style={({ pressed }) => [styles.kindBadge, pressed && styles.pressedDim]}
            onPress={() => cycleKind(index)}
            accessibilityRole="button"
            accessibilityLabel={`Phone type: ${KIND_LABEL[phone.kind]}, tap to change`}
          >
            <Text style={styles.kindText} numberOfLines={1}>
              {KIND_LABEL[phone.kind]}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.removeButton, pressed && styles.pressedDim]}
            onPress={() => removeAt(index)}
            accessibilityRole="button"
            accessibilityLabel="Remove phone number"
            hitSlop={6}
          >
            <Ionicons name={icons.delete as any} size={18} color={colors.danger} />
          </Pressable>
        </View>
      ))}
      <Pressable
        style={({ pressed }) => [styles.addRow, pressed && styles.pressedDim]}
        onPress={() => onChange([...phones, { rawValue: '', kind: 'mobile' }])}
        accessibilityRole="button"
        accessibilityLabel="Add phone number"
      >
        <Ionicons name={icons.addPlain as any} size={18} color={colors.primary} />
        <Text style={styles.addText}>Add phone number</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.xs },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: touchTarget.minHeight,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  kindBadge: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    minHeight: touchTarget.minHeight,
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  kindText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  removeButton: {
    width: touchTarget.minHeight,
    height: touchTarget.minHeight,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  pressedDim: { opacity: 0.7 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    minHeight: touchTarget.minHeight,
  },
  addText: { ...typography.bodyBold, color: colors.primary },
});
