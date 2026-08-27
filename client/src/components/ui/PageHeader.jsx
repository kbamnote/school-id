import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * Standard page heading with optional breadcrumb trail and action slot.
 * Every screen uses this so the eye always lands in the same place.
 */
export default function PageHeader({ title, subtitle, breadcrumbs = [], actions }) {
  return (
    <div className="mb-6">
      {breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-500">
            {breadcrumbs.map((crumb, i) => {
              const last = i === breadcrumbs.length - 1;
              return (
                <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                  {crumb.to && !last ? (
                    <Link to={crumb.to} className="transition hover:text-ink-800">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={last ? 'font-medium text-ink-700' : undefined}>
                      {crumb.label}
                    </span>
                  )}
                  {!last && <ChevronRight size={12} className="text-ink-300" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm leading-relaxed text-ink-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
