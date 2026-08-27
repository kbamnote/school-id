import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  ClipboardCheck,
  FileText,
  Layers,
  Network,
  Plus,
  Tags,
  Upload,
  Users,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { StatCardSkeleton, Skeleton } from '../../components/ui/Skeleton.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { clientDashboardApi } from '../../api/clientApi.js';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSIONS } from '../../utils/rbac.js';
import { formatNumber, formatRelative, formatLimit, usagePercent } from '../../utils/format.js';

const ACTIVITY_TONE = { critical: 'text-danger-500', warning: 'text-warning-500', info: 'text-ink-300' };

/**
 * Guides a brand-new organisation through setup in order.
 * Disappears entirely once the basics exist, so it never nags an established client.
 */
function SetupChecklist({ data }) {
  const steps = [
    {
      done: data.structure.categories > 0,
      label: 'Create your categories',
      hint: 'Students, Teachers, Staff — each issues its own ID series.',
      to: '/client/categories',
      icon: Tags,
    },
    {
      done: data.structure.departments > 0,
      label: 'Add departments or classes',
      hint: 'Optional, but makes filtering and printing far easier.',
      to: '/client/departments',
      icon: Network,
    },
    {
      done: data.users.endUsers > 0,
      label: 'Add your people',
      hint: 'Import a spreadsheet to create hundreds at once.',
      to: '/client/users/import',
      icon: Users,
    },
    {
      done: data.forms.total > 0,
      label: 'Build a form',
      hint: 'Decide what details each person needs to submit.',
      to: '/client/forms/new',
      icon: FileText,
    },
  ];

  const remaining = steps.filter((s) => !s.done);
  if (!remaining.length) return null;

  const next = remaining[0];

  return (
    <Card className="mb-5 border-brand-200 bg-brand-50/40">
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[0.9375rem] font-semibold text-ink-900">Finish setting up</h2>
            <p className="mt-1 text-sm text-ink-600">
              {steps.length - remaining.length} of {steps.length} done. Next: {next.hint}
            </p>
          </div>
          <Link to={next.to}>
            <Button size="sm" icon={next.icon}>
              {next.label}
            </Button>
          </Link>
        </div>

        <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <li key={step.label}>
              <Link
                to={step.to}
                className={
                  step.done
                    ? 'flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-success-700 ring-1 ring-success-100'
                    : 'flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-ink-600 ring-1 ring-ink-200 transition hover:ring-brand-300'
                }
              >
                <span
                  className={
                    step.done
                      ? 'grid size-4 shrink-0 place-items-center rounded-full bg-success-500 text-[0.5625rem] text-white'
                      : 'size-4 shrink-0 rounded-full border-2 border-ink-300'
                  }
                  aria-hidden="true"
                >
                  {step.done ? '✓' : ''}
                </span>
                <span className="truncate">{step.label}</span>
              </Link>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await clientDashboardApi.summary());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      </>
    );
  }

  const userLimit = data?.limits?.maxUsers;
  const percent = data ? usagePercent(data.users.endUsers, userLimit) : null;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        subtitle={user.organization?.name}
        actions={
          can(PERMISSIONS.USERS_IMPORT) && (
            <Link to="/client/users/import">
              <Button variant="secondary" icon={Upload}>
                Import users
              </Button>
            </Link>
          )
        }
      />

      {!loading && data && <SetupChecklist data={data} />}

      {loading ? (
        <StatCardSkeleton count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total users"
            value={formatNumber(data.users.total)}
            icon={Users}
            tone="brand"
            emphasis
            hint={
              userLimit && userLimit !== -1
                ? `${data.users.endUsers} of ${formatLimit(userLimit)} on your plan`
                : `${data.users.endUsers} end users`
            }
            to="/client/users"
          />
          <StatCard
            label="Categories"
            value={data.structure.categories}
            icon={Tags}
            tone="info"
            emphasis
            hint={`${data.structure.departments} departments`}
            to="/client/categories"
          />
          <StatCard
            label="Pending review"
            value={data.submissions.pendingReview}
            icon={ClipboardCheck}
            tone="warning"
            emphasis
            hint="Submissions awaiting your check"
            to="/client/submissions/pending"
          />
          <StatCard
            label="Printing lots"
            value={data.printing.lots}
            icon={Layers}
            tone="accent"
            emphasis
            hint={`${data.printing.activeJobs} active jobs`}
            to="/client/lots"
          />
        </div>
      )}

      {percent !== null && percent >= 80 && (
        <div className="mt-4 rounded-card border border-warning-200 bg-warning-50 p-4">
          <p className="text-sm font-medium text-warning-800">
            You have used {percent}% of your plan&rsquo;s user allowance.
          </p>
          <p className="mt-1 text-sm text-warning-700">
            {formatNumber(data.users.endUsers)} of {formatLimit(userLimit)} users. Contact MR Print
            World to raise this limit.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader
            title="Your categories"
            icon={Tags}
            action={
              <Link
                to="/client/categories"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 transition hover:text-brand-700"
              >
                Manage <ArrowRight size={14} aria-hidden="true" />
              </Link>
            }
          />
          {loading ? (
            <CardBody className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </CardBody>
          ) : data.categories.length ? (
            <ul className="divide-y divide-ink-200">
              {data.categories.map((cat) => (
                <li key={cat._id} className="flex items-center gap-3 px-5 py-3.5">
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-xs font-semibold text-white"
                    style={{ backgroundColor: cat.color || '#1d45f5' }}
                  >
                    {cat.idPrefix?.slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{cat.name}</p>
                    <p className="truncate font-mono text-xs text-ink-500">{cat.idPrefix}00001</p>
                  </div>
                  <span className="text-sm font-semibold text-ink-700 tabular">
                    {formatNumber(cat.userCount || 0)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={Tags}
              title="No categories yet"
              description="Categories decide the ID each person is issued."
              action={
                <Link to="/client/categories">
                  <Button size="sm" icon={Plus}>
                    Add a category
                  </Button>
                </Link>
              }
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Recent activity" icon={Activity} />
          {loading ? (
            <CardBody className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </CardBody>
          ) : data.recentActivity.length ? (
            <ul className="max-h-[24rem] divide-y divide-ink-200 overflow-y-auto">
              {data.recentActivity.map((entry) => (
                <li key={entry._id} className="flex items-start gap-3 px-5 py-3">
                  <span
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full bg-current ${
                      ACTIVITY_TONE[entry.severity] || ACTIVITY_TONE.info
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-ink-700">{entry.description}</p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {entry.actorName} · {formatRelative(entry.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={Activity} title="Nothing has happened yet" />
          )}
        </Card>
      </div>
    </>
  );
}
