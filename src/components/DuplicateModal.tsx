import React from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, shadow } from '../constants/theme';
import { icons } from '../constants/icons';
import { PrimaryButton } from './PrimaryButton';
import type { DuplicateMatch } from '../services/duplicates/duplicateDetection';

const REASON_LABEL: Record<DuplicateMatch['reason'], string> = {
  phone: 'Same phone number',
  email: 'Same email address',
  company_name: 'Same company name',
};

export function DuplicateModal({
  visible,
  matches,
  onSaveAsNew,
  onMerge,
  onCancel,
}: {
  visible: boolean;
  matches: DuplicateMatch[];
  onSaveAsNew: () => void;
  onMerge: (match: DuplicateMatch) => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <View style={styles.titleIconWrap}>
              <Ionicons name={icons.warning as any} size={20} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Possible duplicate found</Text>
              <Text style={styles.subtitle}>This card looks similar to an existing record. Choose how to save it.</Text>
            </View>
          </View>

          <ScrollView style={styles.matchList} showsVerticalScrollIndicator={false}>
            {matches.map((match, index) => (
              <Pressable
                key={index}
                style={({ pressed }) => [styles.matchRow, pressed && styles.matchRowPressed]}
                onPress={() => onMerge(match)}
                accessibilityRole="button"
                accessibilityLabel={`Merge into ${match.company.name}`}
              >
                <Text style={styles.matchCompany} numberOfLines={1}>{match.company.name}</Text>
                {match.representative && (
                  <Text style={styles.matchRep} numberOfLines={1}>{match.representative.name}</Text>
                )}
                <Text style={styles.matchReason}>{REASON_LABEL[match.reason]} — tap to merge into this record</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <PrimaryButton label="Save as New" onPress={onSaveAsNew} />
            <PrimaryButton label="Cancel" variant="outline" onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlayDim, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, width: '100%', maxHeight: '80%', ...shadow.medium },
  titleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  titleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.h3, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  matchList: { maxHeight: 220 },
  matchRow: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    ...shadow.low,
  },
  matchRowPressed: { opacity: 0.7 },
  matchCompany: { ...typography.bodyBold, color: colors.textPrimary },
  matchRep: { ...typography.body, color: colors.textSecondary, marginTop: 2 },
  matchReason: { ...typography.caption, color: colors.accent, marginTop: 6, fontWeight: '600' },
});
