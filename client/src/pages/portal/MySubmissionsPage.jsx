import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Inbox } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { portalApi } from '../../api/portalApi.js';
import { errorMessage } from '../../api/client';
import { submissionMeta } from '../../utils/statusMeta.js';
import { formatDateTime } from '../../utils/format.js';

/**
 * The user's own history.
 *
 * Deliberately shows the full pipeline status - including "Sent for Printing"
 * and "Completed" - so someone waiting on a card can see where it actually is
 * instead of having to ask the office.
 */
export default function MySubmissionsPage() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSubmissions(await portalApi.mySubmissions());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoader label="Loading your submissions..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="My submissions"
        subtitle="Everything you have sent, and where it has reached."
        breadcrumbs={[{ label: 'My forms', to: '/portal' }, { label: 'Submissions' }]}
      />

      {submissions.length ? (
        <Card>
          <ul className="divide-y divide-ink-200">
            {submissions.map((s) => {
              const meta = submissionMeta(s.status);
              return (
                <li key={s.id}>
                  <Link
                    to={`/portal/forms/${s.form?.id || s.form}`}
                    className="flex items-start gap-3 px-5 py-4 transition hover:bg-ink-50"
                  >
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                      <FileText size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">
                        {s.form?.title || 'Form'}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                        {meta.description}
                      </p>
                      <p className="mt-1 text-xs text-ink-400">
                        {s.submittedAt
                          ? `Submitted ${formatDateTime(s.submittedAt)}`
                          : `Last edited ${formatDateTime(s.updatedAt)}`}
                        {s.submissionCount > 1 ? ` · attempt ${s.submissionCount}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={s.status} kind="submission" size="sm" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={Inbox}
            title="You have not submitted anything yet"
            description="Once you fill in a form, it will appear here so you can track its progress."
          />
        </Card>
      )}
    </>
  );
}
