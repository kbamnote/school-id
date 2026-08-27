import { Inbox } from 'lucide-react';

/**
 * Empty states explain what the screen is for and offer the next action,
 * rather than leaving a blank panel that looks like a loading failure.
 */
export default function EmptyState({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  description,
  action,
  compact = false,
}) {
  return (
    <div
      className={
        compact
          ? 'flex flex-col items-center justify-center px-6 py-10 text-center'
          : 'flex flex-col items-center justify-center px-6 py-16 text-center'
      }
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-ink-100 text-ink-400">
        <Icon size={22} aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-[0.9375rem] font-semibold text-ink-900">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-500">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
