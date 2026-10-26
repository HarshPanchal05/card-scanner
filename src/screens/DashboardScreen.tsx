import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../types/navigation';
import { colors, gradients, radius, spacing, typography, shadow, floatingTabBarSpace } from '../constants/theme';
import { icons } from '../constants/icons';
import { PrimaryButton } from '../components/PrimaryButton';
import { Gradient } from '../components/Gradient';
import { DigitalBusinessCard } from '../components/DigitalBusinessCard';
import { getDashboardStats, listCards, type DashboardStats } from '../repositories/cardsRepo';
import type { CardListItemView } from '../types/models';
import { useEventStore } from '../state/eventStore';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Dashboard'>,
  NativeStackScreenProps<RootStackParamList>
>;

const STAT_ITEMS: { key: keyof DashboardStats; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'totalCards', label: 'Cards scanned', icon: icons.libraryOutline as any },
  { key: 'totalCompanies', label: 'Companies', icon: icons.company as any },
  { key: 'todayScans', label: "Today's scans", icon: icons.scanOutline as any },
  { key: 'potentialDuplicates', label: 'Possible duplicates', icon: icons.warning as any },
];

// The dashboard search box searches everything listCards() already supports (company, name,
// designation, phone, email — see cardsRepo.ts) rather than duplicating that query logic here.
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_RESULT_LIMIT = 20;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function DashboardScreen({ navigation }: Props) {
  const currentEvent = useEventStore((s) => s.currentEvent);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<CardListItemView[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CardListItemView[]>([]);
  const [searching, setSearching] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [s, r] = await Promise.all([
      getDashboardStats(currentEvent?.id),
      listCards({ eventId: currentEvent?.id, limit: 5 }),
    ]);
    setStats(s);
    setRecent(r);
  }, [currentEvent]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation, load]);

  // Real local-database search, debounced — no mock/fake results, and an empty query simply
  // clears the results (the normal dashboard content below shows again).
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchDebounce.current = setTimeout(async () => {
      const results = await listCards({ search: trimmed, limit: SEARCH_RESULT_LIMIT });
      setSearchResults(results);
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [query]);

  const isSearching = query.trim().length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Gradient colors={gradients.hero} style={styles.hero}>
        <Text style={styles.greeting}>{greeting()}</Text>
        <Pressable style={({ pressed }) => [styles.eventBanner, pressed && styles.eventBannerPressed]} onPress={() => navigation.navigate('Events')}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eventLabel}>Current Event</Text>
            <Text style={styles.eventName} numberOfLines={1}>{currentEvent?.name ?? 'No event selected'}</Text>
          </View>
          <Ionicons name={icons.forward as any} size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>

        <View style={styles.searchBar}>
          <Ionicons name={icons.search as any} size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search company or executive..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            accessibilityLabel="Search saved cards"
          />
          {searching && <ActivityIndicator size="small" color={colors.primary} />}
          {isSearching && !searching && (
            <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search" hitSlop={8}>
              <Ionicons name={icons.close as any} size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </Gradient>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {isSearching ? (
          <SearchResults results={searchResults} loading={searching} query={query} onSelect={(id) => navigation.navigate('CardDetail', { cardId: id })} />
        ) : (
          <>
            <PrimaryButton
              label="Scan New Business Card"
              icon={<Ionicons name={icons.scan as any} size={20} color={colors.textOnPrimary} />}
              onPress={() => navigation.navigate('Scanner', undefined)}
            />

            {stats && (
              <View style={styles.statsGrid}>
                {STAT_ITEMS.map((item) => (
                  <View key={item.key} style={styles.statTile}>
                    <View style={styles.statIconWrap}>
                      <Ionicons name={item.icon} size={16} color={colors.primary} />
                    </View>
                    <Text style={styles.statValue}>{stats[item.key]}</Text>
                    <Text style={styles.statLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent Cards</Text>
              <Pressable onPress={() => navigation.navigate('Library')}>
                <Text style={styles.sectionAction}>See all</Text>
              </Pressable>
            </View>

            {recent.length === 0 ? (
              <View style={styles.emptyRecent}>
                <Ionicons name={icons.libraryOutline as any} size={28} color={colors.textMuted} />
                <Text style={styles.emptyRecentText}>Your scanned business cards will appear here.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentScroller} contentContainerStyle={{ gap: spacing.sm }}>
                {recent.map((card) => (
                  <Pressable
                    key={card.cardId}
                    style={({ pressed }) => [styles.recentCardWrap, pressed && styles.recentRowPressed]}
                    onPress={() => navigation.navigate('CardDetail', { cardId: card.cardId })}
                  >
                    <DigitalBusinessCard
                      companyName={card.companyName}
                      representatives={card.representativeName ? [{ id: card.cardId, name: card.representativeName }] : []}
                      compact
                      style={styles.recentCard}
                      onPress={() => navigation.navigate('CardDetail', { cardId: card.cardId })}
                    />
                    <Text style={styles.recentCompany} numberOfLines={1}>{card.companyName || 'Unknown Company'}</Text>
                    <Text style={styles.recentRep} numberOfLines={1}>{card.representativeName || 'Unknown Contact'} · {timeAgo(card.createdAt)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SearchResults({
  results,
  loading,
  query,
  onSelect,
}: {
  results: CardListItemView[];
  loading: boolean;
  query: string;
  onSelect: (cardId: string) => void;
}) {
  if (loading && results.length === 0) {
    return (
      <View style={styles.searchStatus}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (results.length === 0) {
    return (
      <View style={styles.searchStatus}>
        <Ionicons name={icons.search as any} size={26} color={colors.textMuted} />
        <Text style={styles.emptyRecentText}>No results found for "{query.trim()}"</Text>
      </View>
    );
  }
  return (
    <View>
      <Text style={styles.sectionTitle}>Results</Text>
      {results.map((card) => (
        <Pressable key={card.cardId} style={({ pressed }) => [styles.searchResultRow, pressed && styles.recentRowPressed]} onPress={() => onSelect(card.cardId)}>
          <View style={styles.recentIconWrap}>
            <Ionicons name={icons.company as any} size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.recentCompany} numberOfLines={1}>{card.companyName || 'Unknown Company'}</Text>
            <Text style={styles.recentRep} numberOfLines={1}>{card.representativeName || 'Unknown Contact'}</Text>
            {card.categoryNames.length > 0 && (
              <Text style={styles.searchResultMeta} numberOfLines={1}>{card.categoryNames.join(', ')}</Text>
            )}
          </View>
          <Ionicons name={icons.forward as any} size={16} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  hero: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  content: { padding: spacing.lg, paddingBottom: floatingTabBarSpace },
  greeting: { ...typography.largeTitle, color: colors.textOnPrimary, marginBottom: spacing.md },
  eventBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  eventBannerPressed: { opacity: 0.85 },
  eventLabel: { ...typography.caption, color: 'rgba(255,255,255,0.75)' },
  eventName: { ...typography.headline, color: colors.textOnPrimary, marginTop: 2 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    height: 48,
    ...shadow.medium,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary, height: '100%' },
  searchStatus: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.elevatedSurface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    gap: spacing.sm,
    ...shadow.low,
  },
  searchResultMeta: { ...typography.caption, color: colors.accent, marginTop: 1 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: spacing.lg },
  statTile: {
    flexBasis: '48%',
    backgroundColor: colors.elevatedSurface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.low,
  },
  statIconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { ...typography.title, color: colors.textPrimary, marginTop: spacing.xs },
  statLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...typography.headline, color: colors.textPrimary },
  sectionAction: { ...typography.secondary, color: colors.accent },
  emptyRecent: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.elevatedSurface,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  emptyRecentText: { ...typography.secondary, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.lg },
  recentScroller: { marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg },
  recentCardWrap: { width: 180 },
  recentCard: { marginBottom: spacing.xs },
  recentRowPressed: { opacity: 0.8 },
  recentIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentCompany: { ...typography.bodyBold, color: colors.textPrimary },
  recentRep: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
});
