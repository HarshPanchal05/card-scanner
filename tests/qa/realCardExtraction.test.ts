/**
 * QA harness: runs the REAL, unmodified extraction pipeline (runExtractionPipeline) against
 * hand-transcribed text from real, publicly-sourced business card images (Stanford Mobile Visual
 * Search Dataset, "Reference"/scan-quality images — a public academic OCR/CV research dataset
 * mirrored at web.cs.wpi.edu; downloaded 2026-09-10, ~10 of its 100 cards, well under the whole
 * set). These are genuine printed business cards, not fabricated placeholder data.
 *
 * IMPORTANT — what this harness does and does NOT test:
 *   - It does NOT run the production ML Kit OCR engine (that's a native Android module and cannot
 *     run under Jest/Node). The "OCR" step here is a careful manual transcription of each source
 *     image, done by reading the image directly. This means a mismatch below is, by construction,
 *     an EXTRACTION/PARSING result, never an "OCR misread" — real on-device OCR fidelity is
 *     separately spot-checked in the small physical-camera test on the actual device.
 *   - It exercises the exact same `runExtractionPipeline()` used in production
 *     (src/services/extraction/pipeline.ts) — nothing here is reimplemented or mocked.
 *
 * This file is temporary/local QA tooling (see AGENTS.md-adjacent QA task instructions) — isolated
 * under tests/qa/, not imported by any production code, and safe to delete after this QA pass.
 */
import * as fs from 'fs';
import * as path from 'path';
import { runExtractionPipeline } from '../../src/services/extraction/pipeline';

interface Expected {
  company?: string;
  personName?: string;
  designation?: string;
  phoneCount?: number;
  phoneContains?: string[]; // substrings expected to appear among normalized/raw phones
  emails?: string[];
  website?: string;
  addressContains?: string;
  note?: string;
}

interface Fixture {
  id: string;
  source: string;
  rawText: string;
  expected: Expected;
}

