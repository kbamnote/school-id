import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Eye, Pencil, Save, Send, Settings2 } from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import FieldPalette from '../../features/formBuilder/FieldPalette.jsx';
import FieldCanvas from '../../features/formBuilder/FieldCanvas.jsx';
import FieldSettings from '../../features/formBuilder/FieldSettings.jsx';
import FormPreview from '../../features/formBuilder/FormPreview.jsx';
import { formsApi } from '../../api/formsApi.js';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import useUnsavedChanges from '../../hooks/useUnsavedChanges.js';

const PRODUCT_TYPES = [
  { value: 'id_card', label: 'ID Card' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'badge', label: 'Badge' },
  { value: 'visiting_card', label: 'Visiting Card' },
  { value: 'letter', label: 'Letter' },
  { value: 'other', label: 'Other' },
];

export default function FormBuilderPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();

  const [registry, setRegistry] = useState(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    productType: 'id_card',
    settings: {},
    duplicateCheckFields: [],
    status: 'draft',
    stats: { submissionCount: 0 },
  });
  const [fields, setFields] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('build');

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const hasSubmissions = (form.stats?.submissionCount || 0) > 0;

  /* Warns before navigating away from unsaved work. */
  const { blocked, confirmLeave, cancelLeave } = useUnsavedChanges(dirty);

  useEffect(() => {
    formsApi.fieldTypes().then(setRegistry).catch(() => setRegistry({ types: [], groups: [], library: [] }));
  }, []);

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await formsApi.get(id);
      setForm(data.form);
      setFields(data.form.fields.filter((f) => !f.archived).sort((a, b) => a.order - b.order));
      setDirty(false);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    load();
  }, [load]);

  const mutateFields = (next, nextSelected) => {
    setFields(next);
    setDirty(true);
    if (nextSelected !== undefined) setSelected(nextSelected);
  };

  const addField = (type, preset = {}) => {
    const def = registry.types.find((t) => t.type === type);
    const next = [
      ...fields,
      {
        type,
        label: preset.label || def?.label || 'Untitled field',
        required: Boolean(preset.required),
        width: 'full',
        ...(def?.hasOptions
          ? { options: preset.options?.length ? preset.options : def.defaults?.options || ['Option 1'] }
          : {}),
        ...(def?.isFile ? { fileSettings: { ...def.defaults } } : {}),
      },
    ];
    mutateFields(next, next.length - 1);
  };

  const updateField = (index, patch) => {
    const next = [...fields];
    next[index] = patch;
    mutateFields(next);
  };

  const deleteField = (index) => {
    mutateFields(
      fields.filter((_, i) => i !== index),
      null
    );
  };

  const save = async ({ silent = false } = {}) => {
    if (!form.title.trim()) {
      toast.error('Give the form a title before saving.');
      setSettingsOpen(true);
      return null;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description || '',
        productType: form.productType,
        settings: form.settings || {},
        duplicateCheckFields: form.duplicateCheckFields || [],
        fields: fields.map((f, i) => ({ ...f, order: i })),
      };

      const saved = isNew
        ? await formsApi.create(payload)
        : await formsApi.update(id, payload);

      setForm(saved);
      setFields(saved.fields.filter((f) => !f.archived).sort((a, b) => a.order - b.order));
      setDirty(false);
      if (!silent) toast.success('Form saved.');

      // A brand-new form now has an id; move to its edit URL so a refresh works.
      if (isNew) navigate(`/client/forms/${saved.id}/edit`, { replace: true });
      return saved;
    } catch (err) {
      toast.error(errorMessage(err));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    const saved = dirty || isNew ? await save({ silent: true }) : form;
    if (!saved) return;
    try {
      const published = await formsApi.setStatus(saved.id || id, 'published');
      setForm(published);
      setPublishOpen(false);
      toast.success('Form published. You can now assign it to people.');
      navigate(`/client/forms/${published.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setPublishOpen(false);
    }
  };

  if (loading || !registry) return <PageLoader label="Loading builder..." />;
  if (loadError) return <ErrorState message={loadError} onRetry={load} />;

  const selectedField = selected !== null ? fields[selected] : null;
  const selectedDef = selectedField
    ? registry.types.find((t) => t.type === selectedField.type)
    : null;
  const dataFieldCount = fields.filter(
    (f) => registry.types.find((t) => t.type === f.type)?.dataBearing
  ).length;

  return (
    <>
      <PageHeader
        title={isNew ? 'New form' : form.title || 'Untitled form'}
        subtitle={
          isNew
            ? 'Add the details each person needs to submit.'
            : `${dataFieldCount} data field${dataFieldCount === 1 ? '' : 's'}${
                hasSubmissions ? ` · ${form.stats.submissionCount} submissions` : ''
              }`
        }
        breadcrumbs={[
          { label: 'Dashboard', to: '/client' },
          { label: 'Forms', to: '/client/forms' },
          { label: isNew ? 'New' : 'Edit' },
        ]}
        actions={
          <>
            {!isNew && <StatusBadge status={form.status} kind="generic" />}
            <Button variant="secondary" icon={Settings2} onClick={() => setSettingsOpen(true)}>
              Settings
            </Button>
            <Button variant="secondary" icon={Save} loading={saving} onClick={() => save()}>
              Save
            </Button>
            {form.status !== 'published' && (
              <Button icon={Send} onClick={() => setPublishOpen(true)} disabled={!dataFieldCount}>
                Publish
              </Button>
            )}
          </>
        }
      />

      {hasSubmissions && (
        <div className="mb-4 flex items-start gap-2.5 rounded-card border border-warning-200 bg-warning-50 p-3.5">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-warning-600" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-warning-800">
            This form already has {form.stats.submissionCount} submissions. You can rename fields
            and add new ones, but existing fields keep their type, and removing one hides it rather
            than deleting the answers already collected.
          </p>
        </div>
      )}

      <div className="mb-4 flex rounded-lg bg-ink-100 p-0.5 sm:w-64">
        {[
          { key: 'build', label: 'Build', icon: Pencil },
          { key: 'preview', label: 'Preview', icon: Eye },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={clsx(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
              tab === t.key ? 'bg-white text-ink-900 shadow-panel' : 'text-ink-500 hover:text-ink-700'
            )}
          >
            <t.icon size={14} aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'preview' ? (
        <FormPreview form={form} fields={fields} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[16rem_1fr_18rem]">
          <Card className="max-h-[38rem] overflow-hidden lg:sticky lg:top-20">
            <FieldPalette
              types={registry.types}
              groups={registry.groups}
              library={registry.library}
              onAddType={(type) => addField(type)}
              onAddLibrary={(item) => addField(item.type, item)}
            />
          </Card>

          <Card className="min-h-[24rem]">
            <FieldCanvas
              fields={fields}
              types={registry.types}
              selectedIndex={selected}
              onSelect={setSelected}
              onReorder={(next, newIndex) => mutateFields(next, newIndex)}
              hasSubmissions={hasSubmissions}
            />
          </Card>

          <Card className="max-h-[38rem] overflow-hidden lg:sticky lg:top-20">
            <FieldSettings
              field={selectedField}
              definition={selectedDef}
              hasSubmissions={hasSubmissions}
              onChange={(patch) => updateField(selected, patch)}
              onDelete={() => deleteField(selected)}
            />
          </Card>
        </div>
      )}

      {/* ------------------------- form settings ------------------------- */}
      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Form settings"
        size="lg"
        footer={<Button onClick={() => setSettingsOpen(false)}>Done</Button>}
      >
        <div className="space-y-4">
          <Input
            label="Form title"
            required
            value={form.title}
            onChange={(e) => {
              setForm({ ...form, title: e.target.value });
              setDirty(true);
            }}
            placeholder="Student ID Card 2026"
          />
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Description</span>
            <textarea
              rows={2}
              value={form.description || ''}
              onChange={(e) => {
                setForm({ ...form, description: e.target.value });
                setDirty(true);
              }}
              placeholder="Shown at the top of the form."
              className="w-full rounded-lg border border-ink-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
            />
          </div>
          <Select
            label="What is being printed"
            options={PRODUCT_TYPES}
            value={form.productType}
            onChange={(e) => {
              setForm({ ...form, productType: e.target.value });
              setDirty(true);
            }}
          />

          <div className="space-y-3 border-t border-ink-200 pt-4">
            {[
              ['allowDrafts', 'Allow saving as draft', 'Users can come back and finish later.'],
              [
                'allowEditAfterSubmit',
                'Allow editing after submitting',
                'Until an administrator starts reviewing it.',
              ],
              [
                'requireDeclaration',
                'Require a declaration',
                'A tick-box confirming the details are correct.',
              ],
            ].map(([key, label, hint]) => (
              <label key={key} className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={Boolean(form.settings?.[key])}
                  onChange={(e) => {
                    setForm({ ...form, settings: { ...form.settings, [key]: e.target.checked } });
                    setDirty(true);
                  }}
                  className="mt-0.5 size-4 rounded border-ink-300 text-brand-600 focus:ring-2 focus:ring-brand-500/30"
                />
                <span>
                  <span className="block text-sm font-medium text-ink-800">{label}</span>
                  <span className="block text-xs text-ink-500">{hint}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="border-t border-ink-200 pt-4">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">
              Duplicate detection
            </span>
            <p className="mb-2.5 text-xs leading-relaxed text-ink-500">
              Two submissions matching on all of these fields are flagged as the same person.
              Leave empty to turn it off.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {fields
                .filter((f) => {
                  const def = registry.types.find((t) => t.type === f.type);
                  return def?.dataBearing && !def.isFile && f.key;
                })
                .map((f) => {
                  const on = (form.duplicateCheckFields || []).includes(f.key);
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => {
                        const list = form.duplicateCheckFields || [];
                        setForm({
                          ...form,
                          duplicateCheckFields: on
                            ? list.filter((k) => k !== f.key)
                            : [...list, f.key],
                        });
                        setDirty(true);
                      }}
                      className={
                        on
                          ? 'rounded-full bg-brand-600 px-2.5 py-1 text-xs font-medium text-white'
                          : 'rounded-full bg-white px-2.5 py-1 text-xs font-medium text-ink-600 ring-1 ring-ink-200 transition hover:bg-ink-50'
                      }
                    >
                      {f.label}
                    </button>
                  );
                })}
            </div>
            {!fields.some((f) => f.key) && (
              <p className="mt-2 text-xs text-ink-400">
                Save the form once so its fields get their keys, then pick them here.
              </p>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={publish}
        loading={saving}
        title="Publish this form?"
        message="Once published you can assign it to people and they can start submitting. You can still add fields afterwards, but existing fields become locked to their current type."
        confirmLabel="Publish"
        variant="primary"
      />

      <ConfirmDialog
        open={blocked}
        onClose={cancelLeave}
        onConfirm={confirmLeave}
        title="Leave without saving?"
        message="You have unsaved changes to this form. If you leave now they will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Stay"
      />
    </>
  );
}
