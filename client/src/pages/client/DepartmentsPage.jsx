import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ChevronRight, Network, Pencil, Plus, Trash2, Users } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { departmentsApi } from '../../api/clientApi.js';
import { errorMessage, fieldErrors } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSIONS } from '../../utils/rbac.js';

const KINDS = [
  { value: 'department', label: 'Department' },
  { value: 'class', label: 'Class' },
  { value: 'section', label: 'Section' },
  { value: 'batch', label: 'Batch' },
  { value: 'group', label: 'Group' },
  { value: 'shift', label: 'Shift' },
  { value: 'branch', label: 'Branch' },
];

const KIND_TONE = {
  class: 'brand',
  section: 'info',
  department: 'neutral',
  batch: 'accent',
  group: 'neutral',
  shift: 'warning',
  branch: 'success',
};

/** Flattens the tree into indented options, excluding a node and its subtree. */
function flattenForParent(nodes, excludeId, depth = 0, acc = []) {
  for (const node of nodes) {
    if (node.id === excludeId) continue; // cannot parent under itself or its children
    acc.push({ value: node.id, label: `${'— '.repeat(depth)}${node.name}` });
    if (node.children?.length) flattenForParent(node.children, excludeId, depth + 1, acc);
  }
  return acc;
}

function DepartmentRow({ node, depth, onEdit, onDelete, onAddChild, canManage }) {
  return (
    <>
      <div
        className="flex items-center gap-3 border-b border-ink-200 px-4 py-3 transition last:border-0 hover:bg-ink-50/60"
        style={{ paddingLeft: `${1 + depth * 1.5}rem` }}
      >
        {depth > 0 && (
          <ChevronRight size={13} className="shrink-0 text-ink-300" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-900">{node.name}</p>
          {node.code && <p className="truncate text-xs text-ink-500">{node.code}</p>}
        </div>
        <Badge tone={KIND_TONE[node.kind] || 'neutral'} size="sm">
          {node.kind}
        </Badge>
        <span className="inline-flex w-16 items-center justify-end gap-1 text-xs text-ink-500 tabular">
          <Users size={12} aria-hidden="true" />
          {node.userCount || 0}
        </span>
        {canManage && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => onAddChild(node)}
              className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
              aria-label={`Add a group under ${node.name}`}
              title="Add a group beneath this"
            >
              <Plus size={15} />
            </button>
            <button
              type="button"
              onClick={() => onEdit(node)}
              className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
              aria-label={`Edit ${node.name}`}
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(node)}
              className="rounded-md p-1.5 text-ink-400 transition hover:bg-danger-50 hover:text-danger-600"
              aria-label={`Delete ${node.name}`}
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>
      {node.children?.map((child) => (
        <DepartmentRow
          key={child.id}
          node={child}
          depth={depth + 1}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
          canManage={canManage}
        />
      ))}
    </>
  );
}

function DepartmentForm({ open, onClose, department, parentId, tree, onSaved }) {
  const toast = useToast();
  const [formError, setFormError] = useState('');
  const editing = Boolean(department?.id);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm();

  useEffect(() => {
    reset({
      name: department?.name || '',
      code: department?.code || '',
      kind: department?.kind || (parentId ? 'section' : 'department'),
      parent: department?.parent?.id || department?.parent || parentId || '',
      headName: department?.headName || '',
    });
    setFormError('');
  }, [department, parentId, reset, open]);

  const parentOptions = flattenForParent(tree, department?.id);

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const payload = { ...values, parent: values.parent || null };
      if (editing) await departmentsApi.update(department.id, payload);
      else await departmentsApi.create(payload);
      toast.success(editing ? 'Updated.' : `"${values.name}" created.`);
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
      title={editing ? `Edit ${department.name}` : 'New group'}
      description="Classes, sections, departments, batches — however your organisation is structured."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} loading={isSubmitting}>
            {editing ? 'Save changes' : 'Create'}
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
          label="Name"
          placeholder="Class 10"
          required
          error={errors.name?.message}
          {...register('name', { required: 'Enter a name' })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Type" options={KINDS} {...register('kind')} />
          <Input label="Code" placeholder="Optional" {...register('code')} />
        </div>
        <Select
          label="Sits under"
          placeholder="Top level"
          options={parentOptions}
          hint="Leave blank for a top-level group."
          {...register('parent')}
        />
        <Input label="Head / in charge" placeholder="Optional" {...register('headName')} />
      </form>
    </Modal>
  );
}

export default function DepartmentsPage() {
  const toast = useToast();
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.DEPARTMENTS_MANAGE);

  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(undefined);
  const [parentId, setParentId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTree(await departmentsApi.tree());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await departmentsApi.remove(deleting.id);
      toast.success(`"${deleting.name}" deleted.`);
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoader label="Loading structure..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Departments & groups"
        subtitle="How your organisation is structured. Classes, sections, departments, batches — nest them as you need."
        breadcrumbs={[{ label: 'Dashboard', to: '/client' }, { label: 'Departments' }]}
        actions={
          canManage && (
            <Button
              icon={Plus}
              onClick={() => {
                setParentId(null);
                setEditing(null);
              }}
            >
              New group
            </Button>
          )
        }
      />

      <Card>
        {tree.length ? (
          <div>
            {tree.map((node) => (
              <DepartmentRow
                key={node.id}
                node={node}
                depth={0}
                canManage={canManage}
                onEdit={(n) => {
                  setParentId(null);
                  setEditing(n);
                }}
                onAddChild={(n) => {
                  setParentId(n.id);
                  setEditing(null);
                }}
                onDelete={setDeleting}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Network}
            title="No groups yet"
            description="Add the classes, sections or departments your people belong to. You can nest them — a Section under a Class, for example."
            action={
              canManage && (
                <Button
                  icon={Plus}
                  onClick={() => {
                    setParentId(null);
                    setEditing(null);
                  }}
                >
                  Create your first group
                </Button>
              )
            }
          />
        )}
      </Card>

      <DepartmentForm
        open={editing !== undefined}
        department={editing}
        parentId={parentId}
        tree={tree}
        onClose={() => {
          setEditing(undefined);
          setParentId(null);
        }}
        onSaved={load}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={busy}
        title={`Delete "${deleting?.name}"?`}
        message="This cannot be undone. The deletion will be blocked if any users or nested groups still belong to it."
        confirmLabel="Delete"
      />
    </>
  );
}
