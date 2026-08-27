import { useState } from 'react';
import { Plus, Search, Library } from 'lucide-react';
import clsx from 'clsx';
import Input from '../../components/ui/Input.jsx';
import { fieldIcon } from '../../utils/fieldIcons.js';

/**
 * The left-hand palette.
 *
 * Two ways in: pick a raw field type, or take a ready-made field from the
 * library (Full Name, Blood Group, Photograph...). The library matters because
 * building an ID-card form otherwise means retyping the same twenty labels.
 */
export default function FieldPalette({ types, groups, library, onAddType, onAddLibrary }) {
  const [tab, setTab] = useState('library');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();

  const filteredTypes = q
    ? types.filter((t) => t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
    : types;

  const filteredLibrary = q
    ? library.filter((f) => f.label.toLowerCase().includes(q) || f.group.toLowerCase().includes(q))
    : library;

  const libraryByGroup = filteredLibrary.reduce((acc, item) => {
    (acc[item.group] = acc[item.group] || []).push(item);
    return acc;
  }, {});

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-200 p-3">
        <div className="mb-3 flex rounded-lg bg-ink-100 p-0.5">
          {[
            { key: 'library', label: 'Common fields' },
            { key: 'types', label: 'All types' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={clsx(
                'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition',
                tab === t.key ? 'bg-white text-ink-900 shadow-panel' : 'text-ink-500 hover:text-ink-700'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Input
          icon={Search}
          placeholder="Search fields..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search fields"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'types' ? (
          groups.map((group) => {
            const items = filteredTypes.filter((t) => t.group === group.key);
            if (!items.length) return null;
            return (
              <div key={group.key} className="mb-4">
                <p className="mb-1.5 px-1 text-[0.6875rem] font-semibold tracking-wider text-ink-400 uppercase">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {items.map((type) => {
                    const Icon = fieldIcon(type.icon);
                    return (
                      <button
                        key={type.type}
                        type="button"
                        onClick={() => onAddType(type.type)}
                        className="group flex w-full items-start gap-2.5 rounded-lg border border-ink-200 bg-white p-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
                      >
                        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-ink-100 text-ink-500 transition group-hover:bg-brand-100 group-hover:text-brand-600">
                          <Icon size={14} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ink-800">{type.label}</span>
                          <span className="block text-xs leading-snug text-ink-500">
                            {type.description}
                          </span>
                        </span>
                        <Plus
                          size={14}
                          className="mt-1 shrink-0 text-ink-300 transition group-hover:text-brand-500"
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        ) : Object.keys(libraryByGroup).length ? (
          Object.entries(libraryByGroup).map(([group, items]) => (
            <div key={group} className="mb-4">
              <p className="mb-1.5 px-1 text-[0.6875rem] font-semibold tracking-wider text-ink-400 uppercase">
                {group}
              </p>
              <div className="space-y-1">
                {items.map((item) => {
                  const def = types.find((t) => t.type === item.type);
                  const Icon = fieldIcon(def?.icon);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onAddLibrary(item)}
                      className="group flex w-full items-center gap-2.5 rounded-lg border border-ink-200 bg-white p-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-ink-100 text-ink-500 transition group-hover:bg-brand-100 group-hover:text-brand-600">
                        <Icon size={14} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-800">
                          {item.label}
                        </span>
                        <span className="block text-xs text-ink-500">{def?.label}</span>
                      </span>
                      {item.required && (
                        <span className="text-[0.625rem] font-medium text-danger-500">req</span>
                      )}
                      <Plus
                        size={14}
                        className="shrink-0 text-ink-300 transition group-hover:text-brand-500"
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="px-2 py-8 text-center">
            <Library size={20} className="mx-auto text-ink-300" aria-hidden="true" />
            <p className="mt-2 text-sm text-ink-500">No fields match “{query}”.</p>
          </div>
        )}
      </div>
    </div>
  );
}
