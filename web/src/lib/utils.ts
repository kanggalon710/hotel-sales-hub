import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Money is formatted for the org locale/currency; never hardcode a symbol. */
export function formatMoney(
  amount: number,
  currency = 'IDR',
  locale = 'id-ID',
  opts: { compact?: boolean } = {},
) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: opts.compact ? 'compact' : 'standard',
    maximumFractionDigits: opts.compact ? 1 : currency === 'IDR' ? 0 : 2,
  }).format(amount);
}

export function formatNumber(value: number, locale = 'id-ID') {
  return new Intl.NumberFormat(locale).format(value);
}

/** Stay dates are date-only strings; render them without a timezone shift. */
export function formatStayDate(isoDate: string | null | undefined, locale = 'en-GB') {
  if (!isoDate) return '–';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export function formatStayRange(checkIn?: string | null, checkOut?: string | null, locale = 'en-GB') {
  if (!checkIn || !checkOut) return '–';
  const nights = nightsBetween(checkIn, checkOut);
  return `${formatStayDate(checkIn, locale)} → ${formatStayDate(checkOut, locale)} · ${nights}N`;
}

export function nightsBetween(checkIn: string, checkOut: string) {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function formatDateTime(value: Date | number | null | undefined, locale = 'en-GB') {
  if (value == null) return '–';
  return new Date(value).toLocaleString(locale, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/** Compact relative time; drives SLA and freshness copy. */
export function relativeTime(value: Date | number | null | undefined, now = Date.now()) {
  if (value == null) return '–';
  const ms = new Date(value).getTime() - now;
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  const past = ms < 0;
  const fmt = (n: number, unit: string) => (past ? `${n}${unit} ago` : `in ${n}${unit}`);
  if (mins < 1) return past ? 'just now' : 'now';
  if (mins < 60) return fmt(mins, 'm');
  const hours = Math.round(mins / 60);
  if (hours < 24) return fmt(hours, 'h');
  const days = Math.round(hours / 24);
  if (days < 30) return fmt(days, 'd');
  return fmt(Math.round(days / 30), 'mo');
}

export function isOverdue(value: Date | number | null | undefined, now = Date.now()) {
  return value != null && new Date(value).getTime() < now;
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function titleCase(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}
