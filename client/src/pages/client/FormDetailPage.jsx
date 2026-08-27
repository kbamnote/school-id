import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Check,
  Copy,
  Link2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import Input from '../../components/ui/Input.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { formsApi } from '../../api/formsApi.js';
import { categoriesApi, departmentsApi } from '../../api/clientApi.js';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSIONS } from '../../utils/rbac.js';
import { fieldIcon } from '../../utils/fieldIcons.js';
import { formatDate, formatNumber } from '../../utils/format.js';

function AssignDialog({ open, onClose, formId, onAssigned }) {
  const toast = useToast();
  const [scope, setScope] = useState('category');
  const [orgCategory, setOrgCategory] = useState('');
  const [department, setDepartment] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    categoriesApi.list({ limit: 100 }).then((r) => setCategories(r.data)).catch(() => {});
    departmentsApi.list({ limit: 200 }).then((r) => setDepartments(r.data)).catch(() => {});
  }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        scope,
        ...(scope === 'category' ? { orgCategory } : {}),
        ...(scope === 'department' ? { department } : {}),
        ...(dueDate ? { dueDate } : {}),
      };
      const res = await formsApi.assign(formId, payload);
      toast.success(
        `Assigned — ${res.assignedCount} ${res.assignedCount === 1 ? 'person' : 'people'} now see${res.assignedCount === 1 ? 's' : ''} this form.`
      );
      onAssigned();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const ready =
    scope === 'organization' ||
    (scope === 'category' && orgCategory) ||
    (scope === 'department' && department);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign this form"
      description="Rules are evaluated live, so people added later are covered automatically."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!ready}>
            Assign
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Assign to"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          options={[
            { value: 'category', label: 'A category (e.g. all Students)' },
            { value: 'department', label: 'A department or class' },
            { value: 'organization', label: 'Everyone in the organisation' },
          ]}
        />

        {scope === 'category' && (
          <Select
            label="Category"
            required
            placeholder="Select a category"
            value={orgCategory}
            onChange={(e) => setOrgCategory(e.target.value)}
            options={categories.map((c) => ({ value: c.id, label: `${c.name} (${c.userCount || 0})` }))}
          />
        )}

        {scope === 'department' && (
          <Select
            label="Department"
            required
            placeholder="Select a department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
          />
        )}

        <Input
          label="Due date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          hint="Optional. Shown to the user on their form list."
        />
      </div>
    </Modal>
  );
}

