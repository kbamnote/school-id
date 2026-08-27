import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Users,
  Printer,
  FileCheck2,
  Truck,
  CheckCircle2,
  Plus,
  ArrowRight,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { StatCardSkeleton, Skeleton } from '../../components/ui/Skeleton.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { dashboardApi } from '../../api/superAdmin.js';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatRelative } from '../../utils/format.js';

const ACTIVITY_TONE = { critical: 'text-danger-500', warning: 'text-warning-500', info: 'text-ink-300' };

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await dashboardApi.summary());
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

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        subtitle="Platform overview across every client organisation."
        actions={
          <Link to="/super-admin/clients/new">
            <Button icon={Plus}>New client</Button>
          </Link>
        }
      />

      {loading ? (
        <StatCardSkeleton count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total clients"
            value={data.clients.total}
            icon={Building2}
            tone="brand"
            emphasis
            hint={`${data.clients.newThisMonth} added this month`}
            to="/super-admin/clients"
          />
          <StatCard
            label="Active clients"
            value={data.clients.active}
            icon={CheckCircle2}
            tone="success"
            emphasis
            hint={
              data.clients.suspended
                ? `${data.clients.suspended} suspended`
                : 'None suspended'
            }
            to="/super-admin/clients?status=active"
          />
          <StatCard
            label="Total users"
            value={data.users.total.toLocaleString()}
            icon={Users}
            tone="info"
            emphasis
            hint={`${data.users.clientAdmins} administrators`}
          />
          <StatCard
            label="Jobs in production"
            value={data.production.inPrinting}
            icon={Printer}
            tone="accent"
            emphasis
            hint="Currently printing"
            to="/super-admin/jobs"
          />
        </div>
      )}

      {/* Production pipeline. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Awaiting verification"
          value={loading ? '—' : data.production.lotsAwaitingVerification}
          icon={AlertTriangle}
          tone="warning"
          to="/super-admin/jobs?group=attention"
        />
        <StatCard
          label="Awaiting proof approval"
          value={loading ? '—' : data.production.awaitingProofApproval}
          icon={FileCheck2}
          tone="info"
          to="/super-admin/jobs?status=awaiting_client_approval"
        />
        <StatCard
          label="Ready for dispatch"
          value={loading ? '—' : data.production.readyForDispatch}
          icon={Truck}
          tone="brand"
          to="/super-admin/jobs?status=ready_for_dispatch"
        />
        <StatCard
          label="Completed jobs"
          value={loading ? '—' : data.production.completed}
          icon={CheckCircle2}
          tone="success"
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        {/* Recent clients */}
        <Card>
          <CardHeader
            title="Recently added clients"
            icon={Building2}
            action={
              <Link
                to="/super-admin/clients"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 transition hover:text-brand-700"
              >
                View all <ArrowRight size={14} aria-hidden="true" />
              </Link>
            }
          />
          {loading ? (
            <CardBody className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </CardBody>
          ) : data.recentClients.length ? (
            <ul className="divide-y divide-ink-200">
              {data.recentClients.map((client) => (
                <li key={client.id}>
                  <Link
                    to={`/super-admin/clients/${client.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-ink-50"
                  >
                    {client.logo?.url ? (
                      <img
                        src={client.logo.url}
                        alt=""
                        className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-ink-200"
                      />
                    ) : (
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-600">
                        {client.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">{client.name}</p>
                      <p className="truncate text-xs text-ink-500 capitalize">
                        {client.type} · {client.subscription?.planName || 'No plan'}
                      </p>
                    </div>
                    <StatusBadge status={client.status} kind="generic" size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={Building2}
              title="No clients yet"
              description="Onboard your first organisation to get started."
              action={
                <Link to="/super-admin/clients/new">
                  <Button icon={Plus} size="sm">
                    Add client
                  </Button>
                </Link>
              }
            />
          )}
        </Card>

        {/* Activity feed */}
        <Card>
          <CardHeader title="Recent activity" icon={Activity} />
          {loading ? (
            <CardBody className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </CardBody>
          ) : data.recentActivity.length ? (
            <ul className="max-h-[26rem] divide-y divide-ink-200 overflow-y-auto">
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
            <EmptyState compact icon={Activity} title="No activity recorded yet" />
          )}
        </Card>
      </div>
    </>
  );
}
