import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, FileText, MoreVertical, Plus, Search, Trash2, Users, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import useServerTable from '../../hooks/useServerTable.js';
import { formsApi } from '../../api/formsApi.js';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSIONS } from '../../utils/rbac.js';
import { formatDate, formatNumber } from '../../utils/format.js';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'closed', label: 'Closed' },
];

/** Module-level so its identity is stable across renders. */
const FILTER_KEYS = ['status', 'productType'];

const PRODUCT_LABELS = {
  id_card: 'ID Card',
  certificate: 'Certificate',
  badge: 'Badge',
  visiting_card: 'Visiting Card',
  letter: 'Letter',
  other: 'Other',
};

export default function FormsListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();

  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const table = useServerTable(formsApi.list, {
    defaultSort: '-updatedAt',
    filterKeys: FILTER_KEYS,
  });

  const doDuplicate = async (form) => {
    try {
      const copy = await formsApi.duplicate(form.id);
      toast.success(`Duplicated as "${copy.title}".`);
      navigate(`/client/forms/${copy.id}/edit`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await formsApi.remove(deleting.id);
      toast.success(`"${deleting.title}" deleted.`);
      setDeleting(null);
      table.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      key: 'title',
      header: 'Form',
      sortable: true,
      render: (row) => (
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <FileText size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{row.title}</p>
            <p className="truncate text-xs text-ink-500">
              {PRODUCT_LABELS[row.productType] || row.productType}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      nowrap: true,
      render: (row) => <StatusBadge status={row.status} kind="generic" size="sm" />,
    },
    {
      key: 'assigned',
      header: 'Assigned to',
      align: 'right',
      nowrap: true,
      render: (row) => (
        <span className="inline-flex items-center gap-1.5 text-ink-600 tabular">
          <Users size={13} className="text-ink-400" aria-hidden="true" />
          {formatNumber(row.stats?.assignedCount || 0)}
        </span>
      ),
    },
    {
      key: 'stats.submissionCount',
      header: 'Submissions',
      sortable: true,
      align: 'right',
      nowrap: true,
      render: (row) => (
        <span className="font-medium text-ink-800 tabular">
          {formatNumber(row.stats?.submissionCount || 0)}
        </span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      sortable: true,
      nowrap: true,
      render: (row) => <span className="text-ink-500">{formatDate(row.updatedAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      nowrap: true,
      render: (row) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {can(PERMISSIONS.FORMS_CREATE) && (
            <button
              type="button"
              onClick={() => doDuplicate(row)}
              className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
              aria-label={`Duplicate ${row.title}`}
              title="Duplicate"
            >
              <Copy size={15} />
            </button>
          )}
          {can(PERMISSIONS.FORMS_DELETE) && (
            <button
              type="button"
              onClick={() => setDeleting(row)}
              className="rounded-md p-1.5 text-ink-400 transition hover:bg-danger-50 hover:text-danger-600"
              aria-label={`Delete ${row.title}`}
              title="Delete"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Digital forms"
        subtitle="Decide what each person needs to submit before you can print for them."
        breadcrumbs={[{ label: 'Dashboard', to: '/client' }, { label: 'Forms' }]}
        actions={
          can(PERMISSIONS.FORMS_CREATE) && (
            <Link to="/client/forms/new">
              <Button icon={Plus}>New form</Button>
            </Link>
          )
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-ink-200 p-4">
          <Input
            containerClassName="min-w-[15rem] flex-1"
            icon={Search}
            placeholder="Search forms..."
            value={table.searchInput}
            onChange={(e) => table.setSearchInput(e.target.value)}
            aria-label="Search forms"
          />
          <Select
            containerClassName="w-44"
            placeholder="All statuses"
            options={STATUS_OPTIONS}
            value={table.filters.status || ''}
            onChange={(e) => table.setFilter('status', e.target.value)}
            aria-label="Filter by status"
          />
          {table.hasActiveFilters && (
            <Button variant="ghost" icon={X} onClick={table.clearFilters}>
              Clear
            </Button>
          )}
        </div>

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
          onRowClick={(row) => navigate(`/client/forms/${row.id}`)}
          emptyIcon={FileText}
          emptyTitle={table.hasActiveFilters ? 'No forms match' : 'No forms yet'}
          emptyDescription={
            table.hasActiveFilters
              ? 'Try a different search or clear the filters.'
              : 'A form defines what details each person submits — name, photo, blood group, and anything else you need printed.'
          }
          emptyAction={
            can(PERMISSIONS.FORMS_CREATE) && !table.hasActiveFilters ? (
              <Link to="/client/forms/new">
                <Button icon={Plus}>Build your first form</Button>
              </Link>
            ) : null
          }
        />
      </Card>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        loading={busy}
        title={`Delete "${deleting?.title}"?`}
        message="This cannot be undone. If the form already has submissions, the deletion will be blocked — close it instead so the collected data is preserved."
        confirmLabel="Delete form"
      />
    </>
  );
}
