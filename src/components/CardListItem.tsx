import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { colors, radius, spacing, typography, shadow } from '../constants/theme';
import type { CardListItemView } from '../types/models';

const STATUS_LABEL: Record<string, string> = {
  captured: 'Captured',
  processing: 'Processing',
  needs_review: 'Needs Review',
  saved: 'Saved',
  failed: 'Failed',
};

export function CardListItem({ item, onPress }: { item: CardListItemView; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.containerPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.companyName || 'Unknown Company'}, ${item.representativeName || 'Unknown Contact'}`}
    >
      {item.thumbnailUri ? (
        <Image
          source={{ uri: item.thumbnailUri }}
          style={styles.thumbnail}
          recyclingKey={item.cardId}
          cachePolicy="disk"
          contentFit="cover"
        />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
          <Text style={styles.placeholderText}>No image</Text>
        </View>
      )}
      <View style={styles.details}>
        <Text style={styles.company} numberOfLines={1}>
          {item.companyName || 'Unknown Company'}
        </Text>
        <Text style={styles.rep} numberOfLines={1}>
          {item.representativeName || 'Unknown Contact'}
        </Text>
        {item.categoryNames.length > 0 && (
          <Text style={styles.categories} numberOfLines={1}>
            {item.categoryNames.join(', ')}
          </Text>
        )}
        <View style={styles.metaRow}>
          <Text style={styles.date}>{item.createdAt.slice(0, 10)}</Text>
          <Text style={[styles.status, item.status === 'saved' ? styles.statusSaved : styles.statusPending]}>
            {STATUS_LABEL[item.status] ?? item.status}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.elevatedSurface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    ...shadow.low,
  },
  containerPressed: { opacity: 0.8 },
  thumbnail: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  thumbnailPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  details: { flex: 1, marginLeft: spacing.sm, justifyContent: 'center' },
  company: { ...typography.bodyBold, color: colors.textPrimary },
  rep: { ...typography.body, color: colors.textSecondary },
  categories: { ...typography.caption, color: colors.accent, marginTop: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  date: { ...typography.caption, color: colors.textMuted },
  status: { ...typography.caption, fontWeight: '700', borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  statusSaved: { color: colors.success, backgroundColor: 'rgba(27,138,61,0.1)' },
  statusPending: { color: colors.warning, backgroundColor: 'rgba(184,134,11,0.1)' },
});
