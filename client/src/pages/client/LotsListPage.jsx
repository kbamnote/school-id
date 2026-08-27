import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layers, Plus, Search, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import useServerTable from '../../hooks/useServerTable.js';
import { lotsApi } from '../../api/lotsApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSIONS } from '../../utils/rbac.js';
import { formatDate, formatNumber } from '../../utils/format.js';

const FILTER_KEYS = ['status', 'form'];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready to send' },
  { value: 'submitted', label: 'Sent for printing' },
  { value: 'in_production', label: 'In production' },
  { value: 'returned', label: 'Returned' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_TONE = { normal: 'neutral', high: 'warning', urgent: 'danger' };

export default function LotsListPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [stats, setStats] = useState(null);

  const table = useServerTable(lotsApi.list, { defaultSort: '-createdAt', filterKeys: FILTER_KEYS });

  const loadStats = useCallback(() => {
    lotsApi.stats().then(setStats).catch(() => setStats(null));
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const columns = [
    {
      key: 'lotNumber',
      header: 'Lot',
      sortable: true,
      render: (row) => (
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Layers size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-semibold text-ink-900">{row.lotNumber}</p>
            <p className="truncate text-xs text-ink-500">{row.name || row.formTitle}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'formTitle',
      header: 'Form',
      nowrap: true,
      render: (row) => <span className="text-ink-600">{row.formTitle}</span>,
    },
    {
      key: 'recordCount',
      header: 'Records',
      sortable: true,
      align: 'right',
      nowrap: true,
      render: (row) => (
        <span className="font-medium text-ink-800 tabular">{formatNumber(row.recordCount)}</span>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      nowrap: true,
      render: (row) =>
        row.priority === 'normal' ? (
          <span className="text-xs text-ink-400">—</span>
        ) : (
          <Badge tone={PRIORITY_TONE[row.priority]} size="sm">
            {row.priority}
          </Badge>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      nowrap: true,
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          <StatusBadge status={row.status} kind="lot" size="sm" />
          {row.revision > 1 && (
            <Badge tone="neutral" size="sm">
              rev {row.revision}
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      nowrap: true,
      render: (row) => <span className="text-ink-500">{formatDate(row.createdAt)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Printing lots"
        subtitle="Batches of approved records handed to MR Print World."
        breadcrumbs={[{ label: 'Dashboard', to: '/client' }, { label: 'Printing lots' }]}
        actions={
          can(PERMISSIONS.LOTS_CREATE) && (
            <Link to="/client/lots/new">
              <Button icon={Plus}>Create lot</Button>
            </Link>
          )
        }
      />

      {stats && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Ready to send"
            value={stats.draft + stats.ready}
            icon={Layers}
            tone="brand"
            hint="Still editable by you"
          />
          <StatCard
            label="With MR Print World"
            value={stats.submitted + stats.inProduction}
            icon={Layers}
            tone="accent"
            hint="Locked for production"
          />
          <StatCard
            label="Returned"
            value={stats.returned}
            icon={Layers}
            tone={stats.returned > 0 ? 'danger' : 'neutral'}
            hint={stats.returned > 0 ? 'Needs your attention' : 'None'}
          />
          <StatCard
            label="Approved & waiting"
            value={stats.eligibleRecords}
            icon={Layers}
            tone="success"
            hint="Records not yet in a lot"
            to="/client/lots/new"
          />
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-ink-200 p-4">
          <Input
            containerClassName="min-w-[14rem] flex-1"
            icon={Search}
            placeholder="Search lot number or name..."
            value={table.searchInput}
            onChange={(e) => table.setSearchInput(e.target.value)}
            aria-label="Search lots"
          />
          <Select
            containerClassName="w-48"
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
          onRowClick={(row) => navigate(`/client/lots/${row.id}`)}
          emptyIcon={Layers}
          emptyTitle="No printing lots yet"
          emptyDescription="A lot groups approved records into one batch. Nothing reaches MR Print World until you send it."
          emptyAction={
            can(PERMISSIONS.LOTS_CREATE) && (
              <Link to="/client/lots/new">
                <Button icon={Plus}>Create your first lot</Button>
              </Link>
            )
          }
        />
      </Card>
    </>
  );
}
