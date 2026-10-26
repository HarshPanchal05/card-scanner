import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { colors, spacing, typography, radius, shadow } from '../constants/theme';
import { SectionHeader, Divider } from '../components/Basics';
import { PrimaryButton } from '../components/PrimaryButton';
import { CategoryPicker } from '../components/CategoryPicker';
import { DuplicateModal } from '../components/DuplicateModal';
import { ImageViewer } from '../components/ImageViewer';
import {
  RepresentativeFormSection,
  emptyRepresentativeForm,
  type RepresentativeFormState,
} from '../components/RepresentativeFormSection';
import { getCardWithDetails, getRepresentativesForCard } from '../repositories/cardsRepo';
import { listCategories, getOrCreateCategory } from '../repositories/categoriesRepo';
import { saveLead, saveLeadMultiRep, resolveClaimedRepresentativeId } from '../repositories/leadRepository';
import { getPhonesForRepresentative, getEmailsForRepresentative } from '../repositories/representativesRepo';
import { findPossibleDuplicates, findExactRepresentativeMatch, type DuplicateMatch } from '../services/duplicates/duplicateDetection';
import { saveCardToContacts, ContactsPermissionDeniedError } from '../services/contacts/contactsService';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import { logError } from '../utils/logger';
import { markContactSaved } from '../repositories/cardsRepo';
import { OTHER_CATEGORY_NAME } from '../constants/categories';
import type { CategoryRow, CardWithDetails, CategorySource } from '../types/models';
import type { ExtractionResult } from '../types/extraction';

type Props = NativeStackScreenProps<RootStackParamList, 'Review'>;

interface FormState {
  companyName: string;
  representatives: RepresentativeFormState[];
  website: string;
  addressLine: string;
  city: string;
  state: string;
  country: string;
  /** Single authoritative category — always a real name, defaulting to "Other". */
  category: string;
  /** 'auto' while this is still just the classifier's untouched suggestion; becomes 'manual' the
   *  moment the user picks a category themselves, which is what stops a later automatic
   *  classification from silently overwriting their choice — see leadRepository.ts. */
  categorySource: CategorySource;
  notes: string;
}

function emptyForm(): FormState {
  return {
    companyName: '',
    representatives: [emptyRepresentativeForm()],
    website: '',
    addressLine: '',
    city: '',
    state: '',
    country: '',
    category: OTHER_CATEGORY_NAME,
    categorySource: 'auto',
    notes: '',
  };
}

function formFromExtraction(extraction: ExtractionResult): FormState {
  // A card that lists multiple people (see multiRepresentative.ts) pre-populates one section per
  // detected representative, each with only their own phones/emails. An ordinary card (the
  // common case — `representatives` is null) falls back to exactly one section built from the
  // flat fields, identical to the form before multi-representative support existed.
  const representatives: RepresentativeFormState[] = extraction.representatives
    ? extraction.representatives.map((r) => ({
        personName: r.name,
        designation: r.designation ?? '',
        department: r.department ?? '',
        phones: r.phones.map((p) => ({ rawValue: p.raw, kind: p.kind })),
        emails: r.emails.join(', '),
      }))
    : [
        {
          personName: extraction.personName ?? '',
          designation: extraction.designation ?? '',
          department: extraction.department ?? '',
          phones: extraction.phones.map((p) => ({ rawValue: p.raw, kind: p.kind })),
          emails: extraction.emails.join(', '),
        },
      ];

  return {
    companyName: extraction.companyName ?? '',
    representatives,
    website: extraction.website ?? '',
    addressLine: extraction.addressLine ?? '',
    city: extraction.city ?? '',
    state: extraction.state ?? '',
    country: extraction.country ?? '',
    category: extraction.primaryCategory,
    categorySource: 'auto',
    notes: '',
  };
}

