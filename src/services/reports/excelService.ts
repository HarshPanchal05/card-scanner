import * as XLSX from 'xlsx';
import { File } from 'expo-file-system';
import { reportsDir, ensureAppFolders } from '../storage/fileStorage';
import {
  listAllCardIdsMatching,
  getCardWithDetails,
  getRepresentativesForCard,
  type CardListFilters,
} from '../../repositories/cardsRepo';
import { getPhonesForRepresentative, getEmailsForRepresentative } from '../../repositories/representativesRepo';
import type {
  CardWithDetails,
  CardRow,
  CompanyRow,
  RepresentativeRow,
  PhoneNumberRow,
  EmailRow,
  CategoryRow,
  EventRow,
} from '../../types/models';

export interface ReportFilters extends CardListFilters {}

/** One row of the Visitors sheet: one representative, with the company/card/event context they
 *  came from. A card that lists multiple representatives (see
 *  services/extraction/multiRepresentative.ts) expands into one VisitorRow per person instead of
 *  being collapsed onto a single row — see expandToVisitorRows below. */
interface VisitorRow {
  card: CardRow;
  company: CompanyRow | null;
  representative: RepresentativeRow | null;
  phones: PhoneNumberRow[];
  emails: EmailRow[];
  categories: CategoryRow[];
  event: EventRow | null;
}

interface CompanyAggregate {
  name: string;
  representatives: Set<string>;
  categories: Set<string>;
  phones: Set<string>;
  emails: Set<string>;
  website: string | null;
  location: string | null;
}

async function expandToVisitorRows(details: CardWithDetails): Promise<VisitorRow[]> {
  const links = await getRepresentativesForCard(details.card.id);
  if (links.length === 0) {
    // No card_representatives rows (shouldn't normally happen for a saved card, but fall back to
    // the card's own primary fields rather than dropping it from the report).
    return [
      {
        card: details.card,
        company: details.company,
        representative: details.representative,
        phones: details.phones,
        emails: details.emails,
        categories: details.categories,
        event: details.event,
      },
    ];
  }
  return Promise.all(
    links.map(async (representative) => ({
      card: details.card,
      company: details.company,
      representative,
      phones: await getPhonesForRepresentative(representative.id),
      emails: await getEmailsForRepresentative(representative.id),
      // Categories are company-level, not per-representative — shared across every row for this card.
      categories: details.categories,
      event: details.event,
    }))
  );
}

/** Builds and writes an .xlsx workbook (Visitors / Companies / Summary sheets) for every saved
 *  card matching the given filters. Runs entirely offline — no network involved in generating the
 *  file, only in whatever app the user later shares it through. Returns the file's local URI. */
