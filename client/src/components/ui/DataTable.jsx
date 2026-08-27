import clsx from 'clsx';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { TableSkeleton } from './Skeleton.jsx';
import EmptyState from './EmptyState.jsx';
import ErrorState from './ErrorState.jsx';

/**
 * Table for server-paginated data.
 *
 * Columns declare their own rendering, so pages stay declarative:
 *   { key, header, sortable, align, width, render(row) }
 *
 * On narrow screens the table scrolls horizontally inside its own container -
 * the page body itself never scrolls sideways.
 */
export default function DataTable({
  columns,
  rows,
  loading,
  error,
  meta,
  sort,
  onSort,
  onPageChange,
  onRetry,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  emptyIcon,
  emptyAction,
  rowKey = (row) => row.id,
  onRowClick,
}) {
  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  if (loading) {
    return <TableSkeleton rows={8} columns={columns.length} />;
  }

  if (!rows.length) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  const sortIcon = (key) => {
    if (sort === key) return ArrowUp;
    if (sort === `-${key}`) return ArrowDown;
    return ArrowUpDown;
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50/70">
              {columns.map((col) => {
                const Icon = col.sortable ? sortIcon(col.key) : null;
                const active = sort === col.key || sort === `-${col.key}`;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    className={clsx(
                      'px-4 py-3 text-xs font-semibold tracking-wide text-ink-500 uppercase',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center'
                    )}
                  >
                    {col.sortable && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(col.key)}
                        className={clsx(
                          'inline-flex items-center gap-1.5 transition hover:text-ink-800',
                          active && 'text-brand-600'
                        )}
                        aria-label={`Sort by ${col.header}`}
                      >
                        {col.header}
                        <Icon size={12} aria-hidden="true" />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(
                  'transition',
                  onRowClick ? 'cursor-pointer hover:bg-brand-50/40' : 'hover:bg-ink-50/60'
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      'px-4 py-3 text-sm text-ink-700',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.nowrap && 'whitespace-nowrap'
                    )}
                  >
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {meta && meta.totalPages > 1 && (
        <Pagination meta={meta} onPageChange={onPageChange} />
      )}
    </div>
  );
}

/** Windowed page numbers - never renders hundreds of buttons. */
function pageWindow(page, totalPages) {
  const span = 1;
  const pages = new Set([1, totalPages, page]);
  for (let i = page - span; i <= page + span; i += 1) {
    if (i > 1 && i < totalPages) pages.add(i);
  }
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const withGaps = [];
  let previous = 0;
  for (const p of sorted) {
    if (previous && p - previous > 1) withGaps.push('gap');
    withGaps.push(p);
    previous = p;
  }
  return withGaps;
}

export function Pagination({ meta, onPageChange }) {
  const { page, limit, total, totalPages, hasNextPage, hasPrevPage } = meta;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 px-4 py-3">
      <p className="text-xs text-ink-500 tabular">
        Showing <span className="font-medium text-ink-700">{from}</span>–
        <span className="font-medium text-ink-700">{to}</span> of{' '}
        <span className="font-medium text-ink-700">{total}</span>
      </p>

      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrevPage}
          className="grid size-8 place-items-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>

        {pageWindow(page, totalPages).map((p, i) =>
          p === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-ink-400" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={clsx(
                'grid size-8 place-items-center rounded-md text-sm font-medium transition tabular',
                p === page
                  ? 'bg-brand-600 text-white'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
              )}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNextPage}
          className="grid size-8 place-items-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </nav>
    </div>
  );
}
