import clsx from 'clsx';
import { Link } from 'react-router-dom';

const TONES = {
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
  danger: 'bg-danger-50 text-danger-600',
  info: 'bg-info-50 text-info-600',
  accent: 'bg-accent-50 text-accent-600',
  neutral: 'bg-ink-100 text-ink-500',
};

/**
 * Single headline figure. `to` turns the whole card into a link, which is how
 * the dashboard hands off to the filtered list behind each number.
 */
export default function StatCard({ label, value, icon: Icon, tone = 'brand', hint, to, emphasis }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">{label}</p>
        {Icon && (
          <span className={clsx('grid size-8 shrink-0 place-items-center rounded-lg', TONES[tone])}>
            <Icon size={16} aria-hidden="true" />
          </span>
        )}
      </div>
      <p
        className={clsx(
          'mt-3 font-semibold tracking-tight tabular',
          emphasis ? 'text-3xl text-ink-900' : 'text-2xl text-ink-900'
        )}
      >
        {value ?? '—'}
      </p>
      {hint && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
    </>
  );

  const className = clsx(
    'rounded-card border border-ink-200 bg-white p-5 shadow-panel transition',
    to && 'hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised'
  );

  if (to) {
    return (
      <Link to={to} className={clsx(className, 'block')}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}
