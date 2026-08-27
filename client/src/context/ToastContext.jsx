import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const VARIANTS = {
  success: { icon: CheckCircle2, ring: 'ring-success-500/25', accent: 'text-success-600' },
  error: { icon: XCircle, ring: 'ring-danger-500/25', accent: 'text-danger-600' },
  warning: { icon: AlertTriangle, ring: 'ring-warning-500/25', accent: 'text-warning-600' },
  info: { icon: Info, ring: 'ring-info-500/25', accent: 'text-info-600' },
};

let seq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, variant = 'info', { title, duration = 4500 } = {}) => {
      const id = ++seq;
      setToasts((prev) => [...prev, { id, message, variant, title }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const toast = useMemo(
    () => ({
      success: (m, o) => push(m, 'success', o),
      error: (m, o) => push(m, 'error', o),
      warning: (m, o) => push(m, 'warning', o),
      info: (m, o) => push(m, 'info', o),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="pointer-events-none fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((t) => {
          const { icon: Icon, ring, accent } = VARIANTS[t.variant] || VARIANTS.info;
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex animate-slide-up items-start gap-3 rounded-card bg-white p-3.5 shadow-float ring-1 ${ring}`}
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${accent}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {t.title && (
                  <p className="text-sm font-semibold text-ink-900">{t.title}</p>
                )}
                <p className="text-sm break-words text-ink-600">{t.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-md p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-600"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
