/** Shared display formatting. One implementation so dates never differ per screen. */

const DATE_OPTS = { day: '2-digit', month: 'short', year: 'numeric' };
const TIME_OPTS = { hour: '2-digit', minute: '2-digit', hour12: true };

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', DATE_OPTS);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-IN', DATE_OPTS)}, ${d.toLocaleTimeString('en-IN', TIME_OPTS)}`;
}

const UNITS = [
  { limit: 60, divisor: 1, unit: 'second' },
  { limit: 3600, divisor: 60, unit: 'minute' },
  { limit: 86400, divisor: 3600, unit: 'hour' },
  { limit: 604800, divisor: 86400, unit: 'day' },
  { limit: 2629800, divisor: 604800, unit: 'week' },
  { limit: 31557600, divisor: 2629800, unit: 'month' },
];

/** "3 minutes ago", "in 2 days". Falls back to an absolute date beyond a year. */
export function formatRelative(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';

  const seconds = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(seconds);

  if (abs < 45) return 'just now';

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const { limit, divisor, unit } of UNITS) {
    if (abs < limit) return rtf.format(Math.round(seconds / divisor), unit);
  }
  return formatDate(value);
}

/** 1234567 -> "12,34,567" (Indian digit grouping). */
export function formatNumber(value) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('en-IN');
}

export function formatCurrency(amount, currency = 'INR') {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Plan limits use -1 for unlimited. */
export function formatLimit(value) {
  if (value === -1 || value === undefined || value === null) return 'Unlimited';
  return formatNumber(value);
}

/** "correction_required" -> "Correction required". */
export function humanise(value = '') {
  const text = String(value).replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function initials(name = '', max = 2) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/** Percentage of a limit consumed, capped at 100. Unlimited returns null. */
export function usagePercent(used, limit) {
  if (limit === -1 || !limit) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}
