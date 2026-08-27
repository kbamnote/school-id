import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollText, Search, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import Input from '../../components/ui/Input.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import { PageLoader, Spinner } from '../../components/ui/Spinner.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { auditApi, platformAuditApi } from '../../api/activityApi.js';
import { errorMessage } from '../../api/client';
import { formatDateTime, humanise } from '../../utils/format.js';

const SEVERITY_TONE = {
  info: 'neutral',
  warning: 'warning',
  critical: 'danger',
};

/**
 * The audit trail.
 *
 * One component for both portals: the only difference is which endpoint it
 * reads, and MR Print World additionally sees which client each entry belongs
 * to. Filtering happens server-side so a client with a long history is not
 * pulled into the browser to be searched.
 */
export default function AuditLogPage({ platform = false }) {
  const api = platform ? platformAuditApi : auditApi;

  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [vocab, setVocab] = useState({ actions: [], severities: [] });

  const [filters, setFilters] = useState({ action: '', severity: '', search: '' });
  const [searchDraft, setSearchDraft] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .actions()
      .then(setVocab)
      .catch(() => setVocab({ actions: [], severities: [] }));
  }, [api]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const response = await api.list({
          page,
          limit: 25,
          ...(filters.action ? { action: filters.action } : {}),
          ...(filters.severity ? { severity: filters.severity } : {}),
          ...(filters.search ? { search: filters.search } : {}),
        });
        setEntries(response.data || []);
        setTotal(response.meta?.total || 0);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, page, filters]
  );

  useEffect(() => {
    load();
  }, [load]);

  const actionOptions = useMemo(
    () => [
      { value: '', label: 'Every action' },
      ...vocab.actions.map((a) => ({ value: a.value, label: `${humanise(a.group)}: ${a.label}` })),
    ],
    [vocab.actions]
  );

  const applySearch = (e) => {
    e.preventDefault();
    setPage(1);
    setFilters((f) => ({ ...f, search: searchDraft.trim() }));
  };

  const clearFilters = () => {
    setSearchDraft('');
    setPage(1);
    setFilters({ action: '', severity: '', search: '' });
  };

  const hasFilters = filters.action || filters.severity || filters.search;
  const totalPages = Math.ceil(total / 25);

  if (loading) return <PageLoader label="Loading the audit trail..." />;
  if (error) return <ErrorState message={error} onRetry={() => load()} />;

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle={
          platform
            ? 'Every consequential action across the platform.'
            : 'Every consequential action in your organisation.'
        }
        breadcrumbs={[
          ...(platform ? [{ label: 'MR Print World', to: '/super-admin' }] : []),
          { label: 'Audit log' },
        ]}
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <form onSubmit={applySearch} className="flex min-w-[16rem] flex-1 items-end gap-2">
            <Input
              label="Search"
              placeholder="Who or what, e.g. a name or lot number"
              icon={Search}
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              containerClassName="flex-1"
            />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          <Select
            label="Action"
            value={filters.action}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, action: e.target.value }));
            }}
            options={actionOptions}
            containerClassName="w-56"
          />

          <Select
            label="Severity"
            value={filters.severity}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, severity: e.target.value }));
            }}
            options={[
              { value: '', label: 'Any severity' },
              ...(vocab.severities || []).map((s) => ({ value: s, label: humanise(s) })),
            ]}
            containerClassName="w-40"
          />

          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters}>
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </Card>

      {entries.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Nothing recorded yet"
          description={
            hasFilters
              ? 'No entries match these filters.'
              : 'Actions will appear here as people use the system.'
          }
          action={hasFilters ? <Button onClick={clearFilters}>Clear filters</Button> : null}
        />
      ) : (
        <Card>
          <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
            <p className="text-sm text-ink-600">
              <span className="font-semibold text-ink-900">{total.toLocaleString()}</span> entr
              {total === 1 ? 'y' : 'ies'}
            </p>
            {refreshing && <Spinner size={14} />}
          </div>

          <ul className="divide-y divide-ink-200">
            {entries.map((entry) => (
              <li key={entry.id} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-800">{entry.description}</p>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                      <span className="font-mono text-[0.6875rem] text-ink-400">
                        {entry.action}
                      </span>
                      {entry.actorName && <span>by {entry.actorName}</span>}
                      {platform && entry.organizationName && (
                        <span className="text-brand-700">{entry.organizationName}</span>
                      )}
                      {entry.ip && <span className="text-ink-400">{entry.ip}</span>}
                    </div>

                    {/* What actually changed, when the entry recorded it. */}
                    {entry.changes?.length > 0 && (
                      <ul className="mt-2 space-y-0.5 border-l-2 border-ink-200 pl-3">
                        {entry.changes.map((change) => (
                          <li key={change.field} className="text-xs text-ink-600">
                            <span className="font-medium">{humanise(change.field)}</span>:{' '}
                            <span className="text-danger-700 line-through">
                              {String(change.from ?? '-')}
                            </span>{' '}
                            &rarr;{' '}
                            <span className="text-success-700">{String(change.to ?? '-')}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {entry.severity && entry.severity !== 'info' && (
                      <Badge tone={SEVERITY_TONE[entry.severity]} size="sm">
                        {humanise(entry.severity)}
                      </Badge>
                    )}
                    <span className="text-xs whitespace-nowrap text-ink-400">
                      {formatDateTime(entry.createdAt)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-ink-200 px-5 py-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-ink-600">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
