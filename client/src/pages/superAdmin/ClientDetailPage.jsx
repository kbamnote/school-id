import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Ban,
  Building2,
  CheckCircle2,
  Archive,
  MapPin,
  ShieldCheck,
  UserCog,
  Users,
  FileText,
  Mail,
  Phone,
  Pencil,
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
import { clientsApi, plansApi } from '../../api/superAdmin.js';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate, formatDateTime, formatLimit, formatNumber, initials, usagePercent } from '../../utils/format.js';
import { ROLE_LABELS } from '../../utils/rbac.js';

/** Usage against a plan limit. Unlimited shows no bar - there is nothing to fill. */
function UsageBar({ label, used, limit, icon: Icon }) {
  const percent = usagePercent(used, limit);
  const critical = percent !== null && percent >= 90;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600">
          {Icon && <Icon size={13} className="text-ink-400" aria-hidden="true" />}
          {label}
        </span>
        <span className="text-xs text-ink-500 tabular">
          <span className="font-semibold text-ink-800">{formatNumber(used)}</span>
          {' / '}
          {formatLimit(limit)}
        </span>
      </div>
      {percent !== null && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-200">
          <div
            className={critical ? 'h-full rounded-full bg-danger-500' : 'h-full rounded-full bg-brand-500'}
            style={{ width: `${Math.max(percent, 2)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [statusTarget, setStatusTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);

  const [planOpen, setPlanOpen] = useState(false);
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await clientsApi.get(id);
      setData(res);
      setPlanId(res.organization.subscription?.plan || '');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (planOpen && !plans.length) plansApi.list().then(setPlans).catch(() => setPlans([]));
  }, [planOpen, plans.length]);

  const changeStatus = async () => {
    setActing(true);
    try {
      await clientsApi.setStatus(id, statusTarget, reason);
      toast.success(`Client ${statusTarget}.`);
      setStatusTarget(null);
      setReason('');
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setActing(false);
    }
  };

  const changePlan = async () => {
    setActing(true);
    try {
      await clientsApi.setSubscription(id, { planId });
      toast.success('Subscription updated.');
      setPlanOpen(false);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setActing(false);
    }
  };

  if (loading) return <PageLoader label="Loading client..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const { organization: org, usage, admins } = data;
  const sub = org.subscription;

  const STATUS_COPY = {
    suspended: {
      title: 'Suspend this client?',
      message: `Every user at ${org.name} will be signed out immediately and blocked from signing in again until the account is reactivated. Their data is preserved.`,
      confirmLabel: 'Suspend client',
      variant: 'danger',
    },
    archived: {
      title: 'Archive this client?',
      message: `${org.name} will be closed and hidden from the active client list. Nobody will be able to sign in. Their data is preserved and the client can be reactivated later.`,
      confirmLabel: 'Archive client',
      variant: 'danger',
    },
    active: {
      title: 'Reactivate this client?',
      message: `Users at ${org.name} will be able to sign in again immediately.`,
      confirmLabel: 'Reactivate',
      variant: 'success',
    },
  };

  return (
    <>
      <PageHeader
        title={org.name}
        subtitle={`${org.type.charAt(0).toUpperCase()}${org.type.slice(1)} · added ${formatDate(org.createdAt)}`}
        breadcrumbs={[
          { label: 'MR Print World', to: '/super-admin' },
          { label: 'Clients', to: '/super-admin/clients' },
          { label: org.name },
        ]}
        actions={
          <>
            {org.status === 'active' ? (
              <>
                <Button variant="secondary" icon={Ban} onClick={() => setStatusTarget('suspended')}>
                  Suspend
                </Button>
                <Button variant="secondary" icon={Archive} onClick={() => setStatusTarget('archived')}>
                  Archive
                </Button>
              </>
            ) : (
              <Button variant="success" icon={CheckCircle2} onClick={() => setStatusTarget('active')}>
                Reactivate
              </Button>
            )}
            <Link to={`/super-admin/clients/${id}/edit`}>
              <Button icon={Pencil}>Edit</Button>
            </Link>
          </>
        }
      />

      {org.status !== 'active' && (
        <div className="mb-5 flex items-start gap-2.5 rounded-card border border-danger-200 bg-danger-50 p-4">
          <Ban size={17} className="mt-0.5 shrink-0 text-danger-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-danger-800">
              This client is {org.status}. Nobody at {org.name} can sign in.
            </p>
            {org.suspensionReason && (
              <p className="mt-1 text-sm text-danger-700">Reason: {org.suspensionReason}</p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Organisation" icon={Building2} />
            <CardBody>
              <div className="flex items-center gap-4">
                {org.logo?.url ? (
                  <img
                    src={org.logo.url}
                    alt=""
                    className="size-14 rounded-xl object-cover ring-1 ring-ink-200"
                  />
                ) : (
                  <span className="grid size-14 place-items-center rounded-xl bg-brand-50 text-base font-semibold text-brand-600">
                    {initials(org.name)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{org.name}</p>
                  <p className="truncate text-sm text-ink-500">{org.slug}</p>
                  <StatusBadge status={org.status} kind="generic" size="sm" />
                </div>
              </div>

              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                {[
                  ['Type', org.type, null],
                  ['GST number', org.gstNumber || '—', null],
                  ['Contact person', org.contact?.personName || '—', null],
                  ['Designation', org.contact?.designation || '—', null],
                  ['Email', org.contact?.email || '—', Mail],
                  ['Phone', org.contact?.phone || '—', Phone],
                ].map(([label, value, Icon]) => (
                  <div key={label}>
                    <dt className="text-[0.6875rem] font-medium tracking-wide text-ink-500 uppercase">
                      {label}
                    </dt>
                    <dd className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-ink-800 capitalize">
                      {Icon && <Icon size={13} className="text-ink-400" aria-hidden="true" />}
                      <span className="break-all normal-case">{value}</span>
                    </dd>
                  </div>
                ))}
              </dl>

              {(org.address?.line1 || org.address?.city) && (
                <div className="mt-5 flex items-start gap-2 rounded-lg bg-ink-50 p-3.5">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
                  <p className="text-sm leading-relaxed text-ink-600">
                    {[org.address.line1, org.address.line2, org.address.city, org.address.state, org.address.pincode]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Administrators"
              subtitle="Staff accounts that can manage this organisation."
              icon={UserCog}
            />
            {admins.length ? (
              <ul className="divide-y divide-ink-200">
                {admins.map((admin) => (
                  <li key={admin.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
                      {initials(admin.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">{admin.name}</p>
                      <p className="truncate text-xs text-ink-500">{admin.email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {admin.mustChangePassword && (
                        <Badge tone="warning" size="sm">
                          Password not set
                        </Badge>
                      )}
                      <Badge tone="brand" size="sm">
                        {ROLE_LABELS[admin.role]}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <CardBody>
                <p className="text-sm text-ink-500">
                  No administrator has been created for this client yet — nobody can sign in.
                </p>
              </CardBody>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Subscription"
              icon={ShieldCheck}
              action={
                <Button variant="secondary" size="sm" onClick={() => setPlanOpen(true)}>
                  Change
                </Button>
              }
            />
            <CardBody className="space-y-4">
              {sub ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{sub.planName}</p>
                      <p className="text-xs text-ink-500">
                        {sub.expiresAt ? `Expires ${formatDate(sub.expiresAt)}` : 'No expiry'}
                      </p>
                    </div>
                    <StatusBadge status={sub.status} kind="generic" size="sm" />
                  </div>

                  {sub.overrideNote && (
                    <p className="rounded-lg bg-warning-50 p-2.5 text-xs text-warning-800">
                      {sub.overrideNote}
                    </p>
                  )}

                  <div className="space-y-3.5 border-t border-ink-200 pt-4">
                    <UsageBar label="End users" used={usage.userCount} limit={sub.limits.maxUsers} icon={Users} />
                    <UsageBar label="Administrators" used={usage.adminCount} limit={sub.limits.maxAdmins} icon={UserCog} />
                    <UsageBar label="Categories" used={usage.categoryCount} limit={sub.limits.maxCategories} icon={FileText} />
                  </div>

                  <div className="border-t border-ink-200 pt-4">
                    <p className="mb-2 text-[0.6875rem] font-medium tracking-wide text-ink-500 uppercase">
                      Features
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(sub.features || {}).map(([key, on]) => (
                        <Badge key={key} tone={on ? 'success' : 'neutral'} size="sm">
                          {key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink-500">No subscription assigned.</p>
              )}
            </CardBody>
          </Card>

          {org.internalNotes && (
            <Card>
              <CardHeader title="Internal notes" subtitle="Visible only to MR Print World." />
              <CardBody>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink-600">
                  {org.internalNotes}
                </p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Record" />
            <CardBody className="space-y-2.5 text-sm">
              {[
                ['Created', formatDateTime(org.createdAt)],
                ['Last updated', formatDateTime(org.updatedAt)],
                ...(org.suspendedAt ? [['Suspended', formatDateTime(org.suspendedAt)]] : []),
                ...(org.archivedAt ? [['Archived', formatDateTime(org.archivedAt)]] : []),
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
        open={Boolean(statusTarget)}
        onClose={() => {
          setStatusTarget(null);
          setReason('');
        }}
        onConfirm={changeStatus}
        loading={acting}
        {...(STATUS_COPY[statusTarget] || {})}
      >
        {statusTarget !== 'active' && (
          <Input
            containerClassName="mt-4"
            label="Reason (recorded in the audit log)"
            placeholder="e.g. Non-payment of invoice INV-2026-114"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </ConfirmDialog>

      <Modal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        title="Change subscription plan"
        description="Limits are copied from the plan at the moment you apply it."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPlanOpen(false)} disabled={acting}>
              Cancel
            </Button>
            <Button onClick={changePlan} loading={acting} disabled={!planId}>
              Apply plan
            </Button>
          </>
        }
      >
        <Select
          label="Plan"
          options={plans.map((p) => ({ value: p.id, label: p.name }))}
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          placeholder={plans.length ? 'Select a plan' : 'Loading...'}
        />
        {(() => {
          const chosen = plans.find((p) => p.id === planId);
          if (!chosen) return null;
          return (
            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-ink-50 p-3.5">
              {[
                ['Users', chosen.limits.maxUsers],
                ['Forms', chosen.limits.maxForms],
                ['Admins', chosen.limits.maxAdmins],
                ['Categories', chosen.limits.maxCategories],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[0.6875rem] tracking-wide text-ink-500 uppercase">{label}</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ink-900 tabular">
                    {formatLimit(value)}
                  </dd>
                </div>
              ))}
            </dl>
          );
        })()}
      </Modal>
    </>
  );
}