/** Builds the form from the currently-saved lead(s) rather than the original OCR extraction —
 *  used when re-opening an already-saved card for editing, so a second edit pass shows (and
 *  starts from) any corrections made the first time, instead of reverting to the raw OCR guess.
 *  Fetches every representative linked to the card (not just the primary one), each with their
 *  own phones/emails. */
async function formFromDetails(details: CardWithDetails): Promise<FormState> {
  const linkedReps = await getRepresentativesForCard(details.card.id);
  const repsToShow = linkedReps.length > 0 ? linkedReps : details.representative ? [details.representative] : [];

  const representatives: RepresentativeFormState[] = await Promise.all(
    repsToShow.map(async (rep) => {
      const [phones, emails] = await Promise.all([getPhonesForRepresentative(rep.id), getEmailsForRepresentative(rep.id)]);
      return {
        personName: rep.name,
        designation: rep.designation ?? '',
        department: rep.department ?? '',
        phones: phones.map((p) => ({ rawValue: p.rawValue, kind: p.kind })),
        emails: emails.map((e) => e.address).join(', '),
        existingId: rep.id,
      };
    })
  );

  return {
    companyName: details.company?.name ?? '',
    representatives: representatives.length > 0 ? representatives : [emptyRepresentativeForm()],
    website: details.company?.website ?? '',
    addressLine: details.company?.addressLine ?? '',
    city: details.company?.city ?? '',
    state: details.company?.state ?? '',
    country: details.company?.country ?? '',
    category: details.categories[0]?.name ?? OTHER_CATEGORY_NAME,
    // Carries forward whatever this company's category source already was, so simply re-opening
    // and re-saving a card without touching the Category field never demotes a prior manual
    // choice back to 'auto' (which would make it eligible for silent auto-overwrite again).
    categorySource: details.company?.categorySource ?? 'auto',
    notes: details.card.notes ?? '',
  };
}

