import clsx from 'clsx';

export function Card({ className, children, as: Tag = 'div', ...rest }) {
  return (
    <Tag
      className={clsx(
        'rounded-card border border-ink-200 bg-white shadow-panel',
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, action, icon: Icon, className }) {
  return (
    <div
      className={clsx(
        'flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4',
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Icon size={17} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-[0.9375rem] font-semibold text-ink-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }) {
  return <div className={clsx('p-5', className)}>{children}</div>;
}

export function CardFooter({ className, children }) {
  return (
    <div
      className={clsx(
        'flex items-center justify-end gap-2 border-t border-ink-200 bg-ink-50/60 px-5 py-3.5',
        className
      )}
    >
      {children}
    </div>
  );
}

export default Card;
