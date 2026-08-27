import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

export function Spinner({ size = 20, className }) {
  return (
    <Loader2
      size={size}
      className={clsx('animate-spin text-brand-600', className)}
      role="status"
      aria-label="Loading"
    />
  );
}

/** Full-panel loading state used while a page's first fetch is in flight. */
export function PageLoader({ label = 'Loading...' }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3">
      <Spinner size={26} />
      <p className="text-sm text-ink-500">{label}</p>
    </div>
  );
}

/** Covers the whole viewport - only for the initial session check. */
export function FullScreenLoader({ label = 'Loading MR Print World...' }) {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-100">
      <div className="flex flex-col items-center gap-4">
        <div className="grid size-12 place-items-center rounded-2xl bg-brand-600 text-white shadow-raised">
          <Spinner size={22} className="text-white" />
        </div>
        <p className="text-sm font-medium text-ink-600">{label}</p>
      </div>
    </div>
  );
}

export default Spinner;
