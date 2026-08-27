import { FileText, Upload as UploadIcon, Trash2, AlertCircle } from 'lucide-react';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import PhotoUpload from './PhotoUpload.jsx';
import { formatBytes } from '../../utils/format.js';

function Label({ field }) {
  return (
    <span className="mb-1.5 block text-sm font-medium text-ink-700">
      {field.label}
      {field.required && <span className="ml-0.5 text-danger-500">*</span>}
    </span>
  );
}

function FieldError({ error, id }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs font-medium text-danger-600">
      {error}
    </p>
  );
}

/** Non-image upload (a certificate, for example). No cropping applies. */
function DocumentUpload({ field, value, onUpload, onRemove, disabled, error }) {
  const maxMb = field.fileSettings?.maxSizeMb || 8;

  return (
    <div>
      <Label field={field} />
      {value?.url ? (
        <div className="flex items-center gap-3 rounded-lg border border-ink-200 bg-white p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <FileText size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-800">{value.originalName}</p>
            <p className="text-xs text-ink-500">{formatBytes(value.bytes)}</p>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={onRemove}
              className="shrink-0 rounded-md p-1.5 text-ink-400 transition hover:bg-danger-50 hover:text-danger-600"
              aria-label={`Remove ${field.label}`}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ) : (
        <label
          className={
            disabled
              ? 'flex cursor-not-allowed items-center gap-3 rounded-lg border-2 border-dashed border-ink-300 bg-ink-50 p-4 opacity-60'
              : 'flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-ink-300 bg-ink-50 p-4 transition hover:border-brand-400 hover:bg-brand-50/40'
          }
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-ink-400">
            <UploadIcon size={18} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink-700">Choose a file</span>
            <span className="block text-xs text-ink-500">PDF or image, max {maxMb} MB</span>
          </span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            disabled={disabled}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = '';
            }}
          />
        </label>
      )}
      {field.helpText && <p className="mt-1.5 text-xs text-ink-500">{field.helpText}</p>}
      <FieldError error={error} />
    </div>
  );
}

/** Composite address field, stored as an object. */
function AddressField({ field, value = {}, onChange, disabled, error }) {
  const set = (part, v) => onChange({ ...value, [part]: v });

  return (
    <div>
      <Label field={field} />
      <div className="space-y-2.5 rounded-lg border border-ink-200 bg-white p-3">
        <Input
          placeholder="House / street"
          value={value.line1 || ''}
          onChange={(e) => set('line1', e.target.value)}
          disabled={disabled}
          aria-label={`${field.label} line 1`}
        />
        <Input
          placeholder="Area / landmark (optional)"
          value={value.line2 || ''}
          onChange={(e) => set('line2', e.target.value)}
          disabled={disabled}
          aria-label={`${field.label} line 2`}
        />
        <div className="grid gap-2.5 sm:grid-cols-3">
          <Input
            placeholder="City"
            value={value.city || ''}
            onChange={(e) => set('city', e.target.value)}
            disabled={disabled}
            aria-label="City"
          />
          <Input
            placeholder="State"
            value={value.state || ''}
            onChange={(e) => set('state', e.target.value)}
            disabled={disabled}
            aria-label="State"
          />
          <Input
            placeholder="PIN code"
            inputMode="numeric"
            maxLength={6}
            value={value.pincode || ''}
            onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))}
            disabled={disabled}
            aria-label="PIN code"
          />
        </div>
      </div>
      {field.helpText && <p className="mt-1.5 text-xs text-ink-500">{field.helpText}</p>}
      <FieldError error={error} />
    </div>
  );
}

/**
 * Renders one field of any type.
 *
 * The `type` switch mirrors the server's field registry. Both sides read the
 * same field definition, so a value the UI accepts is a value the validator
 * accepts - and anything it does not is rejected server-side regardless.
 */
