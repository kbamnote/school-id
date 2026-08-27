import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Building2, Clock, Printer } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import BarList from '../../components/ui/BarList.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import { reportsApi } from '../../api/reportsApi.js';
import { errorMessage } from '../../api/client';
import { formatDate, formatNumber } from '../../utils/format.js';

function VolumeChart({ series }) {
  const peak = Math.max(...series.map((s) => s.cards), 1);
  const anyData = series.some((s) => s.cards > 0);

  if (!anyData) {
    return <p className="py-8 text-center text-sm text-ink-500">No printing volume yet.</p>;
  }

  return (
    <div>
      <div className="flex h-44 items-end gap-1.5">
        {series.map((s) => (
          <div key={s.period} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-[0.625rem] font-medium text-ink-600 tabular">
              {s.cards > 0 ? s.cards : ''}
            </span>
            <div
              className={
                s.cards > 0 ? 'w-full rounded-t bg-accent-500' : 'w-full rounded-t bg-ink-100'
              }
              style={{ height: `${Math.max(2, (s.cards / peak) * 100)}%` }}
              title={`${s.label}: ${s.cards} cards across ${s.lots} lots`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {series.map((s) => (
          <span
            key={s.period}
            className="flex-1 text-center text-[0.625rem] whitespace-nowrap text-ink-400"
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await reportsApi.platform());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoader label="Building reports..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const { volume, jobs, clients, turnaround } = data;
  const totalCards = volume.reduce((sum, v) => sum + v.cards, 0);
  const thisMonth = volume[volume.length - 1];

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Production volume and client activity across the platform."
        breadcrumbs={[{ label: 'MR Print World', to: '/super-admin' }, { label: 'Reports' }]}
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Cards this month"
          value={formatNumber(thisMonth?.cards || 0)}
          icon={Printer}
          tone="accent"
          emphasis
          hint={`${thisMonth?.lots || 0} lot${thisMonth?.lots === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Cards in 12 months"
          value={formatNumber(totalCards)}
          icon={BarChart3}
          tone="brand"
          emphasis
        />
        <StatCard
          label="Average turnaround"
          value={turnaround.averageDays !== null ? `${turnaround.averageDays}d` : '—'}
          icon={Clock}
          tone="info"
          emphasis
          hint={
            turnaround.jobs
              ? `across ${turnaround.jobs} completed job${turnaround.jobs === 1 ? '' : 's'}`
              : 'no completed jobs yet'
          }
        />
        <StatCard
          label="Active clients"
          value={clients.length}
          icon={Building2}
          tone="success"
          emphasis
          hint="with at least one job"
        />
      </div>

      <Card>
        <CardHeader
          title="Printing volume"
          subtitle="Cards sent for printing, across every client"
          icon={BarChart3}
        />
        <CardBody>
          <VolumeChart series={volume} />
        </CardBody>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Volume by client" icon={Building2} />
          {clients.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50/70">
                    {['Client', 'Jobs', 'Cards', 'Completed', 'Last job'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-xs font-semibold tracking-wide text-ink-500 uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {clients.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3">
                        <Link
                          to={`/super-admin/clients/${c.id}`}
                          className="font-medium text-ink-900 hover:text-brand-700"
                        >
                          {c.name}
                        </Link>
                        <p className="text-xs text-ink-500 capitalize">{c.type}</p>
                      </td>
                      <td className="px-4 py-3 text-ink-700 tabular">{c.jobs}</td>
                      <td className="px-4 py-3 font-medium text-ink-900 tabular">
                        {formatNumber(c.cards)}
                      </td>
                      <td className="px-4 py-3 text-success-700 tabular">{c.completed}</td>
                      <td className="px-4 py-3 text-ink-500">{formatDate(c.lastJobAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <CardBody>
              <p className="text-sm text-ink-500">No client has sent a job yet.</p>
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="Jobs by stage" icon={Printer} />
          <CardBody>
            {jobs.length ? (
              <ul className="space-y-3">
                {jobs.map((j) => (
                  <li key={j.status} className="flex items-center justify-between gap-3">
                    <StatusBadge status={j.status} kind="job" size="sm" />
                    <span className="text-sm text-ink-600 tabular">
                      <span className="font-semibold text-ink-900">{j.jobs}</span>
                      {' job'}
                      {j.jobs === 1 ? '' : 's'} · {formatNumber(j.cards)} card
                      {j.cards === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">No jobs yet.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
