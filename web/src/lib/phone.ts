/**
 * Phone normalisation for identity resolution (PRD FR-05).
 *
 * Best-effort E.164. `defaultCountry` covers local formats such as 0812…,
 * which is how most Indonesian guests write their number in chat.
 */
export function normalizePhone(raw: string | null | undefined, defaultCountry = '62'): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) return cleaned.length > 5 ? cleaned : null;
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`;
  if (cleaned.startsWith('0')) return `+${defaultCountry}${cleaned.slice(1)}`;
  if (cleaned.startsWith(defaultCountry)) return `+${cleaned}`;
  return cleaned.length > 7 ? `+${cleaned}` : null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  return value && value.includes('@') ? value : null;
}