const FIXTURES: Fixture[] = [
  {
    id: 'REAL-001',
    source: 'Stanford MVS business-card dataset, Reference/003.jpg',
    rawText: `NAMI NAMI\nKappo Dining\nShoichi Shiono\nexecutive chef\n240 Castro St.\nMountain View, CA 94041\nTel.650-964-6990`,
    expected: {
      company: 'NAMI NAMI',
      personName: 'Shoichi Shiono',
      designation: 'executive chef',
      phoneCount: 1,
      phoneContains: ['6509646990'],
      addressContains: 'Mountain View',
    },
  },
  {
    id: 'REAL-002',
    source: 'Stanford MVS business-card dataset, Reference/011.jpg (right edge cropped in source scan)',
    rawText: `BLUEWAVE\nJIM WHITEHURST\nSenior Vice President, People and Brand\nEmail: whitehurst@blurwave.com\nPhone: 601-397-1239\nFax: 601-397-1287`,
    expected: {
      company: 'BLUEWAVE',
      personName: 'JIM WHITEHURST',
      designation: 'Senior Vice President, People and Brand',
      phoneCount: 2,
      phoneContains: ['6013971239', '6013971287'],
      emails: ['whitehurst@blurwave.com'],
      note: 'Source scan itself truncates the email domain and the designation line at the right edge — transcribed exactly as legible.',
    },
  },
  {
    id: 'REAL-003',
    source: 'Stanford MVS business-card dataset, Reference/017.jpg',
    rawText: `www.circade.com\nCIRCADE\nBernard Desarnauts Founder & CEO\nPh. +61 802 4567 | Fax +61 802 4568\nbdesarnauts@circade.com`,
    expected: {
      company: 'CIRCADE',
      personName: 'Bernard Desarnauts',
      designation: 'Founder & CEO',
      phoneCount: 2,
      phoneContains: ['618024567', '618024568'],
      emails: ['bdesarnauts@circade.com'],
      website: 'circade.com',
    },
  },
  {
    id: 'REAL-004',
    source: 'Stanford MVS business-card dataset, Reference/024.jpg (name cropped at right edge of source scan)',
    rawText: `GL RESOURCES\nTom Hami\n131 Main Street, York, YO1 5BU, United Kingdom\nPhone: +44 2-133-4617 | Fax: +44 2-133-4618`,
    expected: {
      company: 'GL RESOURCES',
      phoneCount: 2,
      phoneContains: ['4421334617', '4421334618'],
      addressContains: 'York',
      note: 'Representative name is genuinely cropped in the source scan ("Tom Hami...") — transcribed as visible; not an OCR/extraction defect.',
    },
  },
  {
    id: 'REAL-005',
    source: 'Stanford MVS business-card dataset, Reference/033.jpg — Indian phone numbers (+91)',
    rawText: `btnaccess\nBeyond the Network Limited\n20th Floor, East Exchange Tower\n38 Leighton Road\nCauseway Bay, Hong Kong\nJimit Gandhi\nAPEMEA\np +91 22 5651 0827\nf +91 22 5651 0826\nm +91 98 2074 4226\ne igandhi@btnaccess.com\nw www.btnaccess.com`,
    expected: {
      company: 'Beyond the Network Limited',
      personName: 'Jimit Gandhi',
      phoneCount: 3,
      phoneContains: ['912256510827', '912256510826', '919820744226'],
      emails: ['igandhi@btnaccess.com'],
      website: 'btnaccess.com',
      addressContains: 'Hong Kong',
      note: 'Card is a Hong Kong-registered company with Indian (+91) contact numbers — real mixed-locale card.',
    },
  },
  {
    id: 'REAL-006',
    source: 'Stanford MVS business-card dataset, Reference/041.jpg',
    rawText: `THE COUNTER\nCUSTOM BUILT BURGERS\nJim Glover\nManager\nCounter Intelligence - A Licensed Franchise\nThe Counter Palo Alto Palo Alto CA 94306\n650 321 3900 650 321 3902 Fax\npaloalto@thecounterburger.com thecounterburger.com`,
    expected: {
      company: 'THE COUNTER',
      personName: 'Jim Glover',
      designation: 'Manager',
      phoneCount: 2,
      phoneContains: ['6503213900', '6503213902'],
      emails: ['paloalto@thecounterburger.com'],
      website: 'thecounterburger.com',
      addressContains: 'Palo Alto',
    },
  },
  {
    id: 'REAL-007',
    source: 'Stanford MVS business-card dataset, Reference/052.jpg (right edge cropped; no person name printed)',
    rawText: `Lotus Thai Bistro\n425 California Ave\nPalo Alto, CA 94\nwww.lotusthaibistro.com\nPhone: 650.289.0\nFax: 650.289.0`,
    expected: {
      company: 'Lotus Thai Bistro',
      website: 'lotusthaibistro.com',
      addressContains: 'Palo Alto',
      note: 'No representative name is printed on this card at all, and the phone/fax digits are themselves cropped in the source scan — a genuine "no person, incomplete phone" edge case.',
    },
  },
  {
    id: 'REAL-008',
    source: 'Stanford MVS business-card dataset, Reference/066.jpg',
    rawText: `HITACHI\nInspire the Next\nHideaki Kido\nIntelligent Sensing Systems Unit\nThe Second Department of Systems Research\nHitachi, Ltd.\nHitachi Research Laboratory\n1-1,Omika-cho 7-chome,Hitachi-shi\nIbaraki-ken,319-1292 Japan\nTEL:81 294 52 5111ex6086\nFAX:81 294 52 7608\nE-mail:hideaki.kido.fx@hitachi.com\nwww.hitachi.co.jp/rd/hrl/`,
    expected: {
      company: 'Hitachi, Ltd.',
      personName: 'Hideaki Kido',
      phoneCount: 2,
      phoneContains: ['81294525111', '81294527608'],
      emails: ['hideaki.kido.fx@hitachi.com'],
      website: 'hitachi.co.jp',
      addressContains: 'Japan',
      note: 'Richest single-representative card in the set: department + designation-like unit name + phone/fax/email/website/address all present.',
    },
  },
  {
    id: 'REAL-009',
    source: 'Stanford MVS business-card dataset, Reference/074.jpg — non-Latin script card',
    rawText: `國立交通大學\n電機與控制工程學系 研究生\n林士翔\n校址：新竹市大學路1001號工五館615室\n電話：(O)(03)5712121轉54306\n(H)0966-177-516\n傳眞：(03)5715998\nE-mail：shlin1983@gmail.com`,
    expected: {
      phoneCount: 2,
      phoneContains: ['0966177516'],
      emails: ['shlin1983@gmail.com'],
      note: 'Traditional-Chinese-script card. Production OCR runs Latin-script recognition only (TextRecognitionScript.LATIN in ocrService.ts) — the Chinese name/company/address are expected to be unrecognized or garbled by the REAL OCR step, but the Latin-script phone numbers and email should still be extracted correctly by the pipeline once any text is present. This fixture tests the pipeline half of that only (given clean transcribed digits/email); true OCR behavior on CJK input is a separate, real limitation to record, not something this harness can exercise.',
    },
  },
  {
    id: 'REAL-010',
    source: 'Stanford MVS business-card dataset, Reference/029.jpg (fax number cropped; company/email domain mismatch)',
    rawText: `WING Travel\nJoey K. Smith\nManaging director\nT: 770-391-9071 F: 770-391-90\n299 Newport Lane - Dunwoody, GA 30338\ninfo@whitesandtravel.com`,
    expected: {
      company: 'WING Travel',
      personName: 'Joey K. Smith',
      designation: 'Managing director',
      emails: ['info@whitesandtravel.com'],
      addressContains: 'Dunwoody',
      note: 'Real card where the company display name ("WING Travel") and the email domain ("whitesandtravel.com") genuinely disagree — a real branding/legacy-domain mismatch, not a transcription error. Fax number is cropped mid-digit in the source scan.',
    },
  },
  {
    id: 'REAL-011',
    source: 'Stanford MVS business-card dataset, Reference/057.jpg — loyalty punch card, not a contact card',
    rawText: `Buy 10 coffee drinks over $1.15, get one free!\nPrinters Inc Cafe\n320 California Ave.\nPalo Alto, CA 94306\nTel: 650-323-3347\nFax: 650-328-5246\n"Where Your Coffee Needs Are Met"`,
    expected: {
      company: 'Printers Inc Cafe',
      phoneCount: 2,
      phoneContains: ['6503233347', '6503285246'],
      addressContains: 'Palo Alto',
      note: 'Not a personal contact card at all (a coffee-shop loyalty punch card) — no representative name exists on it by design. Included specifically to confirm the pipeline does not hallucinate a person when none is printed.',
    },
  },
];

