import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from './Button';

/** Distinguishes "this failed" from "there is nothing here" - never conflate them. */
export default function ErrorState({
  title = 'Could not load this',
  message = 'Something went wrong while fetching the data.',
  onRetry,
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-danger-50 text-danger-600">
        <AlertTriangle size={22} aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-[0.9375rem] font-semibold text-ink-900">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={RefreshCw} className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