export default function FieldRenderer({
  field,
  value,
  fileValue,
  onChange,
  onUpload,
  onRemoveFile,
  disabled,
  error,
  correctionNote,
}) {
  const wrap = (children) => (
    <div>
      {correctionNote && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-warning-200 bg-warning-50 p-2.5">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-warning-600" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-warning-800">{correctionNote}</p>
        </div>
      )}
      {children}
    </div>
  );

  switch (field.type) {
    /* ------------------------------ layout ------------------------------ */
    case 'heading':
      return (
        <div className="border-b border-ink-200 pt-3 pb-2">
          <h3 className="text-sm font-semibold tracking-wide text-ink-900 uppercase">
            {field.label}
          </h3>
        </div>
      );

    case 'instructions':
      return (
        <div className="rounded-lg bg-info-50 p-3.5">
          <p className="text-sm leading-relaxed text-info-800">{field.label}</p>
        </div>
      );

    case 'divider':
      return <hr className="border-ink-200" />;

    case 'hidden':
      return null;

    /* ------------------------------ uploads ----------------------------- */
    case 'photo':
    case 'signature':
      return wrap(
        <PhotoUpload
          field={field}
          value={fileValue}
          onUpload={onUpload}
          onRemove={onRemoveFile}
          disabled={disabled}
          error={error}
        />
      );

    case 'document':
      return wrap(
        <DocumentUpload
          field={field}
          value={fileValue}
          onUpload={onUpload}
          onRemove={onRemoveFile}
          disabled={disabled}
          error={error}
        />
      );

    /* ----------------------------- composite ---------------------------- */
    case 'address':
      return wrap(
        <AddressField
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          error={error}
        />
      );

    /* ------------------------------ choices ----------------------------- */
    case 'dropdown':
      return wrap(
        <Select
          label={field.label}
          required={field.required}
          disabled={disabled}
          hint={field.helpText}
          error={error}
          placeholder={field.placeholder || 'Select...'}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          options={(field.options || []).map((o) => ({ value: o, label: o }))}
        />
      );

    case 'radio':
      return wrap(
        <fieldset disabled={disabled}>
          <legend className="mb-1.5 text-sm font-medium text-ink-700">
            {field.label}
            {field.required && <span className="ml-0.5 text-danger-500">*</span>}
          </legend>
          <div className="space-y-1.5">
            {(field.options || []).map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
                <input
                  type="radio"
                  name={field.key}
                  value={option}
                  checked={value === option}
                  onChange={() => onChange(option)}
                  className="size-4 border-ink-300 text-brand-600 focus:ring-2 focus:ring-brand-500/30"
                />
                {option}
              </label>
            ))}
          </div>
          {field.helpText && <p className="mt-1.5 text-xs text-ink-500">{field.helpText}</p>}
          <FieldError error={error} />
        </fieldset>
      );

    case 'checkbox': {
      const selected = Array.isArray(value) ? value : [];
      return wrap(
        <fieldset disabled={disabled}>
          <legend className="mb-1.5 text-sm font-medium text-ink-700">
            {field.label}
            {field.required && <span className="ml-0.5 text-danger-500">*</span>}
          </legend>
          <div className="space-y-1.5">
            {(field.options || []).map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...selected, option]
                        : selected.filter((s) => s !== option)
                    )
                  }
                  className="size-4 rounded border-ink-300 text-brand-600 focus:ring-2 focus:ring-brand-500/30"
                />
                {option}
              </label>
            ))}
          </div>
          {field.helpText && <p className="mt-1.5 text-xs text-ink-500">{field.helpText}</p>}
          <FieldError error={error} />
        </fieldset>
      );
    }

    case 'long_text':
      return wrap(
        <div>
          <Label field={field} />
          <textarea
            rows={field.validation?.rows || 3}
            maxLength={field.validation?.maxLength}
            placeholder={field.placeholder}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-invalid={error ? 'true' : undefined}
            className={
              error
                ? 'w-full rounded-lg border border-danger-400 bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-danger-500/20 focus:outline-none'
                : 'w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none disabled:bg-ink-100'
            }
          />
          {field.helpText && <p className="mt-1.5 text-xs text-ink-500">{field.helpText}</p>}
          <FieldError error={error} />
        </div>
      );

    /* --------------------------- simple inputs -------------------------- */
    default: {
      const inputType =
        field.type === 'date'
          ? 'date'
          : field.type === 'number'
            ? 'number'
            : field.type === 'email'
              ? 'email'
              : field.type === 'phone'
                ? 'tel'
                : 'text';

      return wrap(
        <Input
          label={field.label}
          required={field.required}
          disabled={disabled}
          hint={field.helpText}
          error={error}
          type={inputType}
          placeholder={field.placeholder}
          value={value ?? ''}
          maxLength={field.validation?.maxLength}
          min={field.validation?.min ?? (inputType === 'date' ? field.validation?.minDate?.slice?.(0, 10) : undefined)}
          max={field.validation?.max ?? (inputType === 'date' ? field.validation?.maxDate?.slice?.(0, 10) : undefined)}
          inputMode={field.type === 'phone' ? 'tel' : field.type === 'number' ? 'numeric' : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
  }
}
