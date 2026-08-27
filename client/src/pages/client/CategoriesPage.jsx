import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Tags, Users, Pencil, Trash2, Hash } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { categoriesApi } from '../../api/clientApi.js';
import { errorMessage, fieldErrors } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSIONS } from '../../utils/rbac.js';
import { formatNumber } from '../../utils/format.js';

const SWATCHES = ['#1d45f5', '#059669', '#f05f06', '#7c3aed', '#dc2626', '#0891b2', '#ca8a04', '#475569'];

function CategoryForm({ open, onClose, category, onSaved }) {
  const toast = useToast();
  const [formError, setFormError] = useState('');
  const [color, setColor] = useState(category?.color || SWATCHES[0]);
  const editing = Boolean(category);
  // Once IDs are issued the prefix is frozen server-side; reflect that here.
  const prefixLocked = editing && (category?.issuedCount || 0) > 0;

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      name: category?.name || '',
      code: category?.code || '',
      idPrefix: category?.idPrefix || '',
      idPadding: category?.idPadding || 5,
      description: category?.description || '',
    },
  });

  useEffect(() => {
    reset({
      name: category?.name || '',
      code: category?.code || '',
      idPrefix: category?.idPrefix || '',
      idPadding: category?.idPadding || 5,
      description: category?.description || '',
    });
    setColor(category?.color || SWATCHES[0]);
    setFormError('');
  }, [category, reset, open]);

  const prefix = (watch('idPrefix') || 'XXX').toUpperCase();
  const padding = Number(watch('idPadding')) || 5;
  const preview = `${prefix}${'1'.padStart(padding, '0')}`;

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const payload = { ...values, color, idPadding: Number(values.idPadding) };
      if (prefixLocked) {
        delete payload.idPrefix;
        delete payload.idPadding;
      }
      const saved = editing
        ? await categoriesApi.update(category.id, payload)
        : await categoriesApi.create(payload);
      toast.success(editing ? 'Category updated.' : `Category "${saved.name}" created.`);
      onSaved();
      onClose();
    } catch (err) {
      const fields = fieldErrors(err);
      Object.entries(fields).forEach(([f, m]) => setError(f, { message: m }));
      if (!Object.keys(fields).length) setFormError(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${category.name}` : 'New category'}
      description="Categories describe what someone is — Student, Teacher, Driver. They do not grant any access."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} loading={isSubmitting}>
            {editing ? 'Save changes' : 'Create category'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && (
          <p role="alert" className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
            {formError}
          </p>
        )}

        <Input
          label="Category name"
          placeholder="Students"
          required
          error={errors.name?.message}
          {...register('name', { required: 'Enter a name' })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Short code"
            placeholder="STU"
            required
            hint="Uppercase, used internally."
            error={errors.code?.message}
            {...register('code', { required: 'Enter a code' })}
          />
          <Input
            label="ID prefix"
            placeholder="STU"
            required
            disabled={prefixLocked}
            hint={
              prefixLocked
                ? `Locked — ${category.issuedCount} IDs already issued.`
                : 'Letters only. Cannot change once IDs are issued.'
            }
            error={errors.idPrefix?.message}
            {...register('idPrefix', { required: 'Enter an ID prefix' })}
          />
        </div>

        <Input
          label="Number length"
          type="number"
          min={3}
          max={10}
          disabled={prefixLocked}
          error={errors.idPadding?.message}
          {...register('idPadding')}
        />

        <div className="rounded-lg bg-ink-50 p-3.5">
          <p className="text-[0.6875rem] font-medium tracking-wide text-ink-500 uppercase">
            Generated IDs will look like
          </p>
          <p className="mt-1 font-mono text-lg font-semibold text-brand-700">{preview}</p>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Colour</span>
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Select colour ${c}`}
                aria-pressed={color === c}
                className={
                  color === c
                    ? 'size-8 rounded-lg ring-2 ring-ink-900 ring-offset-2'
                    : 'size-8 rounded-lg ring-1 ring-ink-200'
                }
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <Input
          label="Description"
          placeholder="Optional"
          {...register('description')}
        />
      </form>
    </Modal>
  );
}

export default function CategoriesPage() {
  const toast = useToast();
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.CATEGORIES_MANAGE);

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await categoriesApi.list({ limit: 100 });
      setCategories(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = async (category) => {
    try {
      // Fetch the detail so `issuedCount` is known and the prefix can be locked.
      const detail = await categoriesApi.get(category.id);
      setEditing({ ...detail.category, issuedCount: detail.issuedCount });
    } catch {
      setEditing(category);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await categoriesApi.remove(deleting.id);
      toast.success(`"${deleting.name}" deleted.`);
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoader label="Loading categories..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Groups of people in your organisation. Each one issues its own ID series."
        breadcrumbs={[{ label: 'Dashboard', to: '/client' }, { label: 'Categories' }]}
        actions={
          canManage && (
            <Button icon={Plus} onClick={() => setEditing(null)}>
              New category
            </Button>
          )
        }
      />

      {categories.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((cat) => (
            <Card key={cat.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg text-sm font-semibold text-white"
                      style={{ backgroundColor: cat.color }}
                    >
                      {cat.idPrefix.slice(0, 2)}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold text-ink-900">{cat.name}</h2>
                      <p className="truncate text-xs text-ink-500">{cat.code}</p>
                    </div>
                  </div>
                  {!cat.isActive && (
                    <Badge tone="neutral" size="sm">
                      Inactive
                    </Badge>
                  )}
                </div>

                {cat.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-ink-600">{cat.description}</p>
                )}

                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-200 pt-4">
                  <div>
                    <dt className="inline-flex items-center gap-1 text-[0.6875rem] tracking-wide text-ink-500 uppercase">
                      <Hash size={11} aria-hidden="true" /> ID format
                    </dt>
                    <dd className="mt-0.5 font-mono text-sm font-semibold text-ink-900">
                      {cat.idPrefix}
                      {'1'.padStart(cat.idPadding, '0')}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline-flex items-center gap-1 text-[0.6875rem] tracking-wide text-ink-500 uppercase">
                      <Users size={11} aria-hidden="true" /> Users
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-ink-900 tabular">
                      {formatNumber(cat.userCount || 0)}
                    </dd>
                  </div>
                </dl>

                {canManage && (
                  <div className="mt-4 flex gap-2">
                    <Button variant="secondary" size="sm" icon={Pencil} onClick={() => openEdit(cat)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      onClick={() => setDeleting(cat)}
                      className="text-danger-600 hover:bg-danger-50"
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={Tags}
            title="No categories yet"
            description="Create one for each kind of person you print for — Students, Teachers, Staff. Each category issues its own ID series, like STU00001."
            action={
              canManage && (
                <Button icon={Plus} onClick={() => setEditing(null)}>
                  Create your first category
                </Button>
              )
            }
          />
        </Card>
      )}

      <CategoryForm
        open={editing !== undefined}
        category={editing}
        onClose={() => setEditing(undefined)}
        onSaved={load}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={busy}
        title={`Delete "${deleting?.name}"?`}
        message="This cannot be undone. If any users are assigned to this category, the deletion will be blocked — deactivate it instead."
        confirmLabel="Delete category"
      />
    </>
  );
}
