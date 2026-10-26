/**
 * Pure, render-free decision logic for DigitalBusinessCard.tsx — mirrors the split already
 * established by leadMergeLogic.ts/categoryManagementLogic.ts (DB/UI-touching code stays in its
 * own file; everything decidable from plain data lives here so it's unit-testable without a React
 * Native renderer, which this project has no test infrastructure for — see DigitalBusinessCard.tsx
 * for the component that consumes these).
 */

export interface DigitalCardRepresentative {
  id: string;
  name: string;
  designation?: string | null;
  phones?: string[];
  emails?: string[];
}

export interface DigitalCardBackData {
  website?: string | null;
  addressLine?: string | null;
  categoryNames?: string[];
}

/** The company name actually shown on the card — falls back to a clear placeholder rather than
 *  ever rendering a blank header. */
export function resolveDisplayCompanyName(companyName: string | null | undefined): string {
  return companyName?.trim() || 'Unknown Company';
}

/** Whether the back face (and therefore the flip control) should exist at all. False when none of
 *  category/address/website are present — a front-only card then has no flip affordance, per the
 *  task requirement "if there is no back-side information, do not show a flip control". */
export function hasBackContent(data: DigitalCardBackData): boolean {
  return (data.categoryNames?.length ?? 0) > 0 || !!data.addressLine || !!data.website;
}

export type BackFaceField =
  | { kind: 'category'; names: string[] }
  | { kind: 'website'; value: string }
  | { kind: 'address'; value: string };

/** Exactly which fields would render on the back face, in display order, with empty/missing ones
 *  omitted entirely (never a blank "Website: —" row) — lets this be asserted without rendering. */
export function backFaceFields(data: DigitalCardBackData): BackFaceField[] {
  const fields: BackFaceField[] = [];
  if ((data.categoryNames?.length ?? 0) > 0) fields.push({ kind: 'category', names: data.categoryNames! });
  if (data.website) fields.push({ kind: 'website', value: data.website });
  if (data.addressLine) fields.push({ kind: 'address', value: data.addressLine });
  return fields;
}

export interface RepresentativeDisplayField {
  id: string;
  name: string;
  /** Only present when the representative actually has one — the component never renders an
   *  empty designation row. */
  designation: string | null;
  phones: string[];
  emails: string[];
}

/** Normalizes a representatives array for display — deliberately a 1:1 pass-through (one output
 *  entry per input entry, each keeping its own phones/emails/designation) with no merging or
 *  aggregation step of any kind, so two representatives on the same card can never collapse into
 *  one on the card (task requirement: representatives must never be merged). */
export function toRepresentativeDisplayFields(representatives: DigitalCardRepresentative[]): RepresentativeDisplayField[] {
  return representatives.map((rep) => ({
    id: rep.id,
    name: rep.name,
    designation: rep.designation?.trim() ? rep.designation : null,
    phones: rep.phones ?? [],
    emails: rep.emails ?? [],
  }));
}
