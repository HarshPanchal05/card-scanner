/** Builds the shared search-term SQL fragment used by both listCards() and
 *  buildCardFilterClause() in cardsRepo.ts. Pure — no DB import — so the phone-search digit
 *  guard below can be regression-tested without expo-sqlite (see docs/TESTING.md).
 *
 *  Bug this guards against: naively building the phone LIKE term as
 *  `%${search.replace(/[^\d]/g, '')}%` collapses to `%%` for a non-numeric query (e.g. "Krisha"),
 *  and `LIKE '%%'` matches every non-null phone number — silently turning a name/company search
 *  into "everything with a phone number". The fix: only include the phone EXISTS clause when the
 *  query actually contains at least one digit.
 */
export interface CardSearchClause {
  clause: string;
  params: any[];
}

export function buildCardSearchClause(rawSearch: string | undefined): CardSearchClause | null {
  const search = (rawSearch ?? '').trim();
  if (search.length === 0) return null;

  const term = `%${search.toLowerCase()}%`;
  const digits = search.replace(/[^\d]/g, '');

  const parts = [
    `LOWER(COALESCE(co.name,'')) LIKE ?`,
    `LOWER(COALESCE(r.name,'')) LIKE ?`,
    `LOWER(COALESCE(r.designation,'')) LIKE ?`,
  ];
  const params: any[] = [term, term, term];

  if (digits.length > 0) {
    parts.push(
      `EXISTS (SELECT 1 FROM phone_numbers p WHERE p.representative_id = r.id AND p.normalized_value LIKE ?)`
    );
    params.push(`%${digits}%`);
  }

  parts.push(`EXISTS (SELECT 1 FROM emails e WHERE e.representative_id = r.id AND LOWER(e.address) LIKE ?)`);
  params.push(term);

  return { clause: `(${parts.join(' OR ')})`, params };
}
