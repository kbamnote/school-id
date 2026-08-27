import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Lock,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { portalApi } from '../../api/portalApi.js';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext.jsx';
import { submissionMeta } from '../../utils/statusMeta.js';
import { formatDate } from '../../utils/format.js';

/** What the user should actually do next, per form. */
function actionFor(item) {
  if (!item.isOpen && item.status === 'not_started') {
    return { label: 'Closed', disabled: true };
  }
  switch (item.status) {
    case 'not_started':
      return { label: 'Start', disabled: false };
    case 'draft':
      return { label: 'Continue', disabled: false };
    case 'correction_required':
      return { label: 'Fix and resubmit', disabled: false };
    default:
      return { label: 'View', disabled: false };
  }
}

export default function HomePage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await portalApi.myForms());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoader label="Loading your forms..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const { forms, summary } = data;
  const needsAttention = forms.filter(
    (f) => f.status === 'correction_required' || (f.isOpen && ['not_started', 'draft'].includes(f.status))
  );

  return (
    <>
      <PageHeader
        title={`Hello, ${user.name.split(' ')[0]}`}
        subtitle={
          summary.needsCorrection > 0
            ? 'Some of your details need correcting.'
            : needsAttention.length > 0
              ? 'You have forms waiting to be filled in.'
              : 'Everything is up to date.'
        }
      />

      {summary.needsCorrection > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-card border border-warning-200 bg-warning-50 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-warning-900">
              {summary.needsCorrection} of your submissions needs changes
            </p>
            <p className="mt-0.5 text-sm text-warning-800">
              Your organisation has asked you to correct something. Open the form below to see what.
            </p>
          </div>
        </div>
      )}

      {forms.length ? (
        <div className="space-y-3">
          {forms.map((item) => {
            const meta = submissionMeta(item.status);
            const action = actionFor(item);

            return (
              <Card key={item.form.id}>
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                        <FileText size={18} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-[0.9375rem] font-semibold text-ink-900">
                          {item.form.title}
                        </h2>
                        {item.form.description && (
                          <p className="mt-0.5 line-clamp-2 text-sm text-ink-600">
                            {item.form.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <StatusBadge status={item.status} kind="submission" size="sm" />
                          {item.dueDate && (
                            <span className="inline-flex items-center gap-1 text-xs text-ink-500">
                              <Clock size={11} aria-hidden="true" />
                              Due {formatDate(item.dueDate)}
                            </span>
                          )}
                          {!item.isOpen && (
                            <span className="inline-flex items-center gap-1 text-xs text-ink-500">
                              <Lock size={11} aria-hidden="true" />
                              Closed
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
                          {meta.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      {['draft', 'not_started'].includes(item.status) && item.completeness > 0 && (
                        <div className="hidden w-24 sm:block">
                          <div className="h-1.5 overflow-hidden rounded-full bg-ink-200">
                            <div
                              className="h-full rounded-full bg-brand-500"
                              style={{ width: `${item.completeness}%` }}
                            />
                          </div>
                          <p className="mt-1 text-right text-[0.6875rem] text-ink-500">
                            {item.completeness}%
                          </p>
                        </div>
                      )}
                      <Link to={`/portal/forms/${item.form.id}`}>
                        <Button
                          size="sm"
                          variant={item.status === 'correction_required' ? 'accent' : 'primary'}
                          iconRight={ArrowRight}
                          disabled={action.disabled}
                        >
                          {action.label}
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {item.correctionNote && (
                    <p className="mt-3 rounded-lg bg-warning-50 p-2.5 text-sm leading-relaxed text-warning-800">
                      <span className="font-medium">What to fix: </span>
                      {item.correctionNote}
                    </p>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={CheckCircle2}
            title="No forms assigned to you yet"
            description="When your organisation needs details from you, the form will appear here."
          />
        </Card>
      )}
    </>
  );
}
