import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, shadow } from '../constants/theme';
import { icons } from '../constants/icons';
import { PhoneListEditor, type EditablePhone } from './PhoneListEditor';
import { Divider } from './Basics';

export interface RepresentativeFormState {
  personName: string;
  designation: string;
  department: string;
  phones: EditablePhone[];
  emails: string;
  /** Set only when this section was prefilled from an already-saved representative (editing an
   *  existing card) — lets saveLeadMultiRep update that exact row in place instead of creating a
   *  new one. Left undefined for a freshly-detected or manually-added section. */
  existingId?: string;
}

export function emptyRepresentativeForm(): RepresentativeFormState {
  return { personName: '', designation: '', department: '', phones: [], emails: '' };
}

/** One editable representative — reused as a single section on an ordinary one-person card, or
 *  repeated (with add/remove) when a card lists multiple people. Visually identical to the
 *  previous flat single-representative form when there's only one section on screen; the
 *  "Remove representative" action only appears when the caller passes `onRemove` (i.e. there's
 *  more than one section), so an ordinary card's Review screen looks exactly as it did before
 *  this component existed. */
export function RepresentativeFormSection({
  index,
  value,
  onChange,
  onRemove,
}: {
  index: number;
  value: RepresentativeFormState;
  onChange: (next: RepresentativeFormState) => void;
  onRemove?: () => void;
}) {
  return (
    <View style={onRemove ? styles.card : undefined}>
      {onRemove && (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarWrap}>
              <Ionicons name={icons.representative as any} size={16} color={colors.primary} />
            </View>
            <Text style={styles.headerLabel}>Representative {index + 1}</Text>
          </View>
          <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove representative ${index + 1}`}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      )}
      <TextInput
        style={styles.input}
        value={value.personName}
        onChangeText={(t) => onChange({ ...value, personName: t })}
        placeholder="Representative name"
        placeholderTextColor={colors.textMuted}
      />
      <TextInput
        style={styles.input}
        value={value.designation}
        onChangeText={(t) => onChange({ ...value, designation: t })}
        placeholder="Designation"
        placeholderTextColor={colors.textMuted}
      />
      <TextInput
        style={styles.input}
        value={value.department}
        onChangeText={(t) => onChange({ ...value, department: t })}
        placeholder="Department (optional)"
        placeholderTextColor={colors.textMuted}
      />
      <Text style={styles.fieldLabel}>Phone Numbers</Text>
      <PhoneListEditor phones={value.phones} onChange={(phones) => onChange({ ...value, phones })} />
      <Text style={styles.fieldLabel}>Email</Text>
      <TextInput
        style={styles.input}
        value={value.emails}
        onChangeText={(t) => onChange({ ...value, emails: t })}
        placeholder="Email address(es), comma separated"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      {!onRemove && <Divider />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.elevatedSurface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.low,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  avatarWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: { ...typography.bodyBold, color: colors.textSecondary },
  removeText: { ...typography.caption, color: colors.danger, fontWeight: '700' },
  fieldLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600', marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    ...typography.body,
    color: colors.textPrimary,
  },
});
