import React, { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Linking, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, gradients, radius, spacing, typography, shadow } from '../constants/theme';
import { icons } from '../constants/icons';
import { Gradient } from './Gradient';
import {
  resolveDisplayCompanyName,
  hasBackContent as computeHasBackContent,
  backFaceFields,
  toRepresentativeDisplayFields,
  type DigitalCardRepresentative,
} from './digitalBusinessCardLogic';

/**
 * The "digital business card": a standardized, application-designed card generated entirely from
 * the card's ALREADY-EXTRACTED structured data (company name, representatives, phones, emails,
 * website, address, category) — never the original photographed card image, and never OCR text.
 * Callers own extraction; this component only renders. See callers (CardDetailScreen,
 * DashboardScreen) for where the structured props come from (SQLite rows via cardsRepo/
 * companiesRepo/representativesRepo — the same data already shown elsewhere in the app).
 *
 * Two representatives are never merged into one — see DigitalCardRepresentative[] below, one
 * entry per person, each with their own designation/phones/emails, rendered as clearly separated
 * blocks (task requirement: "ONE COMPANY + MULTIPLE CLEARLY SEPARATED REPRESENTATIVES").
 *
 * Front/back: front carries "who do I contact" (company + representatives); back carries "what/
 * where" (category, address, website). The flip control (a simple cross-fade toggle, not a 3D
 * transform over a fixed aspect ratio) only appears when the back actually has something to show —
 * an address-only or category-only back is still shown; a card with none of the three is
 * front-only with no flip affordance at all. A cross-fade (rather than the previous 3D flip over a
 * shared fixed-aspect-ratio image) is used deliberately: this card's content is variable-length
 * text, not a fixed-shape photo, so each face needs to size to its own natural height without a
 * shared absolute-positioned layer risking clipped/overlapping text on longer cards.
 */

export type { DigitalCardRepresentative };

