/** Designation keyword list used by the name/company/designation heuristic extractor.
 *  Matched as whole words/phrases, case-insensitive, against OCR lines. */
export const DESIGNATION_KEYWORDS: string[] = [
  'managing director', 'general manager', 'vice president', 'business development',
  'assistant manager', 'deputy manager', 'regional manager', 'branch manager',
  'director', 'proprietor', 'chairman', 'president', 'founder', 'co-founder',
  'ceo', 'cto', 'coo', 'cfo', 'md', 'vp',
  'manager', 'executive', 'engineer', 'consultant', 'supervisor', 'officer',
  'representative', 'technician', 'partner', 'owner', 'head', 'incharge', 'in-charge',
  'sales', 'marketing', 'purchase', 'production', 'quality', 'accounts', 'operations',
  'coordinator', 'analyst', 'specialist', 'associate', 'senior', 'junior', 'assistant',
  'architect', 'designer',
];

export const DEPARTMENT_KEYWORDS: string[] = [
  'sales', 'marketing', 'purchase', 'production', 'quality', 'accounts', 'operations',
  'r&d', 'research', 'development', 'hr', 'human resources', 'logistics', 'procurement',
  'design', 'export', 'import',
];

/** Legal/corporate-entity markers — the strongest possible signal that a line names a company: a
 *  person's name is essentially never followed by "Pvt Ltd" or "LLP". Scored higher than the
 *  broader organizational vocabulary below (see nameCompanyExtractor.ts#companyScore) precisely
 *  because a softer word like "Research" or "Services" can denote a department within a larger
 *  company rather than being the company's own legal name. */
export const STRONG_COMPANY_SUFFIX_KEYWORDS: string[] = [
  'pvt', 'private', 'ltd', 'limited', 'llp', 'inc', 'incorporated', 'corp', 'corporation',
];

/** Broader organizational/industry vocabulary — still strong evidence a line is a company or
 *  organization rather than a person, just individually softer than the legal-entity markers
 *  above. Deliberately not used to classify a line as a company on its own (see companyScore and
 *  hasCompanyShapeSignal, which combine this with position/shape/other signals) — only as one
 *  piece of contextual evidence among several. */
export const COMPANY_SUFFIX_KEYWORDS: string[] = [
  'industries', 'industry', 'enterprises', 'enterprise', 'engineering', 'company', 'co.', '& co',
  'works', 'systems', 'technologies', 'technology', 'solutions', 'services', 'group',
  'international', 'exports', 'imports', 'traders', 'trading', 'manufacturing', 'manufacturers',
  'mfg', 'associates', 'agency', 'agencies', 'foundation', 'institute',
  'organization', 'organisation', 'laboratory', 'laboratories', 'labs', 'research', 'healthcare',
  'hospital', 'motors', 'furniture', 'construction', 'automotive', 'contractors', 'foods',
  'pharma', 'pharmaceuticals', 'textiles', 'chemicals', 'electrical', 'electronics', 'automation',
  'infrastructure', 'logistics', 'developers', 'india',
];

/** Small-business/retail domain vocabulary — a shop whose trade name is just "<brand word> +
 *  <domain word>" (e.g. "Mahi Mobile", "Patel Electronics", "Modern Hardware") often carries none
 *  of the legal-entity or broader organizational vocabulary above, since it isn't a registered
 *  company at all, just a proprietorship. These words are individually weaker evidence than the
 *  broader COMPANY_SUFFIX_KEYWORDS (a card describing services in prose, e.g. "All Kind Of Mobile
 *  Accessories & Repairing", would otherwise score too easily) — see companyScore's brand+domain
 *  line bonus in nameCompanyExtractor.ts, which combines this vocabulary with line shape rather
 *  than using it alone. */
export const BUSINESS_DOMAIN_KEYWORDS: string[] = [
  'mobile', 'mobiles', 'hardware', 'accessories', 'repair', 'repairs', 'repairing',
  'software', 'computer', 'computers', 'communication', 'communications', 'telecom',
  'telecommunications', 'digital', 'gadgets', 'appliances', 'studio', 'store', 'mart',
  'center', 'centre', 'shop',
];

/** Every company-suffix word, strong and broad combined — used wherever the only question is
 *  "does this line carry ANY organizational-vocabulary signal at all" (e.g. excluding a line from
 *  representative detection), as opposed to companyScore's weighted scoring. */
export const ALL_COMPANY_SUFFIX_KEYWORDS: string[] = [...STRONG_COMPANY_SUFFIX_KEYWORDS, ...COMPANY_SUFFIX_KEYWORDS];

export const NAME_SALUTATIONS = ['mr', 'mrs', 'ms', 'miss', 'dr', 'er', 'eng', 'adv', 'ca', 'shri', 'smt'];