export function ReviewScreen({ route, navigation }: Props) {
  const { cardId } = route.params;
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<CardWithDetails | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [allCategories, setAllCategories] = useState<CategoryRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  // Whether this card already had a saved lead the moment the screen was first opened — captured
  // once, on the first load only. Distinguishes "just finished scanning" (show Scan Another Card)
  // from "editing an existing card from the Card Library" (no Scan Another Card; Save updates the
  // existing company/representative in place, and duplicate-detection is skipped since it would
  // otherwise just match the card's own record against itself).
  const hasLoadedOnceRef = useRef(false);
  const wasAlreadySavedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [cardDetails, categories] = await Promise.all([getCardWithDetails(cardId), listCategories()]);
    setDetails(cardDetails);
    setAllCategories(categories);

    if (cardDetails) {
      if (!hasLoadedOnceRef.current) {
        wasAlreadySavedRef.current = cardDetails.card.status === 'saved';
        hasLoadedOnceRef.current = true;
        // Prefill from the currently-saved lead (so a second edit pass starts from any earlier
        // corrections) when one exists; otherwise fall back to the raw OCR extraction guess.
        if (wasAlreadySavedRef.current) {
          setForm(await formFromDetails(cardDetails));
        } else if (cardDetails.card.extractionJson) {
          const extraction: ExtractionResult = JSON.parse(cardDetails.card.extractionJson);
          setForm(formFromExtraction(extraction));
        }
      }
    }

    setContactSaved(!!cardDetails?.card.contactSavedAt);
    setSaved(cardDetails?.card.status === 'saved');
    setLoading(false);
  }, [cardId]);

  useEffect(() => {
    load();
  }, [load]);

  const buildCompanyInput = useCallback(
    () => ({
      name: form.companyName.trim(),
      website: form.website.trim() || null,
      addressLine: form.addressLine.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      country: form.country.trim() || null,
    }),
    [form]
  );

  const performSave = useCallback(
    async (reuse: { companyId?: string | null; representativeId?: string | null } = {}) => {
      setSaving(true);
      try {
        if (form.representatives.length > 1) {
          // Resolved sequentially (not Promise.all) so each match lookup can see which existing
          // representative ids earlier people in this same save have already claimed — see the
          // claimedRepresentativeIds guard below.
          const claimedRepresentativeIds = new Set<string>();
          const representatives = [];
          for (const rep of form.representatives) {
            const phones = rep.phones.filter((p) => p.rawValue.trim().length > 0);
            const emails = rep.emails
              .split(',')
              .map((e) => e.trim())
              .filter(Boolean);

            // Set when this section was prefilled from an already-saved representative (editing
            // an existing multi-representative card) — updates that exact row instead of
            // creating a duplicate. Otherwise, for a fresh section (a new scan, or one manually
            // added via "+ Add another representative"), an exact phone/email match against an
            // existing representative is unambiguous enough to auto-merge without a modal
            // prompt — without this, saving a card where one person's number is already known
            // would silently create a duplicate row for that same real person.
            const candidateId =
              rep.existingId ?? (await findExactRepresentativeMatch(phones.map((p) => p.rawValue), emails))?.id ?? null;
            // See resolveClaimedRepresentativeId's doc comment: prevents two different people on
            // this card from both matching (and one silently overwriting) the same existing row.
            const reuseRepresentativeId = resolveClaimedRepresentativeId(candidateId, claimedRepresentativeIds);
            if (reuseRepresentativeId) claimedRepresentativeIds.add(reuseRepresentativeId);

            representatives.push({
              representative: {
                name: rep.personName.trim(),
                designation: rep.designation.trim() || null,
                department: rep.department.trim() || null,
              },
              phones,
              emails,
              reuseRepresentativeId,
            });
          }

          await saveLeadMultiRep({
            cardId,
            company: buildCompanyInput(),
            representatives,
            categoryName: form.category,
            categorySource: form.categorySource,
            notes: form.notes.trim() || null,
            reuseCompanyId: reuse.companyId ?? null,
            isEditingSavedCard: wasAlreadySavedRef.current,
          });
        } else {
          const rep = form.representatives[0];
          await saveLead({
            cardId,
            // Raw, un-defaulted values — saveLead() decides whether/where to apply the
            // "Unknown Company"/"Unknown Contact" fallback so a blank field on a second card never
            // overwrites a first card's already-known data for a shared company (see leadRepository.ts).
            company: buildCompanyInput(),
            representative: {
              name: rep.personName.trim(),
              designation: rep.designation.trim() || null,
              department: rep.department.trim() || null,
            },
            phones: rep.phones.filter((p) => p.rawValue.trim().length > 0),
            emails: rep.emails
              .split(',')
              .map((e) => e.trim())
              .filter(Boolean),
            categoryName: form.category,
            categorySource: form.categorySource,
            notes: form.notes.trim() || null,
            reuseCompanyId: reuse.companyId ?? null,
            reuseRepresentativeId: reuse.representativeId ?? null,
          });
        }
        const isEditOfExisting = wasAlreadySavedRef.current;
        setSaved(true);
        setShowDuplicateModal(false);
        await load();
        // For a fresh scan, the action row appearing below is itself the confirmation. For an
        // edit of an already-saved card, nothing else on screen visibly changes — without this,
        // the user has no signal their correction actually persisted.
        if (isEditOfExisting) Alert.alert('Changes saved.');
      } catch (err: any) {
        logError('ReviewScreen.performSave', err);
        Alert.alert('Could not save lead', err?.message ?? 'Please try again.');
      } finally {
        setSaving(false);
      }
    },
    [cardId, form, load, buildCompanyInput]
  );

  const handleSaveLead = useCallback(async () => {
    const hasAnyName = form.representatives.some((r) => r.personName.trim().length > 0);
    if (!form.companyName.trim() && !hasAnyName) {
      Alert.alert('Missing details', 'Enter at least a company name or a representative name before saving.');
      return;
    }

    // Editing a card that already has a saved lead: save the edits back onto its own existing
    // company/representative. Running duplicate-detection here would just match the card against
    // itself (same phone/email/company name) and show a nonsensical "possible duplicate" pointing
    // at its own record.
    if (wasAlreadySavedRef.current && details?.card.companyId && details?.card.representativeId) {
      await performSave({ companyId: details.card.companyId, representativeId: details.card.representativeId });
      return;
    }

    // Duplicate check runs against the company plus every representative's phones/emails combined
    // — for a multi-representative card this only decides whether the *company* should be reused;
    // each individual person is still saved as a new representative (see performSave above).
    const matches = await findPossibleDuplicates({
      companyName: form.companyName || null,
      personName: form.representatives[0]?.personName || null,
      phones: form.representatives.flatMap((r) => r.phones.map((p) => p.rawValue)),
      emails: form.representatives.flatMap((r) => r.emails.split(',').map((e) => e.trim())),
    });
    if (matches.length > 0) {
      setDuplicateMatches(matches);
      setShowDuplicateModal(true);
      return;
    }
    await performSave();
  }, [form, performSave, details]);

  const handleSaveToContacts = useCallback(async () => {
    if (!details) return;
    setSavingContact(true);
    try {
      const refreshed = await getCardWithDetails(cardId);
      if (!refreshed) throw new Error('Card not found.');
      await saveCardToContacts(refreshed);
      await markContactSaved(cardId);
      setContactSaved(true);
      Alert.alert('Contact saved successfully.');
    } catch (err) {
      if (err instanceof ContactsPermissionDeniedError) {
        showPermissionDeniedAlert('Permission needed', err.message, err.canAskAgain);
      } else {
        logError('ReviewScreen.handleSaveToContacts', err);
        Alert.alert('Could not save contact', (err as Error)?.message ?? 'Please try again.');
      }
    } finally {
      setSavingContact(false);
    }
  }, [cardId, details]);

  const handleCreateCustomCategory = useCallback(async (name: string) => {
    const created = await getOrCreateCategory(name, true);
    setAllCategories((prev) => [...prev, created]);
  }, []);

  const updateRepresentativeAt = (index: number, next: RepresentativeFormState) => {
    setForm((f) => ({
      ...f,
      representatives: f.representatives.map((r, i) => (i === index ? next : r)),
    }));
  };

  const addRepresentative = () => {
    setForm((f) => ({ ...f, representatives: [...f.representatives, emptyRepresentativeForm()] }));
  };

  const removeRepresentativeAt = (index: number) => {
    setForm((f) => ({ ...f, representatives: f.representatives.filter((_, i) => i !== index) }));
  };

  if (loading || !details) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  const images = details.images.map((img) => ({ side: img.side, uri: img.originalUri }));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.cardIdLabel}>{details.card.displayId}</Text>

        <SectionHeader title="Company" />
        <TextInput
          style={styles.input}
          value={form.companyName}
          onChangeText={(t) => setForm((f) => ({ ...f, companyName: t }))}
          placeholder="Company name"
          placeholderTextColor={colors.textMuted}
        />

        <Divider />
        <SectionHeader
          title={form.representatives.length > 1 ? 'Representatives' : 'Representative'}
          subtitle={
            form.representatives.length > 1
              ? 'Multiple people were detected on this card — review each, or add/remove as needed.'
              : undefined
          }
        />
        {form.representatives.map((rep, index) => (
          <RepresentativeFormSection
            key={index}
            index={index}
            value={rep}
            onChange={(next) => updateRepresentativeAt(index, next)}
            onRemove={form.representatives.length > 1 ? () => removeRepresentativeAt(index) : undefined}
          />
        ))}
        <Pressable onPress={addRepresentative} style={styles.addRepresentativeRow}>
          <Text style={styles.addRepresentativeText}>+ Add another representative</Text>
        </Pressable>

        <Divider />
        <SectionHeader title="Website" />
        <TextInput
          style={styles.input}
          value={form.website}
          onChangeText={(t) => setForm((f) => ({ ...f, website: t }))}
          placeholder="Website"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
        />

        <Divider />
        <SectionHeader
          title="Category"
          subtitle={
            form.categorySource === 'auto'
              ? form.category === OTHER_CATEGORY_NAME
                ? 'No confident automatic match — choose one, or leave as Other.'
                : `Suggested category: ${form.category}. Tap a different one below to change it.`
              : undefined
          }
        />
        <CategoryPicker
          allCategories={allCategories}
          selected={form.category}
          onChange={(category) => setForm((f) => ({ ...f, category, categorySource: 'manual' }))}
          onCreateCustom={handleCreateCustomCategory}
        />

        <Divider />
        <SectionHeader title="Address" />
        <TextInput
          style={styles.input}
          value={form.addressLine}
          onChangeText={(t) => setForm((f) => ({ ...f, addressLine: t }))}
          placeholder="Address"
          placeholderTextColor={colors.textMuted}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.rowInput]}
            value={form.city}
            onChangeText={(t) => setForm((f) => ({ ...f, city: t }))}
            placeholder="City"
            placeholderTextColor={colors.textMuted}
          />
          <TextInput
            style={[styles.input, styles.rowInput]}
            value={form.state}
            onChangeText={(t) => setForm((f) => ({ ...f, state: t }))}
            placeholder="State"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <TextInput
          style={styles.input}
          value={form.country}
          onChangeText={(t) => setForm((f) => ({ ...f, country: t }))}
          placeholder="Country"
          placeholderTextColor={colors.textMuted}
        />

        <Divider />
        <SectionHeader title="Notes" />
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={form.notes}
          onChangeText={(t) => setForm((f) => ({ ...f, notes: t }))}
          placeholder="Additional notes"
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <View style={styles.actionBar}>
        <PrimaryButton
          label={saved ? 'Save Changes' : 'Save Lead'}
          onPress={handleSaveLead}
          loading={saving}
        />
        {saved && (
          <>
            {/* Only offered right after a fresh scan — not when editing a card opened from the
                Card Library, where "scan another" would be an odd, out-of-place primary action.
                Listed first/most prominent among the completion actions so the user can move
                straight into scanning the next card without reaching for Android Back (which
                would otherwise just drop them back at Home) or the bottom navigation. */}
            {!wasAlreadySavedRef.current && (
              <PrimaryButton label="Scan Another Card" onPress={() => navigation.replace('Scanner', undefined)} />
            )}
            <View style={styles.actionRow}>
              <View style={styles.actionFlex}>
                <PrimaryButton label="View Card" variant="outline" onPress={() => setShowImages(true)} />
              </View>
              <View style={styles.actionFlex}>
                <PrimaryButton
                  label={contactSaved ? 'Contact Saved ✓' : 'Save to Contacts'}
                  variant="secondary"
                  disabled={contactSaved}
                  loading={savingContact}
                  onPress={handleSaveToContacts}
                />
              </View>
            </View>
          </>
        )}
      </View>

      <Modal visible={showImages} animationType="slide" onRequestClose={() => setShowImages(false)}>
        <ImageViewer images={images} onClose={() => setShowImages(false)} />
      </Modal>

      <DuplicateModal
        visible={showDuplicateModal}
        matches={duplicateMatches}
        onSaveAsNew={() => performSave()}
        onMerge={(match) =>
          performSave({ companyId: match.company.id, representativeId: match.representative?.id ?? null })
        }
        onCancel={() => setShowDuplicateModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: spacing.lg },
  cardIdLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
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
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowInput: { flex: 1 },
  addRepresentativeRow: { paddingVertical: spacing.sm, marginBottom: spacing.sm },
  addRepresentativeText: { ...typography.bodyBold, color: colors.accent },
  actionBar: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    ...shadow.medium,
  },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionFlex: { flex: 1 },
});
