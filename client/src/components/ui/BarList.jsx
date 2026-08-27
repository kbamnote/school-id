import clsx from 'clsx';
import { formatNumber } from '../../utils/format.js';

const TONES = {
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  accent: 'bg-accent-500',
  info: 'bg-info-500',
  warning: 'bg-warning-500',
};

/**
 * A horizontal bar list — the right shape for "how much of each" comparisons.
 *
 * Bars are scaled against the largest value rather than the total, so a long
 * tail of small categories stays readable instead of collapsing to hairlines.
 */
export default function BarList({ items, tone = 'brand', emptyLabel = 'No data yet', max }) {
  if (!items?.length) {
    return <p className="px-5 py-8 text-center text-sm text-ink-500">{emptyLabel}</p>;
  }

  const peak = max ?? Math.max(...items.map((i) => i.count || 0), 1);

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const percent = Math.max(2, Math.round(((item.count || 0) / peak) * 100));
        return (
          <li key={item.id || item.name}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-ink-700">{item.name}</span>
              <span className="shrink-0 text-sm font-semibold text-ink-900 tabular">
                {formatNumber(item.count)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div
                className={clsx('h-full rounded-full', item.color ? '' : TONES[tone])}
                style={{
                  width: `${percent}%`,
                  ...(item.color ? { backgroundColor: item.color } : {}),
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
