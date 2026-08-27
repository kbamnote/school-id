import { forwardRef, useId, useState } from 'react';
import clsx from 'clsx';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Text input with label, hint and error slots.
 *
 * The error is wired with aria-describedby + aria-invalid rather than colour
 * alone, so it is announced by screen readers and visible to colour-blind users.
 */
const Input = forwardRef(function Input(
  {
    label,
    hint,
    error,
    icon: Icon,
    type = 'text',
    required,
    className,
    containerClassName,
    id: idProp,
    ...rest
  },
  ref
) {
  const reactId = useId();
  const id = idProp || reactId;
  const [reveal, setReveal] = useState(false);

  const isPassword = type === 'password';
  const resolvedType = isPassword && reveal ? 'text' : type;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={clsx('w-full', containerClassName)}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-700">
          {label}
          {required && <span className="ml-0.5 text-danger-500" aria-hidden="true">*</span>}
        </label>
      )}

      <div className="relative">
        {Icon && (
          <Icon
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
        )}
        <input
          ref={ref}
          id={id}
          type={resolvedType}
          required={required}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          className={clsx(
            'w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-ink-900 transition',
            'placeholder:text-ink-400',
            'focus:ring-2 focus:outline-none',
            'disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-500',
            Icon && 'pl-9',
            isPassword && 'pr-10',
            error
              ? 'border-danger-400 focus:border-danger-500 focus:ring-danger-500/20'
              : 'border-ink-300 focus:border-brand-500 focus:ring-brand-500/20',
            className
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-600"
            aria-label={reveal ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>

      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export default Input;
