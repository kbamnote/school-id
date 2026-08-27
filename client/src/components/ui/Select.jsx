import { forwardRef, useId } from 'react';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';

const Select = forwardRef(function Select(
  { label, hint, error, options = [], placeholder, required, className, containerClassName, id: idProp, ...rest },
  ref
) {
  const reactId = useId();
  const id = idProp || reactId;
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
        <select
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          className={clsx(
            'w-full appearance-none rounded-lg border bg-white py-2.5 pr-9 pl-3 text-sm text-ink-900 transition',
            'focus:ring-2 focus:outline-none',
            'disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-500',
            error
              ? 'border-danger-400 focus:border-danger-500 focus:ring-danger-500/20'
              : 'border-ink-300 focus:border-brand-500 focus:ring-brand-500/20',
            className
          )}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-400"
          aria-hidden="true"
        />
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

export default Select;
