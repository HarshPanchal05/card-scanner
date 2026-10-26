import * as Contacts from 'expo-contacts';
import type { CardWithDetails, PhoneNumberRow, EmailRow, CompanyRow } from '../../types/models';

export class ContactsPermissionDeniedError extends Error {
  /** false when the OS will no longer show the permission dialog (user picked "Deny" a second
   *  time, or ticked "Don't ask again") — the only way forward at that point is Settings. */
  canAskAgain: boolean;

  constructor(canAskAgain: boolean) {
    super(
      canAskAgain
        ? 'Contacts permission is required to save this card as a contact.'
        : 'Contacts permission was denied. Enable it for this app in Android Settings to use Save to Contacts.'
    );
    this.name = 'ContactsPermissionDeniedError';
    this.canAskAgain = canAskAgain;
  }
}

/** Requests contacts permission only when the user explicitly presses "Save to Contacts" —
 *  never eagerly on app start or after a scan. */
export async function ensureContactsPermission(): Promise<void> {
  const current = await Contacts.getPermissionsAsync();
  if (current.granted) return;
  // Once the user has permanently denied ("Don't ask again"), calling requestPermissionsAsync()
  // again does not show the OS dialog and just resolves denied — asking the same way again would
  // be the "repeatedly request denied permissions" anti-pattern, so we short-circuit straight to
  // the Settings-redirect error instead of calling it again.
  if (!current.canAskAgain) throw new ContactsPermissionDeniedError(false);
  const requested = await Contacts.requestPermissionsAsync();
  if (!requested.granted) throw new ContactsPermissionDeniedError(requested.canAskAgain);
}

function splitName(fullName: string): { givenName: string; familyName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { givenName: parts[0], familyName: '' };
  return { givenName: parts[0], familyName: parts.slice(1).join(' ') };
}

export interface ContactSaveInput {
  representative: { name: string; designation: string | null; department: string | null };
  phones: PhoneNumberRow[];
  emails: EmailRow[];
  company: Pick<CompanyRow, 'name' | 'addressLine' | 'city' | 'state' | 'country' | 'website'> | null;
  eventName: string | null;
  cardDisplayId: string;
}

/** Creates a single Android contact from the given representative's own data, with every one of
 *  their phone numbers/emails attached to that one contact (never one contact per phone number).
 *  Only called after the user presses "Save to Contacts" and permission has been granted. Takes
 *  plain data rather than a `CardWithDetails` so it works for any one representative on a card
 *  that lists several — see `saveCardToContacts` below for the common single-representative case. */
export async function saveContactFromInput(input: ContactSaveInput): Promise<string> {
  await ensureContactsPermission();

  const { givenName, familyName } = splitName(input.representative.name);

  const phones: Contacts.NewPhone[] = input.phones.map((p) => ({
    label: p.kind === 'mobile' ? 'mobile' : p.kind === 'office' ? 'work' : p.kind,
    number: p.rawValue,
  }));

  const emails: Contacts.NewEmail[] = input.emails.map((e) => ({
    label: 'work',
    address: e.address,
  }));

  const addresses: Contacts.NewAddress[] = input.company?.addressLine
    ? [
        {
          label: 'work',
          street: input.company.addressLine,
          city: input.company.city ?? undefined,
          region: input.company.state ?? undefined,
          country: input.company.country ?? undefined,
        },
      ]
    : [];

  const urlAddresses: Contacts.NewUrlAddress[] = input.company?.website
    ? [{ label: 'work', url: input.company.website }]
    : [];

  const contact = await Contacts.Contact.create({
    givenName,
    familyName,
    company: input.company?.name,
    jobTitle: input.representative.designation ?? undefined,
    department: input.representative.department ?? undefined,
    note: `Scanned at ${input.eventName ?? 'expo'} — ${input.cardDisplayId}`,
    phones,
    emails,
    addresses,
    urlAddresses,
  });

  return contact.id;
}

/** Creates a contact for the card's primary representative — the common single-representative
 *  case. For a card with multiple representatives, call `saveContactFromInput` once per person
 *  instead (see CardDetailScreen.tsx). */
export async function saveCardToContacts(details: CardWithDetails): Promise<string> {
  if (!details.representative) {
    throw new Error('No representative details to save — review and save the lead first.');
  }
  return saveContactFromInput({
    representative: details.representative,
    phones: details.phones,
    emails: details.emails,
    company: details.company,
    eventName: details.event?.name ?? null,
    cardDisplayId: details.card.displayId,
  });
}