export interface DigitalBusinessCardProps {
  companyName: string | null;
  representatives?: DigitalCardRepresentative[];
  website?: string | null;
  addressLine?: string | null;
  categoryNames?: string[];
  /** Compact mode: a small preview tile (company + first representative's name only, no contact
   *  actions, no flip) — used by the Dashboard's "Recent Cards" strip, where the full card is one
   *  tap away on Card Detail. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

function openTel(phone: string) {
  Linking.openURL(`tel:${phone}`);
}
function openMail(email: string) {
  Linking.openURL(`mailto:${email}`);
}
function openWebsite(website: string) {
  Linking.openURL(website.startsWith('http') ? website : `https://${website}`);
}
function openMaps(address: string) {
  Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(address)}`);
}

export function DigitalBusinessCard({
  companyName,
  representatives = [],
  website,
  addressLine,
  categoryNames = [],
  compact,
  style,
  onPress,
}: DigitalBusinessCardProps) {
  const [showingBack, setShowingBack] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const displayCompany = resolveDisplayCompanyName(companyName);
  const showFlip = !compact && computeHasBackContent({ website, addressLine, categoryNames });

  const handlePress = () => {
    if (compact || !showFlip) {
      onPress?.();
      return;
    }
    Animated.timing(fadeAnim, { toValue: 0, duration: 130, useNativeDriver: true }).start(() => {
      setShowingBack((v) => !v);
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  };

  if (compact) {
    return (
      <Pressable
        onPress={handlePress}
        style={[styles.compactWrap, style]}
        accessibilityRole="button"
        accessibilityLabel={`${displayCompany}${representatives[0] ? `, ${representatives[0].name}` : ''}`}
      >
        <Gradient colors={gradients.hero} borderRadius={radius.lg} style={StyleSheet.absoluteFill} />
        <Text style={styles.compactCompany} numberOfLines={2}>
          {displayCompany}
        </Text>
        {representatives[0] && (
          <Text style={styles.compactRep} numberOfLines={1}>
            {representatives[0].name}
          </Text>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.wrap, style]}
      accessibilityRole={showFlip ? 'button' : undefined}
      accessibilityLabel={showFlip ? 'Flip card' : undefined}
    >
      <Animated.View style={{ opacity: fadeAnim, paddingBottom: showFlip ? spacing.lg : 0 }}>
        {showingBack ? (
          <CardBack companyName={displayCompany} fields={backFaceFields({ website, addressLine, categoryNames })} />
        ) : (
          <CardFront companyName={displayCompany} representatives={toRepresentativeDisplayFields(representatives)} />
        )}
      </Animated.View>
      {showFlip && (
        <View style={styles.flipHint} pointerEvents="none">
          <Ionicons name={icons.flip as any} size={12} color={colors.textOnPrimary} />
          <Text style={styles.flipHintText}>{showingBack ? 'Back · tap to flip' : 'Tap to flip'}</Text>
        </View>
      )}
    </Pressable>
  );
}

function CardHeader({ companyName }: { companyName: string }) {
  return (
    <Gradient colors={gradients.hero} borderRadius={0} style={styles.header}>
      <Text style={styles.companyName}>{companyName}</Text>
    </Gradient>
  );
}

function CardFront({
  companyName,
  representatives,
}: {
  companyName: string;
  representatives: ReturnType<typeof toRepresentativeDisplayFields>;
}) {
  return (
    <View style={styles.face}>
      <CardHeader companyName={companyName} />
      <View style={styles.body}>
        {representatives.length === 0 ? (
          <Text style={styles.emptyText}>No representative recorded</Text>
        ) : (
          representatives.map((rep, i) => (
            <View
              key={rep.id}
              style={[styles.repBlock, i < representatives.length - 1 && representatives.length > 1 && styles.repBlockDivider]}
            >
              <Text style={styles.repName}>{rep.name}</Text>
              {!!rep.designation && <Text style={styles.designation}>{rep.designation}</Text>}
              {(rep.phones ?? []).map((phone, idx) => (
                <Pressable key={`p${idx}`} onPress={() => openTel(phone)} style={styles.contactRow} hitSlop={6}>
                  <Ionicons name={icons.phone as any} size={15} color={colors.primary} />
                  <Text style={styles.contactText}>{phone}</Text>
                </Pressable>
              ))}
              {(rep.emails ?? []).map((email, idx) => (
                <Pressable key={`e${idx}`} onPress={() => openMail(email)} style={styles.contactRow} hitSlop={6}>
                  <Ionicons name={icons.email as any} size={15} color={colors.primary} />
                  <Text style={styles.contactText} numberOfLines={1}>
                    {email}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function CardBack({ companyName, fields }: { companyName: string; fields: ReturnType<typeof backFaceFields> }) {
  return (
    <View style={styles.face}>
      <CardHeader companyName={companyName} />
      <View style={styles.body}>
        {fields.map((field) => {
          if (field.kind === 'category') {
            return (
              <View key="category" style={styles.categoryWrap}>
                {field.names.map((name) => (
                  <View key={name} style={styles.categoryPill}>
                    <Text style={styles.categoryPillText}>{name}</Text>
                  </View>
                ))}
              </View>
            );
          }
          if (field.kind === 'website') {
            return (
              <Pressable key="website" onPress={() => openWebsite(field.value)} style={styles.contactRow} hitSlop={6}>
                <Ionicons name={icons.website as any} size={15} color={colors.primary} />
                <Text style={styles.contactText}>{field.value}</Text>
              </Pressable>
            );
          }
          return (
            <Pressable key="address" onPress={() => openMaps(field.value)} style={styles.contactRow} hitSlop={6}>
              <Ionicons name={icons.address as any} size={15} color={colors.primary} />
              <Text style={styles.contactText}>{field.value}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadow.medium,
  },
  face: { width: '100%' },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  companyName: {
    ...typography.h2,
    color: colors.textOnPrimary,
    textAlign: 'center',
    flexWrap: 'wrap',
  },
  body: { padding: spacing.lg, gap: spacing.sm },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.sm },
  repBlock: { paddingBottom: spacing.sm },
  repBlockDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider, marginBottom: spacing.sm },
  repName: { ...typography.headline, color: colors.textPrimary, flexWrap: 'wrap' },
  designation: { ...typography.secondary, color: colors.textSecondary, marginBottom: spacing.xs, flexWrap: 'wrap' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 3 },
  contactText: { ...typography.body, color: colors.textPrimary, flexShrink: 1, flexWrap: 'wrap' },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs },
  categoryPill: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  categoryPillText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  flipHint: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  flipHintText: { ...typography.caption, color: colors.textOnPrimary, fontWeight: '600', fontSize: 11 },

  compactWrap: {
    width: '100%',
    minHeight: 96,
    borderRadius: radius.lg,
    overflow: 'hidden',
    padding: spacing.md,
    justifyContent: 'center',
    ...shadow.low,
  },
  compactCompany: { ...typography.bodyBold, color: colors.textOnPrimary },
  compactRep: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
});
