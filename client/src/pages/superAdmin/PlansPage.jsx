import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Plus, Star, Users, Building2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { plansApi } from '../../api/superAdmin.js';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { formatLimit } from '../../utils/format.js';

const LIMIT_LABELS = {
  maxUsers: 'End users',
  maxForms: 'Forms',
  maxAdmins: 'Administrators',
  maxCategories: 'Categories',
  maxStorageMb: 'Storage (MB)',
  maxSubmissionsPerMonth: 'Submissions / month',
};

const FEATURE_LABELS = {
  bulkImport: 'Bulk import',
  cardDesigner: 'Card designer',
  proofApproval: 'Proof approval',
  advancedReports: 'Advanced reports',
  apiAccess: 'API access',
};

export default function PlansPage() {
  const toast = useToast();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await plansApi.list(true));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveLimits = async () => {
    setSaving(true);
    try {
      await plansApi.update(editing.id, { limits: editing.limits });
      toast.success(`${editing.name} updated. Existing clients keep their current limits.`);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader label="Loading plans..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Subscription plans"
        subtitle="Templates used when onboarding a client. Editing a plan never changes limits for clients already on it."
        breadcrumbs={[{ label: 'MR Print World', to: '/super-admin' }, { label: 'Plans' }]}
      />

      {plans.length ? (
        <div className="grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className={plan.isDefault ? 'ring-2 ring-brand-500/30' : undefined}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-ink-900">{plan.name}</h2>
                      {plan.isDefault && (
                        <Badge tone="brand" size="sm" icon={Star}>
                          Default
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-ink-500">{plan.code}</p>
                  </div>
                  {!plan.isActive && (
                    <Badge tone="neutral" size="sm">
                      Inactive
                    </Badge>
                  )}
                </div>

                {plan.description && (
                  <p className="mt-3 text-sm leading-relaxed text-ink-600">{plan.description}</p>
                )}

                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-600">
                  <Building2 size={12} aria-hidden="true" />
                  {plan.clientCount} client{plan.clientCount === 1 ? '' : 's'}
                </div>

                <dl className="mt-4 space-y-2 border-t border-ink-200 pt-4">
                  {Object.entries(LIMIT_LABELS).map(([key, label]) => (
                    <div key={key} className="flex justify-between gap-3 text-sm">
                      <dt className="text-ink-500">{label}</dt>
                      <dd className="font-medium text-ink-900 tabular">
                        {formatLimit(plan.limits[key])}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-4 border-t border-ink-200 pt-4">
                  <p className="mb-2 text-[0.6875rem] font-medium tracking-wide text-ink-500 uppercase">
                    Features
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                      <Badge key={key} tone={plan.features[key] ? 'success' : 'neutral'} size="sm">
                        {label}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Button
                  variant="secondary"
                  fullWidth
                  className="mt-5"
                  onClick={() => setEditing({ ...plan, limits: { ...plan.limits } })}
                >
                  Edit limits
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={CreditCard}
            title="No plans defined"
            description="Run the bootstrap script to seed the default Starter, Professional and Enterprise plans."
          />
        </Card>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : ''}
        description="Use -1 for unlimited. Clients already on this plan are unaffected."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveLimits} loading={saving}>
              Save limits
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(LIMIT_LABELS).map(([key, label]) => (
              <Input
                key={key}
                label={label}
                type="number"
                min={-1}
                value={editing.limits[key]}
                onChange={(e) =>
                  setEditing((prev) => ({
                    ...prev,
                    limits: { ...prev.limits, [key]: Number(e.target.value) },
                  }))
                }
              />
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
