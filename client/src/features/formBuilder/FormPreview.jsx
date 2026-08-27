import { Camera, FileText, PenTool, Upload } from 'lucide-react';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';

/**
 * Renders the form exactly as the end user will see it.
 *
 * Read-only on purpose: this is a preview, not a test submission. Everything
 * is disabled so nobody mistakes it for the real thing.
 */
function PreviewField({ field }) {
  const label = field.label;
  const common = { label, disabled: true, required: field.required, hint: field.helpText };

  switch (field.type) {
    case 'heading':
      return (
        <div className="col-span-2 border-b border-ink-200 pt-2 pb-1.5">
          <h3 className="text-sm font-semibold text-ink-900">{label}</h3>
        </div>
      );

    case 'instructions':
      return (
        <p className="col-span-2 rounded-lg bg-info-50 p-3 text-sm leading-relaxed text-info-800">
          {label}
        </p>
      );

    case 'divider':
      return <hr className="col-span-2 my-1 border-ink-200" />;

    case 'long_text':
      return (
        <div className="col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">
            {label}
            {field.required && <span className="ml-0.5 text-danger-500">*</span>}
          </span>
          <textarea
            disabled
            rows={3}
            placeholder={field.placeholder}
            className="w-full rounded-lg border border-ink-300 bg-ink-100 px-3 py-2.5 text-sm"
          />
          {field.helpText && <p className="mt-1.5 text-xs text-ink-500">{field.helpText}</p>}
        </div>
      );

    case 'dropdown':
      return (
        <Select
          {...common}
          placeholder={field.placeholder || 'Select...'}
          options={(field.options || []).map((o) => ({ value: o, label: o }))}
        />
      );

    case 'radio':
    case 'checkbox':
      return (
        <div className="col-span-2">
          <span className="mb-2 block text-sm font-medium text-ink-700">
            {label}
            {field.required && <span className="ml-0.5 text-danger-500">*</span>}
          </span>
          <div className="space-y-1.5">
            {(field.options || []).map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-ink-600">
                <input
                  type={field.type === 'radio' ? 'radio' : 'checkbox'}
                  disabled
                  className="size-4 border-ink-300"
                />
                {option}
              </label>
            ))}
          </div>
          {field.helpText && <p className="mt-1.5 text-xs text-ink-500">{field.helpText}</p>}
        </div>
      );

    case 'address':
      return (
        <div className="col-span-2 space-y-2.5 rounded-lg border border-ink-200 p-3">
          <span className="block text-sm font-medium text-ink-700">
            {label}
            {field.required && <span className="ml-0.5 text-danger-500">*</span>}
          </span>
          <Input disabled placeholder="Address line 1" />
          <div className="grid grid-cols-3 gap-2">
            <Input disabled placeholder="City" />
            <Input disabled placeholder="State" />
            <Input disabled placeholder="PIN code" />
          </div>
        </div>
      );

    case 'photo':
    case 'signature':
    case 'document': {
      const Icon = field.type === 'photo' ? Camera : field.type === 'signature' ? PenTool : FileText;
      const ratio = field.fileSettings?.aspectRatio;
      return (
        <div className="col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">
            {label}
            {field.required && <span className="ml-0.5 text-danger-500">*</span>}
          </span>
          <div className="flex items-center gap-3 rounded-lg border-2 border-dashed border-ink-300 bg-ink-50 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-ink-400">
              <Icon size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-600">
                <Upload size={13} className="mr-1 inline" aria-hidden="true" />
                Upload {field.type}
              </p>
              <p className="text-xs text-ink-500">
                {ratio ? `${ratio} ratio · ` : ''}
                max {field.fileSettings?.maxSizeMb || 5} MB
              </p>
            </div>
          </div>
          {field.helpText && <p className="mt-1.5 text-xs text-ink-500">{field.helpText}</p>}
        </div>
      );
    }

    case 'hidden':
      return null;

    default:
      return (
        <Input
          {...common}
          type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
          placeholder={field.placeholder}
        />
      );
  }
}

export default function FormPreview({ form, fields }) {
  const visible = fields.filter((f) => !f.archived && f.type !== 'hidden');

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-card border border-ink-200 bg-white p-6 shadow-panel">
        <h2 className="text-lg font-semibold text-ink-900">{form.title || 'Untitled form'}</h2>
        {form.description && (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{form.description}</p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-4">
          {visible.map((field, i) => (
            <div
              key={field.key || i}
              className={field.width === 'half' ? 'col-span-2 sm:col-span-1' : 'col-span-2'}
            >
              <PreviewField field={field} />
            </div>
          ))}
        </div>

        {form.settings?.requireDeclaration && (
          <label className="mt-6 flex items-start gap-2.5 rounded-lg bg-ink-50 p-3">
            <input type="checkbox" disabled className="mt-0.5 size-4 border-ink-300" />
            <span className="text-sm leading-relaxed text-ink-600">
              {form.settings.declarationText}
            </span>
          </label>
        )}

        <button
          type="button"
          disabled
          className="mt-6 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white opacity-60"
        >
          Submit
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-ink-400">
        Preview only — nothing here can be submitted.
      </p>
    </div>
  );
}
