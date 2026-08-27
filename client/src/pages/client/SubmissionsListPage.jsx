import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Copy, Inbox, Search, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import useServerTable from '../../hooks/useServerTable.js';
import { submissionsApi } from '../../api/submissionsApi.js';
import { formsApi } from '../../api/formsApi.js';
import { categoriesApi } from '../../api/clientApi.js';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSIONS } from '../../utils/rbac.js';
import { formatRelative, initials } from '../../utils/format.js';

const FILTER_KEYS = ['group', 'status', 'form', 'orgCategory', 'duplicates'];

/** The tab is part of the URL, so a review queue can be bookmarked. */
const GROUPS = {
  all: { label: 'All', group: '' },
  pending: { label: 'Pending review', group: 'pending' },
  corrections: { label: 'Correction required', group: 'corrections' },
  approved: { label: 'Approved', group: 'approved' },
};

export default function SubmissionsListPage() {
  const { group: groupParam } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();

  const [stats, setStats] = useState(null);
  const [forms, setForms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [bulkOpen, setBulkOpen] = useState(null);
  const [bulkNote, setBulkNote] = useState('');
  const [busy, setBusy] = useState(false);

  const table = useServerTable(submissionsApi.list, {
    defaultSort: '-submittedAt',
    filterKeys: FILTER_KEYS,
  });

  const activeGroup = groupParam || 'all';

  const loadStats = useCallback(() => {
    submissionsApi.stats().then(setStats).catch(() => setStats(null));
  }, []);

  useEffect(() => {
    loadStats();
    formsApi.list({ limit: 100 }).then((r) => setForms(r.data)).catch(() => {});
    categoriesApi.list({ limit: 100 }).then((r) => setCategories(r.data)).catch(() => {});
  }, [loadStats]);

  // Keep the table filter aligned with the URL segment.
  useEffect(() => {
    const wanted = GROUPS[activeGroup]?.group || '';
    if ((table.filters.group || '') !== wanted) table.setFilter('group', wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup]);

  // A row that scrolls out of the current page should not stay selected.
  useEffect(() => {
    setSelected(new Set());
  }, [table.page, table.filters.group, table.search]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = async () => {
    setBusy(true);
    try {
      const res = await submissionsApi.bulk([...selected], bulkOpen, bulkNote);
      toast.success(res.message);
      (res.data.failed || []).forEach((f) => toast.warning(`${f.name}: ${f.reason}`));
      setBulkOpen(null);
      setBulkNote('');
      setSelected(new Set());
      table.reload();
      loadStats();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const allOnPage = table.rows.length > 0 && table.rows.every((r) => selected.has(r.id));

  const columns = [
    ...(can(PERMISSIONS.SUBMISSIONS_APPROVE)
      ? [
          {
            key: 'select',
            width: '2.5rem',
            header: (
              <input
                type="checkbox"
                checked={allOnPage}
                onChange={() =>
                  setSelected(allOnPage ? new Set() : new Set(table.rows.map((r) => r.id)))
                }
                className="size-4 rounded border-ink-300 text-brand-600"
                aria-label="Select all on this page"
              />
            ),
            render: (row) => (
              <input
                type="checkbox"
                checked={selected.has(row.id)}
                onChange={() => toggle(row.id)}
                onClick={(e) => e.stopPropagation()}
                className="size-4 rounded border-ink-300 text-brand-600"
                aria-label={`Select ${row.userName}`}
              />
            ),
          },
        ]
      : []),
    {
      key: 'userLoginId',
      header: 'User ID',
      sortable: true,
      nowrap: true,
      render: (row) =>
        row.userLoginId ? (
          <span className="font-mono text-xs font-semibold text-brand-700">{row.userLoginId}</span>
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
    {
      key: 'userName',
      header: 'Name',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          {row.files?.photograph?.url ? (
            <img
              src={row.files.photograph.url}
              alt=""
              className="size-9 shrink-0 rounded object-cover ring-1 ring-ink-200"
            />
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded bg-ink-100 text-[0.625rem] font-semibold text-ink-500">
              {initials(row.userName)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{row.userName}</p>
            {row.duplicateOf && (
              <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-warning-700">
                <Copy size={10} aria-hidden="true" /> possible duplicate
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'form',
      header: 'Form',
      nowrap: true,
      render: (row) => <span className="text-ink-600">{row.form?.title || '—'}</span>,
    },
    {
      key: 'orgCategory',
      header: 'Category',
      nowrap: true,
      render: (row) =>
        row.orgCategory ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: row.orgCategory.color || '#94a3b8' }}
              aria-hidden="true"
            />
            <span className="text-ink-700">{row.orgCategory.name}</span>
          </span>
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      nowrap: true,
      render: (row) => <StatusBadge status={row.status} kind="submission" size="sm" />,
    },
    {
      key: 'submittedAt',
      header: 'Submitted',
      sortable: true,
      nowrap: true,
      render: (row) => (
        <span className="text-ink-500">
          {row.submittedAt ? formatRelative(row.submittedAt) : '—'}
          {row.submissionCount > 1 && (
            <Badge tone="neutral" size="sm" className="ml-1.5">
              attempt {row.submissionCount}
            </Badge>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Submissions"
        subtitle="Check what people have sent before it goes to print."
        breadcrumbs={[{ label: 'Dashboard', to: '/client' }, { label: 'Submissions' }]}
      />

      {stats && (
        <div className="mb-5 flex flex-wrap gap-2">
          {Object.entries(GROUPS).map(([key, cfg]) => {
            const count =
              key === 'all'
                ? stats.total
                : key === 'pending'
                  ? stats.pending
                  : key === 'corrections'
                    ? stats.corrections
                    : stats.approved;
            const active = activeGroup === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => navigate(key === 'all' ? '/client/submissions' : `/client/submissions/${key}`)}
                className={
                  active
                    ? 'inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-medium text-white'
                    : 'inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink-600 ring-1 ring-ink-200 transition hover:bg-ink-50'
                }
              >
                {cfg.label}
                <span className={active ? 'text-white/70' : 'text-ink-400'}>{count}</span>
              </button>
            );
          })}
          {stats.duplicates > 0 && (
            <button
              type="button"
              onClick={() => table.setFilter('duplicates', table.filters.duplicates ? '' : 'true')}
              className={
                table.filters.duplicates
                  ? 'inline-flex items-center gap-1.5 rounded-full bg-warning-500 px-3 py-1.5 text-xs font-medium text-white'
                  : 'inline-flex items-center gap-1.5 rounded-full bg-warning-50 px-3 py-1.5 text-xs font-medium text-warning-700 ring-1 ring-warning-200 transition hover:bg-warning-100'
              }
            >
              <Copy size={11} aria-hidden="true" />
              Possible duplicates
              <span className={table.filters.duplicates ? 'text-white/70' : 'text-warning-500'}>
                {stats.duplicates}
              </span>
            </button>
          )}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-ink-200 p-4">
          <Input
            containerClassName="min-w-[14rem] flex-1"
            icon={Search}
            placeholder="Search name or user ID..."
            value={table.searchInput}
            onChange={(e) => table.setSearchInput(e.target.value)}
            aria-label="Search submissions"
          />
          <Select
            containerClassName="w-48"
            placeholder="All forms"
            options={forms.map((f) => ({ value: f.id, label: f.title }))}
            value={table.filters.form || ''}
            onChange={(e) => table.setFilter('form', e.target.value)}
            aria-label="Filter by form"
          />
          <Select
            containerClassName="w-44"
            placeholder="All categories"
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            value={table.filters.orgCategory || ''}
            onChange={(e) => table.setFilter('orgCategory', e.target.value)}
            aria-label="Filter by category"
          />
          {table.hasActiveFilters && (
            <Button variant="ghost" icon={X} onClick={table.clearFilters}>
              Clear
            </Button>
          )}
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-200 bg-brand-50 px-4 py-2.5">
            <p className="text-sm font-medium text-brand-800">
              {selected.size} selected
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                icon={CheckCircle2}
                variant="success"
                onClick={() => setBulkOpen('approve')}
              >
                Approve
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setBulkOpen('request_correction')}>
                Request correction
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        )}

        <DataTable
          columns={columns}
          rows={table.rows}
          loading={table.loading}
          error={table.error}
          meta={table.meta}
          sort={table.sort}
          onSort={table.toggleSort}
          onPageChange={table.setPage}
          onRetry={table.reload}
          onRowClick={(row) => navigate(`/client/submissions/view/${row.id}`)}
          emptyIcon={Inbox}
          emptyTitle={
            activeGroup === 'pending' ? 'Nothing waiting for review' : 'No submissions here'
          }
          emptyDescription={
            activeGroup === 'pending'
              ? 'Every record has been dealt with. New submissions will appear here.'
              : 'Once people start filling in their forms, their records show up here.'
          }
        />
      </Card>

      <Modal
        open={Boolean(bulkOpen)}
        onClose={() => setBulkOpen(null)}
        title={
          bulkOpen === 'approve'
            ? `Approve ${selected.size} record${selected.size === 1 ? '' : 's'}?`
            : `Request corrections on ${selected.size} record${selected.size === 1 ? '' : 's'}?`
        }
        description={
          bulkOpen === 'approve'
            ? 'Incomplete records are skipped automatically and reported back to you.'
            : 'Everyone selected will be asked to fix and resubmit their details.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkOpen(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={bulkOpen === 'approve' ? 'success' : 'primary'}
              onClick={runBulk}
              loading={busy}
              disabled={bulkOpen === 'request_correction' && !bulkNote.trim()}
            >
              {bulkOpen === 'approve' ? 'Approve all' : 'Send back'}
            </Button>
          </>
        }
      >
        <Input
          label={bulkOpen === 'approve' ? 'Note (optional)' : 'What needs correcting?'}
          required={bulkOpen === 'request_correction'}
          placeholder={
            bulkOpen === 'approve'
              ? 'Recorded against each approval'
              : 'e.g. Your photo does not meet the requirements'
          }
          value={bulkNote}
          onChange={(e) => setBulkNote(e.target.value)}
          hint={
            bulkOpen === 'request_correction'
              ? 'Everyone selected receives this same message.'
              : undefined
          }
        />
      </Modal>
    </>
  );
}