export async function generateExcelReport(filters: ReportFilters, fileLabel = 'Report'): Promise<string> {
  ensureAppFolders();

  const ids = await listAllCardIdsMatching(filters);
  const details: CardWithDetails[] = [];
  for (const id of ids) {
    const d = await getCardWithDetails(id);
    if (d) details.push(d);
  }
  const visitorRowGroups = await Promise.all(details.map(expandToVisitorRows));
  const visitorRows = visitorRowGroups.flat();

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildVisitorsSheet(visitorRows), 'Visitors');
  XLSX.utils.book_append_sheet(workbook, buildCompaniesSheet(visitorRows), 'Companies');
  XLSX.utils.book_append_sheet(workbook, buildSummarySheet(visitorRows, details), 'Summary');

  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${fileLabel.replace(/[^a-zA-Z0-9_-]+/g, '_')}_${timestamp}.xlsx`;
  const file = new File(reportsDir(), fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: 'base64' });

  return file.uri;
}

function buildVisitorsSheet(rows: VisitorRow[]): XLSX.WorkSheet {
  const headers = [
    'Sr No', 'Card ID', 'Company', 'Representative', 'Designation', 'Phone 1', 'Phone 2',
    'Other Phones', 'Email', 'Website', 'Product Categories', 'Address', 'City', 'State',
    'Country', 'Expo/Event', 'Date', 'Notes',
  ];
  const sheetRows: (string | number)[][] = [headers];

  rows.forEach((r, index) => {
    const phones = r.phones.map((p) => p.rawValue);
    sheetRows.push([
      index + 1,
      r.card.displayId,
      r.company?.name ?? '',
      r.representative?.name ?? '',
      r.representative?.designation ?? '',
      phones[0] ?? '',
      phones[1] ?? '',
      phones.slice(2).join(', '),
      r.emails.map((e) => e.address).join(', '),
      r.company?.website ?? '',
      r.categories.map((c) => c.name).join(', '),
      r.company?.addressLine ?? '',
      r.company?.city ?? '',
      r.company?.state ?? '',
      r.company?.country ?? '',
      r.event?.name ?? '',
      formatDate(r.card.createdAt),
      r.card.notes ?? '',
    ]);
  });

  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  sheet['!cols'] = headers.map((h) => ({ wch: Math.max(12, Math.min(40, h.length + 4)) }));
  return sheet;
}

function buildCompaniesSheet(rows: VisitorRow[]): XLSX.WorkSheet {
  const byCompany = new Map<string, CompanyAggregate>();

  for (const r of rows) {
    if (!r.company) continue;
    const key = r.company.id;
    if (!byCompany.has(key)) {
      byCompany.set(key, {
        name: r.company.name,
        representatives: new Set(),
        categories: new Set(),
        phones: new Set(),
        emails: new Set(),
        website: r.company.website,
        location: [r.company.city, r.company.state, r.company.country].filter(Boolean).join(', ') || null,
      });
    }
    const agg = byCompany.get(key)!;
    if (r.representative) agg.representatives.add(r.representative.name);
    for (const c of r.categories) agg.categories.add(c.name);
    for (const p of r.phones) agg.phones.add(p.rawValue);
    for (const e of r.emails) agg.emails.add(e.address);
  }

  const headers = ['Company', 'Representatives', 'Categories', 'Phone Numbers', 'Emails', 'Website', 'Location'];
  const sheetRows: string[][] = [headers];
  for (const agg of byCompany.values()) {
    sheetRows.push([
      agg.name,
      Array.from(agg.representatives).join(', '),
      Array.from(agg.categories).join(', '),
      Array.from(agg.phones).join(', '),
      Array.from(agg.emails).join(', '),
      agg.website ?? '',
      agg.location ?? '',
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  sheet['!cols'] = headers.map((h) => ({ wch: Math.max(14, Math.min(40, h.length + 6)) }));
  return sheet;
}

function buildSummarySheet(rows: VisitorRow[], cards: CardWithDetails[]): XLSX.WorkSheet {
  const totalVisitors = rows.length;
  const companies = new Set(rows.map((r) => r.company?.id).filter(Boolean));
  const representatives = new Set(rows.map((r) => r.representative?.id).filter(Boolean));

  // Category and daily-scan counts are per CARD (one physical photo), not per representative —
  // otherwise a card listing 2 people would count its categories/that day's scan total twice,
  // over-weighting multi-representative cards relative to ordinary ones.
  const categoryCounts = new Map<string, number>();
  const dailyCounts = new Map<string, number>();
  for (const d of cards) {
    for (const c of d.categories) categoryCounts.set(c.name, (categoryCounts.get(c.name) ?? 0) + 1);
    const day = formatDate(d.card.createdAt);
    dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
  }

  const sheetRows: (string | number)[][] = [
    ['Total Visitors', totalVisitors],
    ['Total Companies', companies.size],
    ['Total Representatives', representatives.size],
    [],
    ['Category', 'Count'],
    ...Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1]),
    [],
    ['Date', 'Scans'],
    ...Array.from(dailyCounts.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  sheet['!cols'] = [{ wch: 24 }, { wch: 14 }];
  return sheet;
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}
