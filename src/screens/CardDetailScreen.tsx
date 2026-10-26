import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Modal, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { colors, radius, spacing, typography, shadow } from '../constants/theme';
import { icons } from '../constants/icons';
import { SectionHeader, Divider } from '../components/Basics';
import { PrimaryButton } from '../components/PrimaryButton';
import { ImageViewer } from '../components/ImageViewer';
import { DigitalBusinessCard } from '../components/DigitalBusinessCard';
import { getCardWithDetails, deleteCard, getCardRepresentativeLinks, markRepresentativeContactSaved } from '../repositories/cardsRepo';
import { getPhonesForRepresentative, getEmailsForRepresentative } from '../repositories/representativesRepo';
import { deleteFileIfExists } from '../services/storage/fileStorage';
import { saveContactFromInput, ContactsPermissionDeniedError } from '../services/contacts/contactsService';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import { logError } from '../utils/logger';
import type { CardWithDetails, RepresentativeRow, PhoneNumberRow, EmailRow } from '../types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'CardDetail'>;

interface RepresentativeWithContact {
  representative: RepresentativeRow;
  phones: PhoneNumberRow[];
  emails: EmailRow[];
  contactSavedAt: string | null;
}

export function CardDetailScreen({ route, navigation }: Props) {
  const { cardId } = route.params;
  const [details, setDetails] = useState<CardWithDetails | null>(null);
  const [representatives, setRepresentatives] = useState<RepresentativeWithContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImages, setShowImages] = useState(false);
  const [savingContactFor, setSavingContactFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await getCardWithDetails(cardId);
    setDetails(d);

    const linked = await getCardRepresentativeLinks(cardId);
    const links =
      linked.length > 0
        ? linked
        : d?.representative
          ? [{ representative: d.representative, isPrimary: true, contactSavedAt: d.card.contactSavedAt }]
          : [];
    const withContact = await Promise.all(
      links.map(async (link) => ({
        representative: link.representative,
        phones: await getPhonesForRepresentative(link.representative.id),
        emails: await getEmailsForRepresentative(link.representative.id),
        contactSavedAt: link.contactSavedAt,
      }))
    );
    setRepresentatives(withContact);

    setLoading(false);
  }, [cardId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = useCallback(() => {
    Alert.alert('Delete card', 'This will permanently delete this card and its photos. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const images = await deleteCard(cardId);
            for (const img of images) {
              deleteFileIfExists(img.originalUri);
              if (img.thumbnailUri) deleteFileIfExists(img.thumbnailUri);
            }
            navigation.goBack();
          } catch (err) {
            logError('CardDetailScreen.handleDelete', err);
            Alert.alert('Could not delete this card', 'Please try again.');
          }
        },
      },
    ]);
  }, [cardId, navigation]);

  const handleSaveToContacts = useCallback(
    async (entry: RepresentativeWithContact) => {
      if (!details) return;
      setSavingContactFor(entry.representative.id);
      try {
        await saveContactFromInput({
          representative: entry.representative,
          phones: entry.phones,
          emails: entry.emails,
          company: details.company,
          eventName: details.event?.name ?? null,
          cardDisplayId: details.card.displayId,
        });
        await markRepresentativeContactSaved(cardId, entry.representative.id);
        await load();
        Alert.alert('Contact saved successfully.');
      } catch (err) {
        if (err instanceof ContactsPermissionDeniedError) {
          showPermissionDeniedAlert('Permission needed', err.message, err.canAskAgain);
        } else {
          logError('CardDetailScreen.handleSaveToContacts', err);
          Alert.alert('Could not save contact', (err as Error)?.message ?? 'Please try again.');
        }
      } finally {
        setSavingContactFor(null);
      }
    },
    [cardId, details, load]
  );

  if (loading || !details) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  const images = details.images.map((img) => ({ side: img.side, uri: img.originalUri }));
  const addressJoined = [details.company?.addressLine, details.company?.city, details.company?.state, details.company?.country]
    .filter(Boolean)
    .join(', ');
  const cardRepresentatives = representatives.map((entry) => ({
    id: entry.representative.id,
    name: entry.representative.name,
    designation: entry.representative.designation,
    phones: entry.phones.map((p) => p.rawValue),
    emails: entry.emails.map((e) => e.address),
  }));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.cardIdLabel}>{details.card.displayId}</Text>
        <DigitalBusinessCard
          companyName={details.company?.name ?? null}
          representatives={cardRepresentatives}
          website={details.company?.website}
          addressLine={addressJoined || null}
          categoryNames={details.categories.map((c) => c.name)}
        />

        {images.length > 0 && (
          <Pressable onPress={() => setShowImages(true)} style={styles.viewPhotoRow} accessibilityRole="button" accessibilityLabel="View original scanned photo">
            <Ionicons name={icons.image as any} size={16} color={colors.textSecondary} />
            <Text style={styles.viewPhotoText}>View original scanned photo</Text>
          </Pressable>
        )}

        <Divider />
        <SectionHeader title={representatives.length > 1 ? 'Save Representatives to Contacts' : 'Save to Contacts'} />
        {representatives.map((entry) => (
          <View key={entry.representative.id} style={styles.repCard}>
            <Text style={styles.repName}>{entry.representative.name}</Text>
            <View style={styles.repActionRow}>
              <PrimaryButton
                label={entry.contactSavedAt ? 'Contact Saved ✓' : 'Save to Contacts'}
                disabled={!!entry.contactSavedAt}
                loading={savingContactFor === entry.representative.id}
                onPress={() => handleSaveToContacts(entry)}
              />
            </View>
          </View>
        ))}

        {details.card.notes && (
          <>
            <SectionHeader title="Notes" icon={icons.notes as any} />
            <Text style={styles.detailLine}>{details.card.notes}</Text>
          </>
        )}

        <Divider />
        <Text style={styles.detailMeta}>Scanned {details.card.createdAt.slice(0, 10)} · {details.event?.name}</Text>
      </ScrollView>

      <View style={styles.actionBar}>
        <PrimaryButton label="Edit" variant="outline" onPress={() => navigation.navigate('Review', { cardId })} accessibilityLabel="Edit card" />
        <View style={styles.dangerZone}>
          <PrimaryButton label="Delete Card" variant="danger" onPress={handleDelete} accessibilityLabel="Delete card" />
        </View>
      </View>

      <Modal visible={showImages} animationType="slide" onRequestClose={() => setShowImages(false)}>
        <ImageViewer images={images} onClose={() => setShowImages(false)} />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: spacing.lg },
  cardIdLabel: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xs, fontWeight: '700' },
  viewPhotoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'center', marginTop: spacing.sm, padding: spacing.xs },
  viewPhotoText: { ...typography.secondary, color: colors.textSecondary, fontWeight: '600' },
  repCard: {
    backgroundColor: colors.elevatedSurface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.low,
  },
  repName: { ...typography.headline, color: colors.textSecondary },
  detailLine: { ...typography.body, color: colors.textPrimary, marginBottom: 4 },
  detailMeta: { ...typography.caption, color: colors.textMuted },
  repActionRow: { marginTop: spacing.sm },
  actionBar: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface, gap: spacing.sm, ...shadow.medium },
  // Dangerous actions get a visible separation (top border + extra spacing) from the safe "Edit"
  // action right above them, so a user can't mis-tap Delete while reaching for Edit.
  dangerZone: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: spacing.sm, marginTop: spacing.xs },
});
