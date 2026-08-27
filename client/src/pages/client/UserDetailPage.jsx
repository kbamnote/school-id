import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Ban, CheckCircle2, KeyRound, Save, Trash2, User as UserIcon } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardHeader, CardBody, CardFooter } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import CredentialsDialog from '../../components/CredentialsDialog.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import { categoriesApi, departmentsApi, usersApi } from '../../api/clientApi.js';
import { errorMessage, fieldErrors } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSIONS, ROLE_LABELS, ROLES } from '../../utils/rbac.js';
import { formatDateTime, formatRelative, initials } from '../../utils/format.js';

export default function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can, user: me } = useAuth();

  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'delete' | 'reset' | 'status'
  const [credentials, setCredentials] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await usersApi.get(id);
      setUser(data);
      reset({
        name: data.name,
        email: data.email || '',
        phone: data.phone || '',
        externalId: data.externalId || '',
        orgCategory: data.orgCategory?.id || '',
        department: data.department?.id || '',
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id, reset]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    categoriesApi.list({ limit: 100 }).then((r) => setCategories(r.data)).catch(() => {});
    departmentsApi.list({ limit: 200 }).then((r) => setDepartments(r.data)).catch(() => {});
  }, []);

  const onSubmit = async (values) => {
    try {
      const payload = { ...values, orgCategory: values.orgCategory || null, department: values.department || null };
      await usersApi.update(id, payload);
      toast.success('User updated.');
      await load();
    } catch (err) {
      const fields = fieldErrors(err);
      Object.entries(fields).forEach(([f, m]) => setFieldError(f, { message: m }));
      if (!Object.keys(fields).length) toast.error(errorMessage(err));
    }
  };

  const doReset = async () => {
    setBusy(true);
    try {
      const creds = await usersApi.resetPassword(id);
      setCredentials([{ name: user.name, ...creds }]);
      setConfirm(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const doStatus = async () => {
    setBusy(true);
    try {
      const next = user.status === 'active' ? 'inactive' : 'active';
      await usersApi.setStatus(id, next);
      toast.success(`Account ${next === 'active' ? 'reactivated' : 'deactivated'}.`);
      setConfirm(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await usersApi.remove(id);
      toast.success(`${user.name} deleted.`);
      navigate('/client/users');
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  if (loading) return <PageLoader label="Loading user..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const isEndUser = user.role === ROLES.END_USER;
  const isSelf = String(user.id) === String(me.id);
  const canEdit = can(PERMISSIONS.USERS_EDIT);

  return (
    <>
      <PageHeader
        title={user.name}
        subtitle={user.loginId ? `User ID ${user.loginId}` : ROLE_LABELS[user.role]}
        breadcrumbs={[
          { label: 'Dashboard', to: '/client' },
          { label: 'Users', to: '/client/users' },
          { label: user.name },
        ]}
        actions={
          <>
            {can(PERMISSIONS.USERS_CREDENTIALS) && (
              <Button variant="secondary" icon={KeyRound} onClick={() => setConfirm('reset')}>
                Reset password
              </Button>
            )}
            {canEdit && !isSelf && (
              <Button
                variant="secondary"
                icon={user.status === 'active' ? Ban : CheckCircle2}
                onClick={() => setConfirm('status')}
              >
                {user.status === 'active' ? 'Deactivate' : 'Reactivate'}
              </Button>
            )}
            {can(PERMISSIONS.USERS_DELETE) && !isSelf && user.role !== ROLES.CLIENT_OWNER && (
              <Button
                variant="ghost"
                icon={Trash2}
                className="text-danger-600 hover:bg-danger-50"
                onClick={() => setConfirm('delete')}
              >
                Delete
              </Button>
            )}
          </>
        }
      />

      <div className="grid max-w-5xl gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Details" icon={UserIcon} />
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full name"
                required
                disabled={!canEdit}
                containerClassName="sm:col-span-2"
                error={errors.name?.message}
                {...register('name', { required: 'Enter the name' })}
              />
              <Input
                label="Email"
                type="email"
                disabled={!canEdit}
                error={errors.email?.message}
                {...register('email')}
              />
              <Input label="Phone" disabled={!canEdit} error={errors.phone?.message} {...register('phone')} />

              {isEndUser && (
                <>
                  <Select
                    label="Category"
                    disabled={!canEdit}
                    placeholder="None"
                    options={categories.map((c) => ({ value: c.id, label: c.name }))}
                    {...register('orgCategory')}
                  />
                  <Select
                    label="Department"
                    disabled={!canEdit}
                    placeholder="None"
                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    {...register('department')}
                  />
                  <Input
                    label="External ID"
                    disabled={!canEdit}
                    containerClassName="sm:col-span-2"
                    {...register('externalId')}
                  />
                </>
              )}
            </CardBody>
            {canEdit && (
              <CardFooter>
                <Link to="/client/users">
                  <Button variant="secondary" type="button">
                    Back
                  </Button>
                </Link>
                <Button type="submit" icon={Save} loading={isSubmitting} disabled={!isDirty}>
                  Save changes
                </Button>
              </CardFooter>
            )}
          </form>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardBody>
              <div className="flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-full bg-ink-100 text-sm font-semibold text-ink-600">
                  {initials(user.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{user.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={user.status} kind="generic" size="sm" />
                    <Badge tone="brand" size="sm">
                      {ROLE_LABELS[user.role]}
                    </Badge>
                  </div>
                </div>
              </div>

              {user.loginId && (
                <div className="mt-4 rounded-lg bg-brand-50 p-3">
                  <p className="text-[0.6875rem] font-medium tracking-wide text-brand-700 uppercase">
                    Sign-in ID
                  </p>
                  <p className="mt-0.5 font-mono text-base font-semibold text-brand-800">
                    {user.loginId}
                  </p>
                </div>
              )}

              {user.mustChangePassword && (
                <p className="mt-3 rounded-lg bg-warning-50 p-3 text-xs leading-relaxed text-warning-800">
                  This account still has a temporary password and has not been used yet.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Record" />
            <CardBody className="space-y-2.5 text-sm">
              {[
                ['Last sign-in', user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Never'],
                ['Created', formatDateTime(user.createdAt)],
                ['Added by', user.createdBy?.name || '—'],
                ['Password changed', user.passwordChangedAt ? formatRelative(user.passwordChangedAt) : 'Never'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-ink-500">{label}</span>
                  <span className="text-right text-ink-800">{value}</span>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'reset'}
        onClose={() => setConfirm(null)}
        onConfirm={doReset}
        loading={busy}
        title="Reset this password?"
        message={`A new temporary password will be generated for ${user.name}. They will be signed out of every device immediately and must set a new password at their next sign-in.`}
        confirmLabel="Reset password"
        variant="danger"
      />

      <ConfirmDialog
        open={confirm === 'status'}
        onClose={() => setConfirm(null)}
        onConfirm={doStatus}
        loading={busy}
        title={user.status === 'active' ? 'Deactivate this account?' : 'Reactivate this account?'}
        message={
          user.status === 'active'
            ? `${user.name} will be signed out immediately and will not be able to sign in. Their submissions and data are kept.`
            : `${user.name} will be able to sign in again.`
        }
        confirmLabel={user.status === 'active' ? 'Deactivate' : 'Reactivate'}
        variant={user.status === 'active' ? 'danger' : 'success'}
      />

      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={doDelete}
        loading={busy}
        title={`Delete ${user.name}?`}
        message={`This permanently removes the account${user.loginId ? ` and frees nothing — the ID ${user.loginId} is never reissued` : ''}. Consider deactivating instead, which keeps the record.`}
        confirmLabel="Delete permanently"
      />

      <CredentialsDialog
        open={Boolean(credentials)}
        onClose={() => setCredentials(null)}
        title="Password reset"
        organizationName={me.organization?.name}
        credentials={credentials || []}
      />
    </>
  );
}