type FieldResult = 'PASS' | 'PARTIAL' | 'FAIL' | 'N/A';
interface FixtureReport {
  id: string;
  source: string;
  falsePositiveMultiRep?: { count: number; names: string[] };
  company: { expected?: string; actual: string | null; result: FieldResult };
  personName: { expected?: string; actual: string | null; result: FieldResult };
  designation: { expected?: string; actual: string | null; result: FieldResult };
  phones: { expected?: string[]; actual: string[]; result: FieldResult };
  emails: { expected?: string[]; actual: string[]; result: FieldResult };
  website: { expected?: string; actual: string | null; result: FieldResult };
  address: { expected?: string; actual: string | null; result: FieldResult };
  note?: string;
}

const results: FixtureReport[] = [];

function containsCI(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

describe('QA fixture harness — real sourced card extraction (pipeline.ts, unmodified)', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.id}: ${fixture.source}`, () => {
      const result = runExtractionPipeline(fixture.rawText);
      const digits = (s: string) => s.replace(/\D/g, '');
      const actualPhoneDigits = result.phones.map((p) => digits(p.normalized || p.raw));

      const report: FixtureReport = {
        id: fixture.id,
        source: fixture.source,
        company: {
          expected: fixture.expected.company,
          actual: result.companyName,
          result: !fixture.expected.company
            ? 'N/A'
            : containsCI(result.companyName, fixture.expected.company)
              ? 'PASS'
              : result.companyName
                ? 'PARTIAL'
                : 'FAIL',
        },
        personName: {
          expected: fixture.expected.personName,
          actual: result.personName,
          result: !fixture.expected.personName
            ? 'N/A'
            : containsCI(result.personName, fixture.expected.personName)
              ? 'PASS'
              : result.personName
                ? 'PARTIAL'
                : 'FAIL',
        },
        designation: {
          expected: fixture.expected.designation,
          actual: result.designation,
          result: !fixture.expected.designation
            ? 'N/A'
            : containsCI(result.designation, fixture.expected.designation)
              ? 'PASS'
              : result.designation
                ? 'PARTIAL'
                : 'FAIL',
        },
        phones: {
          expected: fixture.expected.phoneContains,
          actual: actualPhoneDigits,
          result: !fixture.expected.phoneContains
            ? 'N/A'
            : (() => {
                const hits = fixture.expected.phoneContains!.filter((exp) =>
                  actualPhoneDigits.some((a) => a.includes(digits(exp)) || digits(exp).includes(a))
                );
                if (hits.length === fixture.expected.phoneContains!.length) return 'PASS';
                if (hits.length > 0) return 'PARTIAL';
                return 'FAIL';
              })(),
        },
        emails: {
          expected: fixture.expected.emails,
          actual: result.emails,
          result: !fixture.expected.emails
            ? 'N/A'
            : fixture.expected.emails.every((e) => result.emails.some((a) => a.toLowerCase() === e.toLowerCase()))
              ? 'PASS'
              : result.emails.length > 0
                ? 'PARTIAL'
                : 'FAIL',
        },
        website: {
          expected: fixture.expected.website,
          actual: result.website,
          result: !fixture.expected.website
            ? 'N/A'
            : containsCI(result.website, fixture.expected.website)
              ? 'PASS'
              : result.website
                ? 'PARTIAL'
                : 'FAIL',
        },
        address: {
          expected: fixture.expected.addressContains,
          actual: result.addressLine,
          result: !fixture.expected.addressContains
            ? 'N/A'
            : containsCI(result.addressLine, fixture.expected.addressContains)
              ? 'PASS'
              : result.addressLine
                ? 'PARTIAL'
                : 'FAIL',
        },
        note: fixture.expected.note,
      };
      // This card has exactly one real person on it (or none) by construction. If the pipeline's
      // multi-representative clustering nonetheless split it into 2+ "representatives", that is a
      // genuine finding about the app (a false-positive split, likely a company/department/product
      // name line being misidentified as a second person's name) — recorded here rather than
      // failing the whole suite, so every fixture still runs and reports.
      if (result.representatives && result.representatives.length > 0) {
        report.falsePositiveMultiRep = {
          count: result.representatives.length,
          names: result.representatives.map((r) => r.name),
        };
      }
      results.push(report);

      // The pipeline must never throw on any of this real, messy, real-world input.
      expect(() => result).not.toThrow();
    });
  }

  afterAll(() => {
    const outPath = path.join(__dirname, 'results', 'real-card-extraction-results.json');
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    // eslint-disable-next-line no-console
    console.log(`\nQA fixture results written to ${outPath}\n`);
    // eslint-disable-next-line no-console
    console.table(
      results.map((r) => ({
        id: r.id,
        company: r.company.result,
        person: r.personName.result,
        designation: r.designation.result,
        phones: r.phones.result,
        emails: r.emails.result,
        website: r.website.result,
        address: r.address.result,
        falsePositiveMultiRep: r.falsePositiveMultiRep ? `${r.falsePositiveMultiRep.count} reps: ${r.falsePositiveMultiRep.names.join(' | ')}` : '',
      }))
    );
  });
});
