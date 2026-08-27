import { useState } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, GripVertical, Lock } from 'lucide-react';
import { fieldIcon } from '../../utils/fieldIcons.js';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { FileText } from 'lucide-react';

/**
 * The middle column: the field list, reorderable.
 *
 * Uses the native HTML drag-and-drop API rather than a library - the
 * interaction is a single-axis list reorder, which does not justify a
 * dependency. Arrow buttons duplicate the same action for keyboard and touch
 * users, since native DnD reaches neither.
 */
export default function FieldCanvas({
  fields,
  types,
  selectedIndex,
  onSelect,
  onReorder,
  hasSubmissions,
}) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  if (!fields.length) {
    return (
      <EmptyState
        icon={FileText}
        title="This form has no fields yet"
        description="Pick a field from the left to start building. Common fields like Full Name and Photograph are one click away."
      />
    );
  }

  const move = (from, to) => {
    if (to < 0 || to >= fields.length || from === to) return;
    const next = [...fields];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next, to);
  };

  return (
    <ol className="space-y-2 p-4">
      {fields.map((field, index) => {
        const def = types.find((t) => t.type === field.type);
        const Icon = fieldIcon(def?.icon);
        const selected = index === selectedIndex;
        const isLayout = def && !def.dataBearing;
        // A field that already holds answers cannot change type.
        const locked = hasSubmissions && Boolean(field.key);

        return (
          <li
            key={field.key || `new-${index}`}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIndex(index);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null) move(dragIndex, index);
              setDragIndex(null);
              setOverIndex(null);
            }}
            className={clsx(
              'group rounded-lg border bg-white transition',
              selected
                ? 'border-brand-400 ring-2 ring-brand-500/20'
                : 'border-ink-200 hover:border-ink-300',
              dragIndex === index && 'opacity-40',
              overIndex === index && dragIndex !== null && dragIndex !== index && 'border-brand-400'
            )}
          >
            <div className="flex items-center gap-2 p-2.5">
              <span
                className="cursor-grab text-ink-300 transition group-hover:text-ink-500 active:cursor-grabbing"
                aria-hidden="true"
              >
                <GripVertical size={16} />
              </span>

              <button
                type="button"
                onClick={() => onSelect(index)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <span
                  className={clsx(
                    'grid size-8 shrink-0 place-items-center rounded-md',
                    isLayout ? 'bg-ink-100 text-ink-400' : 'bg-brand-50 text-brand-600'
                  )}
                >
                  <Icon size={15} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-ink-900">
                      {field.label || def?.label}
                    </span>
                    {field.required && (
                      <span className="text-danger-500" aria-label="required">
                        *
                      </span>
                    )}
                    {locked && (
                      <Lock
                        size={11}
                        className="shrink-0 text-ink-400"
                        aria-label="Type locked - this field has answers"
                      />
                    )}
                  </span>
                  <span className="block truncate text-xs text-ink-500">
                    {def?.label}
                    {field.width === 'half' ? ' · half width' : ''}
                  </span>
                </span>
              </button>

              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  className="rounded p-0.5 text-ink-300 transition hover:bg-ink-100 hover:text-ink-600 disabled:opacity-30"
                  aria-label={`Move ${field.label} up`}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === fields.length - 1}
                  className="rounded p-0.5 text-ink-300 transition hover:bg-ink-100 hover:text-ink-600 disabled:opacity-30"
                  aria-label={`Move ${field.label} down`}
                >
                  <ArrowDown size={13} />
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
