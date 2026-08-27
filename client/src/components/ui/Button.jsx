import { forwardRef } from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary:
    'bg-brand-600 text-white shadow-panel hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary:
    'bg-white text-ink-700 ring-1 ring-inset ring-ink-300 shadow-panel hover:bg-ink-50 active:bg-ink-100 disabled:text-ink-400',
  subtle: 'bg-ink-100 text-ink-700 hover:bg-ink-200 active:bg-ink-300 disabled:text-ink-400',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200',
  danger:
    'bg-danger-600 text-white shadow-panel hover:bg-danger-700 active:bg-danger-700 disabled:bg-danger-300',
  success:
    'bg-success-600 text-white shadow-panel hover:bg-success-700 active:bg-success-700 disabled:bg-success-500/60',
  accent:
    'bg-accent-500 text-white shadow-panel hover:bg-accent-600 active:bg-accent-700 disabled:bg-accent-300',
};

const SIZES = {
  xs: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[0.9375rem] gap-2 rounded-lg',
};

/**
 * `loading` intentionally also disables the button - a submit that is already
 * in flight must not be re-triggered by an impatient double click.
 */
const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon: Icon,
    iconRight: IconRight,
    loading = false,
    disabled = false,
    fullWidth = false,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center justify-center font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon size={16} aria-hidden="true" />
      )}
      {children}
      {IconRight && !loading && <IconRight size={16} aria-hidden="true" />}
    </button>
  );
});

export default Button;
