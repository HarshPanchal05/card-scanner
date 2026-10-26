/**
 * Category master list + keyword dictionary for offline product/category classification.
 * See src/services/extraction/categoryExtractor.ts for how this is used.
 *
 * This is intentionally a plain, editable data file (not a database table) so the default
 * dictionary ships with the app; user-added custom categories are stored in the `categories`
 * table with isCustom = 1 and are merged with this list at runtime.
 */

export interface CategoryDefinition {
  name: string;
  keywords: string[];
}

export const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  { name: 'Industrial Valves', keywords: ['valve', 'valves', 'ball valve', 'gate valve', 'butterfly valve', 'globe valve', 'solenoid valve'] },
  { name: 'Pumps', keywords: ['pump', 'pumps', 'centrifugal pump', 'submersible pump', 'dosing pump', 'pumping solutions'] },
  { name: 'Motors', keywords: ['motor', 'motors', 'electric motor', 'servo motor', 'induction motor', 'ac motor', 'dc motor'] },
  { name: 'Electrical', keywords: ['electrical', 'electricals', 'switchgear', 'panel board', 'wiring', 'cables', 'transformer', 'electric works'] },
  { name: 'Automation', keywords: ['automation', 'plc', 'scada', 'control systems', 'robotics', 'automated systems'] },
  { name: 'Fabrication', keywords: ['fabrication', 'fabricators', 'sheet metal', 'welding', 'metal works', 'steel fabrication'] },
  { name: 'HVAC', keywords: ['hvac', 'air conditioning', 'ventilation', 'chiller', 'cooling systems', 'ac systems', 'refrigeration'] },
  { name: 'Hydraulics', keywords: ['hydraulic', 'hydraulics', 'hydraulic cylinder', 'hydraulic press', 'hydraulic systems'] },
  { name: 'Pneumatics', keywords: ['pneumatic', 'pneumatics', 'air compressor', 'pneumatic cylinder', 'compressed air'] },
  { name: 'Bearings', keywords: ['bearing', 'bearings', 'ball bearing', 'roller bearing'] },
  { name: 'Filters', keywords: ['filter', 'filters', 'filtration', 'air filter', 'oil filter', 'water filter'] },
  { name: 'Industrial Equipment', keywords: ['industrial equipment', 'machinery', 'plant equipment', 'heavy equipment'] },
  { name: 'Manufacturing', keywords: ['manufacturer', 'manufacturing', 'manufacturers', 'mfg', 'production unit'] },
  { name: 'Engineering Services', keywords: ['engineering services', 'engineering solutions', 'consulting engineers', 'epc', 'turnkey'] },
  { name: 'Instrumentation', keywords: ['instrumentation', 'sensors', 'transmitters', 'gauges', 'measuring instruments'] },
  { name: 'Packaging', keywords: ['packaging', 'packing machine', 'packaging solutions', 'wrapping machine'] },
  { name: 'Plastics & Polymers', keywords: ['plastic', 'plastics', 'polymer', 'polymers', 'injection molding', 'extrusion'] },
  { name: 'Chemicals', keywords: ['chemicals', 'chemical industries', 'specialty chemicals', 'industrial chemicals'] },
  { name: 'Textiles & Machinery', keywords: ['textile', 'textiles', 'textile machinery', 'weaving', 'spinning mill'] },
  { name: 'Safety Equipment', keywords: ['safety equipment', 'ppe', 'safety gear', 'protective equipment', 'fire safety'] },
  { name: 'Compressors', keywords: ['compressor', 'compressors', 'air compressor', 'gas compressor'] },
  { name: 'Generators & Power', keywords: ['generator', 'generators', 'genset', 'power solutions', 'ups', 'inverter'] },
  { name: 'Welding Equipment', keywords: ['welding machine', 'welding equipment', 'welding electrodes', 'arc welding'] },
  { name: 'Tools & Hardware', keywords: ['hand tools', 'power tools', 'hardware', 'tooling', 'cutting tools'] },
  { name: 'Logistics & Material Handling', keywords: ['material handling', 'conveyor', 'forklift', 'crane', 'logistics', 'warehousing'] },
  { name: 'Furniture', keywords: ['furniture', 'office furniture', 'modular furniture', 'furnishings', 'sofa', 'wooden furniture'] },
  { name: 'Mobile & Electronics', keywords: ['mobile', 'mobiles', 'electronics', 'electronic', 'smartphone', 'smartphones', 'cell phone', 'mobile accessories', 'mobile repair', 'electronics store', 'gadgets', 'accessories', 'repairing'] },
  { name: 'Construction', keywords: ['construction', 'contractor', 'contractors', 'civil construction', 'building materials', 'infrastructure development'] },
  { name: 'Automotive', keywords: ['automotive', 'auto parts', 'auto components', 'automobile', 'vehicle parts', 'auto ancillary'] },
  { name: 'Healthcare', keywords: ['healthcare', 'hospital', 'clinic', 'medical', 'pharma', 'pharmaceuticals', 'diagnostic center'] },
];

export const OTHER_CATEGORY_NAME = 'Other';

const CATEGORY_NAME_STOPWORDS = new Set(['and', 'the', 'of', 'for', 'with', 'a', 'an', '&']);

/** Derives a small keyword list from a user-created category's own name, so a custom category
 *  (which has no hand-curated keyword dictionary like DEFAULT_CATEGORIES does) can still
 *  participate in offline classification without any code change — see
 *  categoryExtractor.ts#decidePrimaryCategory. Deliberately simple (Level 1 "name matching" plus
 *  its individual significant words): e.g. "Renewable Energy" -> ["renewable energy", "renewable",
 *  "energy"], "HVAC" -> ["hvac"]. This is not a synonym dictionary — it just makes the category's
 *  own name (and the words in it) recognizable in OCR text. */
export function deriveKeywordsFromName(name: string): string[] {
  const lower = name.trim().toLowerCase();
  const words = lower
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !CATEGORY_NAME_STOPWORDS.has(w));
  return Array.from(new Set([lower, ...words]));
}

/** Builds classifier dictionary entries for every user-created (custom) category, to be merged
 *  with DEFAULT_CATEGORIES at classification time. Built-in categories are excluded here — they
 *  already have curated keyword lists in DEFAULT_CATEGORIES above, which this would otherwise
 *  clobber with a thinner name-only derivation. "Other" is excluded too: it's a pure fallback
 *  bucket, never something the classifier should try to match into. */
export function categoryRowsToDictionary(
  rows: { name: string; isCustom: 0 | 1 }[]
): CategoryDefinition[] {
  return rows
    .filter((r) => r.isCustom === 1 && r.name !== OTHER_CATEGORY_NAME)
    .map((r) => ({ name: r.name, keywords: deriveKeywordsFromName(r.name) }));
}
