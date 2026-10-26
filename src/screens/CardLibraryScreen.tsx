import React, { useCallback, useEffect, useState } from 'react';
import { View, TextInput, FlatList, StyleSheet, ActivityIndicator, Pressable, Text, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../types/navigation';
import { colors, radius, spacing, typography, shadow, floatingTabBarSpace } from '../constants/theme';
import { icons } from '../constants/icons';
import { CardListItem } from '../components/CardListItem';
import { EmptyState } from '../components/Basics';
import { PrimaryButton } from '../components/PrimaryButton';
import { listCards, type CardListFilters } from '../repositories/cardsRepo';
import { listEvents, type EventRow } from '../repositories/eventsRepo';
import { listCategories } from '../repositories/categoriesRepo';
import type { CardListItemView, CategoryRow } from '../types/models';
import { PAGINATION_CONFIG } from '../constants/config';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Library'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function CardLibraryScreen({ navigation }: Props) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<CardListItemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [filters, setFilters] = useState<CardListFilters>({});

  useEffect(() => {
    listEvents(true).then(setEvents);
    listCategories().then(setCategories);
  }, []);

  const runSearch = useCallback(
    async (reset: boolean) => {
      const offset = reset ? 0 : items.length;
      if (reset) setLoading(true);
      else setLoadingMore(true);

      const results = await listCards({
        ...filters,
        search,
        limit: PAGINATION_CONFIG.cardLibraryPageSize,
        offset,
      });

      setItems((prev) => (reset ? results : [...prev, ...results]));
      setHasMore(results.length === PAGINATION_CONFIG.cardLibraryPageSize);
      setLoading(false);
      setLoadingMore(false);
    },
    [search, filters, items.length]
  );

  useEffect(() => {
    const timer = setTimeout(() => runSearch(true), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filters]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      runSearch(true);
      // Picks up any category added/renamed/deleted in Settings → Categories since this screen
      // last mounted — it's a persistent tab screen, so without this the filter list would only
      // ever reflect categories that existed the first time the Library tab was opened.
      listCategories().then(setCategories);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.searchBar}>
        <View style={styles.searchInputWrap}>
          <Ionicons name={icons.search as any} size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search company, name, phone, email"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Search cards"
          />
        </View>
        <Pressable
          style={styles.filterButton}
          onPress={() => setShowFilters(true)}
          accessibilityRole="button"
          accessibilityLabel="Filter cards"
        >
          <Ionicons name={icons.filter as any} size={16} color={colors.primary} />
          <Text style={styles.filterButtonText}>Filter</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon={icons.libraryOutline as any}
          title="No cards found"
          message="Scan a business card or adjust your filters to see results here."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.cardId}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <CardListItem item={item} onPress={() => navigation.navigate('CardDetail', { cardId: item.cardId })} />
          )}
          onEndReached={() => hasMore && !loadingMore && runSearch(false)}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ margin: spacing.md }} /> : null}
        />
      )}

      <Modal visible={showFilters} animationType="slide" transparent onRequestClose={() => setShowFilters(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Filter Cards</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              <Text style={styles.filterLabel}>Event</Text>
              <FilterChipRow
                options={[{ id: undefined, name: 'All Events' }, ...events]}
                selected={filters.eventId}
                onSelect={(id) => setFilters((f) => ({ ...f, eventId: id }))}
              />
              <Text style={styles.filterLabel}>Category</Text>
              <FilterChipRow
                options={[{ id: undefined, name: 'All Categories' }, ...categories]}
                selected={filters.categoryId}
                onSelect={(id) => setFilters((f) => ({ ...f, categoryId: id }))}
              />
            </ScrollView>
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              <PrimaryButton label="Apply" onPress={() => setShowFilters(false)} />
              <PrimaryButton
                label="Clear Filters"
                variant="outline"
                onPress={() => {
                  setFilters({});
                  setShowFilters(false);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function FilterChipRow({
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
          style={[styles.filterChip, selected === opt.id && styles.filterChipSelected]}
          onPress={() => onSelect(opt.id)}
        >
          <Text style={[styles.filterChipText, selected === opt.id && styles.filterChipTextSelected]}>{opt.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchBar: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    ...shadow.low,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    ...typography.body,
    color: colors.textPrimary,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  filterButtonText: { ...typography.bodyBold, color: colors.primary },
  listContent: { padding: spacing.md, paddingBottom: floatingTabBarSpace },
  modalOverlay: { flex: 1, backgroundColor: colors.overlayDim, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.medium,
  },
  modalTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm },
  filterLabel: { ...typography.bodyBold, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  filterChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { ...typography.caption, color: colors.textPrimary },
  filterChipTextSelected: { color: colors.textOnPrimary },
});
