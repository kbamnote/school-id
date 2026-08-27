import { Plus, Trash2, X } from 'lucide-react';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';
import { fieldIcon } from '../../utils/fieldIcons.js';

function Toggle({ label, hint, checked, onChange, disabled }) {
  return (
    <label
      className={
        disabled
          ? 'flex cursor-not-allowed items-start gap-2.5 opacity-50'
          : 'flex cursor-pointer items-start gap-2.5'
      }
    >
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 rounded border-ink-300 text-brand-600 focus:ring-2 focus:ring-brand-500/30"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-800">{label}</span>
        {hint && <span className="block text-xs leading-snug text-ink-500">{hint}</span>}
      </span>
    </label>
  );
}

/** Editable option list for dropdown / radio / checkbox fields. */
function OptionsEditor({ options = [], onChange }) {
  const update = (index, value) => {
    const next = [...options];
    next[index] = value;
    onChange(next);
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink-700">Options</span>
      <div className="space-y-2">
        {options.map((option, i) => (
          // Index keys are correct here: options are positional and reorderable,
          // and their text is the thing being edited.
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="flex items-center gap-2">
            <Input
              containerClassName="flex-1"
              value={option}
              onChange={(e) => update(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              aria-label={`Option ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => onChange(options.filter((_, idx) => idx !== i))}
              disabled={options.length <= 1}
              className="rounded-md p-2 text-ink-400 transition hover:bg-danger-50 hover:text-danger-600 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Remove option ${i + 1}`}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        icon={Plus}
        className="mt-2"
        onClick={() => onChange([...options, ''])}
      >
        Add option
      </Button>
      <p className="mt-2 text-xs text-ink-500">
        Answers are checked against this list, so a submission can never contain a value you did
        not offer.
      </p>
    </div>
  );
}

/**
 * The right-hand settings panel for the selected field.
 *
 * Only shows controls the field's type actually supports, read from the
 * server's `supports` map - so a dropdown never offers a "minimum length".
 */
export default function FieldSettings({ field, definition, onChange, onDelete, hasSubmissions }) {
  if (!field) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-sm font-medium text-ink-700">No field selected</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
          Pick a field in the middle to edit its label, help text and validation rules.
        </p>
      </div>
    );
  }

  const Icon = fieldIcon(definition?.icon);
  const supports = definition?.supports || {};
  const set = (patch) => onChange({ ...field, ...patch });
  const setValidation = (patch) =>
    onChange({ ...field, validation: { ...(field.validation || {}), ...patch } });
  const setFile = (patch) =>
    onChange({ ...field, fileSettings: { ...(field.fileSettings || {}), ...patch } });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-2.5 border-b border-ink-200 p-4">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Icon size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-900">{definition?.label}</p>
          <p className="truncate font-mono text-xs text-ink-500">{field.key || 'new field'}</p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <Input
          label="Label"
          value={field.label || ''}
          onChange={(e) => set({ label: e.target.value })}
          required
        />

        {definition?.dataBearing && (
          <>
            {supports.placeholder && (
              <Input
                label="Placeholder"
                value={field.placeholder || ''}
                onChange={(e) => set({ placeholder: e.target.value })}
                placeholder="Shown inside the empty box"
              />
            )}

            <Input
              label="Help text"
              value={field.helpText || ''}
              onChange={(e) => set({ helpText: e.target.value })}
              placeholder="Explain what to enter"
            />

            <Toggle
              label="Required"
              hint="The form cannot be submitted without this."
              checked={field.required}
              onChange={(v) => set({ required: v })}
            />
          </>
        )}

        <Select
          label="Width"
          value={field.width || 'full'}
          onChange={(e) => set({ width: e.target.value })}
          options={[
            { value: 'full', label: 'Full width' },
            { value: 'half', label: 'Half width' },
          ]}
        />

        {definition?.hasOptions && (
          <OptionsEditor options={field.options || []} onChange={(options) => set({ options })} />
        )}

        {(supports.minLength || supports.maxLength) && (
          <div className="grid grid-cols-2 gap-3">
            {supports.minLength && (
              <Input
                label="Min length"
                type="number"
                min={0}
                value={field.validation?.minLength ?? ''}
                onChange={(e) =>
                  setValidation({ minLength: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            )}
            {supports.maxLength && (
              <Input
                label="Max length"
                type="number"
                min={1}
                value={field.validation?.maxLength ?? ''}
                onChange={(e) =>
                  setValidation({ maxLength: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            )}
          </div>
        )}

        {(supports.min || supports.max) && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Minimum"
              type="number"
              value={field.validation?.min ?? ''}
              onChange={(e) =>
                setValidation({ min: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
            <Input
              label="Maximum"
              type="number"
              value={field.validation?.max ?? ''}
              onChange={(e) =>
                setValidation({ max: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </div>
        )}

        {(supports.minDate || supports.maxDate) && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Earliest date"
              type="date"
              value={field.validation?.minDate ? String(field.validation.minDate).slice(0, 10) : ''}
              onChange={(e) => setValidation({ minDate: e.target.value || undefined })}
            />
            <Input
              label="Latest date"
              type="date"
              value={field.validation?.maxDate ? String(field.validation.maxDate).slice(0, 10) : ''}
              onChange={(e) => setValidation({ maxDate: e.target.value || undefined })}
            />
          </div>
        )}

        {(supports.minSelected || supports.maxSelected) && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Min selections"
              type="number"
              min={0}
              value={field.validation?.minSelected ?? ''}
              onChange={(e) =>
                setValidation({ minSelected: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
            <Input
              label="Max selections"
              type="number"
              min={1}
              value={field.validation?.maxSelected ?? ''}
              onChange={(e) =>
                setValidation({ maxSelected: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </div>
        )}

        {supports.pattern && (
          <>
            <Input
              label="Pattern (regular expression)"
              value={field.validation?.pattern || ''}
              onChange={(e) => setValidation({ pattern: e.target.value || undefined })}
              placeholder="^ADM-[0-9]{4}$"
              hint="Leave blank for no format rule."
            />
            {field.validation?.pattern && (
              <Input
                label="Message when it does not match"
                value={field.validation?.patternMessage || ''}
                onChange={(e) => setValidation({ patternMessage: e.target.value || undefined })}
                placeholder="Use the format ADM-1234"
              />
            )}
          </>
        )}

        {definition?.isFile && (
          <div className="space-y-3 rounded-lg bg-ink-50 p-3.5">
            <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
              Upload rules
            </p>
            {supports.aspectRatio && (
              <Input
                label="Aspect ratio"
                value={field.fileSettings?.aspectRatio || ''}
                onChange={(e) => setFile({ aspectRatio: e.target.value })}
                placeholder="3:4"
                hint="The crop tool locks to this shape."
              />
            )}
            {supports.minWidth && (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Min width (px)"
                  type="number"
                  value={field.fileSettings?.minWidth ?? ''}
                  onChange={(e) => setFile({ minWidth: Number(e.target.value) || undefined })}
                />
                <Input
                  label="Min height (px)"
                  type="number"
                  value={field.fileSettings?.minHeight ?? ''}
                  onChange={(e) => setFile({ minHeight: Number(e.target.value) || undefined })}
                />
              </div>
            )}
            <Input
              label="Max size (MB)"
              type="number"
              step="0.5"
              value={field.fileSettings?.maxSizeMb ?? ''}
              onChange={(e) => setFile({ maxSizeMb: Number(e.target.value) || undefined })}
            />
          </div>
        )}
      </div>

      <div className="border-t border-ink-200 p-3">
        <Button
          variant="ghost"
          icon={Trash2}
          fullWidth
          className="text-danger-600 hover:bg-danger-50"
          onClick={onDelete}
        >
          {hasSubmissions ? 'Remove from form' : 'Delete field'}
        </Button>
        {hasSubmissions && (
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            This form has submissions, so the field is hidden rather than deleted — the answers
            already collected stay readable.
          </p>
        )}
      </div>
    </div>
  );
}