export default function FormDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const { can, user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await formsApi.get(id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (status) => {
    setBusy(true);
    try {
      await formsApi.setStatus(id, status);
      toast.success(`Form ${status}.`);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const linkAction = async (action) => {
    setBusy(true);
    try {
      await formsApi.manageLink(id, action);
      toast.success(
        action === 'rotate'
          ? 'New link generated. Every previously shared URL has stopped working.'
          : `Public link ${action}d.`
      );
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const removeAssignment = async () => {
    setBusy(true);
    try {
      await formsApi.unassign(id, removing.id);
      toast.success('Assignment removed.');
      setRemoving(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoader label="Loading form..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const { form, assignments, assignedCount, publicUrl } = data;
  const fullUrl = publicUrl ? `${window.location.origin}${publicUrl}` : null;
  const visibleFields = form.fields.filter((f) => !f.archived).sort((a, b) => a.order - b.order);

  return (
    <>
      <PageHeader
        title={form.title}
        subtitle={form.description || undefined}
        breadcrumbs={[
          { label: 'Dashboard', to: '/client' },
          { label: 'Forms', to: '/client/forms' },
          { label: form.title },
        ]}
        actions={
          <>
            <StatusBadge status={form.status} kind="generic" />
            {can(PERMISSIONS.FORMS_EDIT) && (
              <Link to={`/client/forms/${id}/edit`}>
                <Button variant="secondary" icon={Pencil}>
                  Edit
                </Button>
              </Link>
            )}
            {can(PERMISSIONS.FORMS_PUBLISH) &&
              (form.status === 'published' ? (
                <Button
                  variant="secondary"
                  icon={XCircle}
                  loading={busy}
                  onClick={() => setStatus('closed')}
                >
                  Close form
                </Button>
              ) : (
                <Button icon={Send} loading={busy} onClick={() => setStatus('published')}>
                  {form.status === 'closed' ? 'Reopen' : 'Publish'}
                </Button>
              ))}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Who fills this in"
              subtitle={`${formatNumber(assignedCount)} ${assignedCount === 1 ? 'person' : 'people'} currently assigned`}
              icon={Users}
              action={
                can(PERMISSIONS.FORMS_ASSIGN) && (
                  <Button size="sm" icon={Plus} onClick={() => setAssignOpen(true)}>
                    Assign
                  </Button>
                )
              }
            />
            {assignments.length ? (
              <ul className="divide-y divide-ink-200">
                {assignments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">{a.description}</p>
                      <p className="text-xs text-ink-500">
                        Assigned by {a.assignedBy?.name || 'unknown'} on {formatDate(a.createdAt)}
                        {a.dueDate ? ` · due ${formatDate(a.dueDate)}` : ''}
                      </p>
                    </div>
                    {can(PERMISSIONS.FORMS_ASSIGN) && (
                      <button
                        type="button"
                        onClick={() => setRemoving(a)}
                        className="shrink-0 rounded-md p-1.5 text-ink-400 transition hover:bg-danger-50 hover:text-danger-600"
                        aria-label={`Remove assignment: ${a.description}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={Users}
                title="Nobody is assigned yet"
                description="Assign this form to a category or department so people can fill it in."
                action={
                  can(PERMISSIONS.FORMS_ASSIGN) && (
                    <Button size="sm" icon={Plus} onClick={() => setAssignOpen(true)}>
                      Assign to a group
                    </Button>
                  )
                }
              />
            )}
          </Card>

          <Card>
            <CardHeader
              title="Fields"
              subtitle={`${visibleFields.length} in this form`}
            />
            <ul className="divide-y divide-ink-200">
              {visibleFields.map((field) => {
                const Icon = fieldIcon(
                  { photo: 'camera', signature: 'pen-tool', heading: 'heading' }[field.type]
                );
                return (
                  <li key={field.key} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-ink-100 text-ink-500">
                      <Icon size={13} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink-800">
                        {field.label}
                        {field.required && <span className="ml-1 text-danger-500">*</span>}
                      </p>
                      <p className="truncate font-mono text-[0.6875rem] text-ink-400">{field.key}</p>
                    </div>
                    <Badge tone="neutral" size="sm">
                      {field.type.replace(/_/g, ' ')}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Submissions" />
            <CardBody className="space-y-3">
              {[
                ['Assigned', assignedCount],
                ['Submitted', form.stats.submissionCount],
                ['Approved', form.stats.approvedCount],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-ink-500">{label}</span>
                  <span className="text-sm font-semibold text-ink-900 tabular">
                    {formatNumber(value)}
                  </span>
                </div>
              ))}
              {assignedCount > 0 && (
                <div className="pt-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink-200">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{
                        width: `${Math.min(100, Math.round((form.stats.submissionCount / assignedCount) * 100))}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-ink-500">
                    {Math.round((form.stats.submissionCount / assignedCount) * 100)}% completed
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          {can(PERMISSIONS.FORMS_PUBLISH) && (
            <Card>
              <CardHeader title="Shareable link" icon={Link2} />
              <CardBody className="space-y-3">
                {fullUrl ? (
                  <>
                    <div className="rounded-lg bg-ink-50 p-2.5">
                      <p className="font-mono text-[0.6875rem] leading-relaxed break-all text-ink-700">
                        {fullUrl}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={copied ? Check : Copy}
                        onClick={async () => {
                          await navigator.clipboard.writeText(fullUrl);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                      >
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={RefreshCw}
                        loading={busy}
                        onClick={() => linkAction('rotate')}
                      >
                        New link
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Lock}
                      fullWidth
                      onClick={() => linkAction('disable')}
                    >
                      Disable link
                    </Button>
                    <p className="text-xs leading-relaxed text-ink-500">
                      Anyone with this URL can open the form. Generating a new link immediately
                      stops every copy already shared.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed text-ink-600">
                      Off. People sign in with their user ID to reach this form.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Link2}
                      fullWidth
                      loading={busy}
                      onClick={() => linkAction('enable')}
                    >
                      Enable a public link
                    </Button>
                  </>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <AssignDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        formId={id}
        onAssigned={load}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={removeAssignment}
        loading={busy}
        title="Remove this assignment?"
        message={`${removing?.description} will no longer see this form. Any details they have already submitted are kept.`}
        confirmLabel="Remove"
      />
    </>
  );
}
