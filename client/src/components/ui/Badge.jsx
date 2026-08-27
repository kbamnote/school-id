import clsx from 'clsx';
import {
  SUBMISSION_STATUS_META,
  LOT_STATUS_META,
  JOB_STATUS_META,
  GENERIC_STATUS_META,
} from '../../utils/statusMeta';

const TONES = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  success: 'bg-success-50 text-success-700 ring-success-100',
  warning: 'bg-warning-50 text-warning-700 ring-warning-100',
  danger: 'bg-danger-50 text-danger-700 ring-danger-100',
  info: 'bg-info-50 text-info-700 ring-info-100',
  accent: 'bg-accent-50 text-accent-700 ring-accent-200',
};

const SIZES = {
  sm: 'px-1.5 py-0.5 text-[0.6875rem] gap-1',
  md: 'px-2 py-0.5 text-xs gap-1.5',
};

export function Badge({ tone = 'neutral', size = 'md', dot = false, icon: Icon, className, children }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full font-medium ring-1 ring-inset whitespace-nowrap',
        TONES[tone] || TONES.neutral,
        SIZES[size],
        className
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />}
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}

const MAPS = {
  submission: SUBMISSION_STATUS_META,
  lot: LOT_STATUS_META,
  job: JOB_STATUS_META,
  generic: GENERIC_STATUS_META,
};

/**
 * Renders a workflow status using the single shared status map, so the same
 * state never appears in two different colours in two different screens.
 */
export function StatusBadge({ status, kind = 'submission', size = 'md', showDot = true }) {
  const meta = MAPS[kind]?.[status] || MAPS.generic[status];
  if (!meta) {
    return (
      <Badge tone="neutral" size={size}>
        {String(status || '-').replace(/_/g, ' ')}
      </Badge>
    );
  }
  return (
    <Badge tone={meta.tone} size={size} dot={showDot}>
      {meta.label}
    </Badge>
  );
}

export default Badge;
