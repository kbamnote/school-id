import clsx from 'clsx';

export function Skeleton({ className }) {
  return <div className={clsx('skeleton rounded-md', className)} aria-hidden="true" />;
}

/** Matches the real table's column count so the layout does not jump on load. */
export function TableSkeleton({ rows = 8, columns = 5 }) {
  return (
    <div className="divide-y divide-ink-200" aria-busy="true" aria-label="Loading table">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: columns }).map((__, c) => (
            <Skeleton
              key={c}
              className={clsx('h-4', c === 0 ? 'w-10' : c === 1 ? 'flex-[2]' : 'flex-1')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatCardSkeleton({ count = 4 }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-card border border-ink-200 bg-white p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-3 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
