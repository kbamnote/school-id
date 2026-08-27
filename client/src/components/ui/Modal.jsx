import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';
import Button from './Button.jsx';

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Accessible modal dialog.
 *
 * Handles the three things a hand-rolled overlay usually gets wrong: Escape to
 * close, focus moved into the dialog on open, and the background locked so the
 * page behind does not scroll under the overlay.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  closeOnOverlay = true,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the panel so keyboard users land inside the dialog, not behind it.
    const timer = setTimeout(() => panelRef.current?.focus(), 0);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-ink-900/45 backdrop-blur-[2px]"
        onClick={closeOnOverlay ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={clsx(
          'relative flex max-h-[92vh] w-full flex-col animate-slide-up overflow-hidden bg-white shadow-float outline-none',
          'rounded-t-2xl sm:rounded-card',
          SIZES[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mt-1 -mr-1 shrink-0 rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label="Close dialog"
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-ink-200 bg-ink-50/60 px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * Confirmation dialog for destructive or irreversible actions.
 * Always states the consequence, not just "Are you sure?".
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  children,
}) {
  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onClose}
      title={title}
      size="sm"
      closeOnOverlay={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message && <p className="text-sm leading-relaxed text-ink-600">{message}</p>}
      {children}
    </Modal>
  );
}
