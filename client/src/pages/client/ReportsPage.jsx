import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Download, FileText, Layers, Network, Tags } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import BarList from '../../components/ui/BarList.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { reportsApi } from '../../api/reportsApi.js';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSIONS } from '../../utils/rbac.js';
import { formatNumber, humanise } from '../../utils/format.js';

/** Monthly volume as a column chart. Bars scale against the busiest month. */
function VolumeChart({ series }) {
  const peak = Math.max(...series.map((s) => s.cards), 1);
  const anyData = series.some((s) => s.cards > 0);

  if (!anyData) {
    return (
      <p className="py-8 text-center text-sm text-ink-500">
        No lots have been sent for printing yet.
      </p>
    );
  }

  return (
    <div>
      <div className="flex h-40 items-end gap-1.5">
        {series.map((s) => (
          <div key={s.period} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-[0.625rem] font-medium text-ink-600 tabular">
              {s.cards > 0 ? s.cards : ''}
            </span>
            <div
              className={
                s.cards > 0
                  ? 'w-full rounded-t bg-brand-500 transition-all'
                  : 'w-full rounded-t bg-ink-100'
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
  const toast = useToast();
  const { can } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await reportsApi.client());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const doExport = async (format) => {
    setExporting(true);
    try {
      await reportsApi.exportSubmissions({ format });
      toast.success('Export downloaded.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <PageLoader label="Building reports..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const { people, forms, volume } = data;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Where your data stands, and how much has been printed."
        breadcrumbs={[{ label: 'Dashboard', to: '/client' }, { label: 'Reports' }]}
        actions={
          can(PERMISSIONS.SUBMISSIONS_EXPORT) && (
            <>
              <Button
                variant="secondary"
                icon={Download}
                loading={exporting}
                onClick={() => doExport('xlsx')}
              >
                Export submissions
              </Button>
              <Button variant="ghost" onClick={() => doExport('csv')} disabled={exporting}>
                as CSV
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="People by category"
            subtitle={`${formatNumber(people.total)} in total`}
            icon={Tags}
          />
          <CardBody>
            <BarList items={people.byCategory} emptyLabel="No people added yet" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="People by department" icon={Network} />
          <CardBody>
            <BarList
              items={people.byDepartment}
              tone="info"
              emptyLabel="Nobody has been assigned to a department"
            />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Form completion"
          subtitle="How many of the people asked have actually submitted"
          icon={FileText}
        />
        {forms.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/70">
                  {['Form', 'Assigned', 'Not started', 'Drafts', 'Pending', 'Corrections', 'Approved', 'Complete'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-xs font-semibold tracking-wide text-ink-500 uppercase"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {forms.map((f) => (
                  <tr key={f.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900">{f.title}</p>
                      <p className="text-xs text-ink-500">{humanise(f.status)}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-700 tabular">{f.assigned}</td>
                    <td className="px-4 py-3 text-ink-500 tabular">{f.notStarted}</td>
                    <td className="px-4 py-3 text-ink-500 tabular">{f.drafts}</td>
                    <td className="px-4 py-3 tabular">
                      <span className={f.pendingReview > 0 ? 'font-medium text-warning-700' : 'text-ink-500'}>
                        {f.pendingReview}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular">
                      <span className={f.corrections > 0 ? 'font-medium text-danger-600' : 'text-ink-500'}>
                        {f.corrections}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-success-700 tabular">{f.approved}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink-200">
                          <div
                            className="h-full rounded-full bg-brand-500"
                            style={{ width: `${f.completionPercent}%` }}
                          />
                        </div>
                        <span className="text-xs text-ink-600 tabular">{f.completionPercent}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            compact
            icon={FileText}
            title="No published forms yet"
            description="Completion figures appear once a form has been published and assigned."
          />
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader
          title="Printing volume"
          subtitle="Cards sent for printing, by month"
          icon={BarChart3}
        />
        <CardBody>
          <VolumeChart series={volume} />
        </CardBody>
      </Card>
    </>
  );
}
