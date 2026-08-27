import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, Printer, Search, User, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import useServerTable from '../../hooks/useServerTable.js';
import { jobsApi } from '../../api/jobsApi.js';
import { JOB_STATUS_ORDER } from '../../utils/statusMeta.js';
import { formatDate, formatNumber, humanise, initials } from '../../utils/format.js';

const FILTER_KEYS = ['status', 'group', 'priority', 'assignedTo', 'organization'];

const PRIORITY_TONE = { normal: 'neutral', high: 'warning', urgent: 'danger' };

const GROUPS = [
  { key: '', label: 'All jobs' },
  { key: 'open', label: 'Open' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'overdue', label: 'Overdue' },
];

export default function JobsListPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [operators, setOperators] = useState([]);

  const table = useServerTable(jobsApi.list, {
    defaultSort: '-priorityRank',
    filterKeys: FILTER_KEYS,
  });

  const loadStats = useCallback(() => {
    jobsApi.stats().then(setStats).catch(() => setStats(null));
  }, []);

  useEffect(() => {
    loadStats();
    jobsApi.operators().then(setOperators).catch(() => {});
  }, [loadStats]);

  const columns = [
    {
      key: 'jobNumber',
      header: 'Job',
      sortable: true,
      render: (row) => (
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-accent-50 text-accent-600">
            <Printer size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-semibold text-ink-900">{row.jobNumber}</p>
            <p className="truncate text-xs text-ink-500">{row.lotNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'organizationName',
      header: 'Client',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-ink-800">{row.organizationName}</p>
          <p className="truncate text-xs text-ink-500">{row.formTitle}</p>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Cards',
      sortable: true,
      align: 'right',
      nowrap: true,
      render: (row) => (
        <span className="font-medium text-ink-800 tabular">{formatNumber(row.quantity)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Stage',
      sortable: true,
      nowrap: true,
      render: (row) => <StatusBadge status={row.status} kind="job" size="sm" />,
    },
    {
      key: 'priorityRank',
      header: 'Priority',
      sortable: true,
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
      key: 'assignedTo',
      header: 'Operator',
      nowrap: true,
      render: (row) =>
        row.assignedTo ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="grid size-6 place-items-center rounded-full bg-ink-100 text-[0.5625rem] font-semibold text-ink-600">
              {initials(row.assignedTo.name)}
            </span>
            <span className="text-ink-700">{row.assignedTo.name}</span>
          </span>
        ) : (
          <Badge tone="warning" size="sm">
            Unassigned
          </Badge>
        ),
    },
    {
      key: 'receivedAt',
      header: 'Received',
      sortable: true,
      nowrap: true,
      render: (row) => {
        const overdue =
          row.dueDate &&
          new Date(row.dueDate) < new Date() &&
          !['completed', 'cancelled'].includes(row.status);
        return (
          <span className={overdue ? 'text-danger-600' : 'text-ink-500'}>
            {formatDate(row.receivedAt)}
            {overdue && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-xs font-medium">
                <Clock size={11} aria-hidden="true" /> overdue
              </span>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Print jobs"
        subtitle="Every batch received from clients, across the whole platform."
        breadcrumbs={[{ label: 'MR Print World', to: '/super-admin' }, { label: 'Print jobs' }]}
      />

      {stats && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Open jobs"
            value={stats.open}
            icon={Printer}
            tone="brand"
            emphasis
            hint={`${formatNumber(stats.cardsInProduction)} card${stats.cardsInProduction === 1 ? '' : 's'} in production`}
          />
          <StatCard
            label="Needs attention"
            value={stats.received + stats.dataIssues + stats.awaitingApproval}
            icon={AlertTriangle}
            tone={stats.dataIssues > 0 ? 'danger' : 'warning'}
            emphasis
            hint={`${stats.dataIssues} data issue${stats.dataIssues === 1 ? '' : 's'}`}
          />
          <StatCard
            label="Unassigned"
            value={stats.unassigned}
            icon={User}
            tone={stats.unassigned > 0 ? 'warning' : 'success'}
            emphasis
            hint="No operator yet"
          />
          <StatCard
            label="Overdue"
            value={stats.overdue}
            icon={Clock}
            tone={stats.overdue > 0 ? 'danger' : 'success'}
            emphasis
            hint={stats.overdue > 0 ? 'Past the required date' : 'All on time'}
          />
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-ink-200 p-4">
          <Input
            containerClassName="min-w-[14rem] flex-1"
            icon={Search}
            placeholder="Search job, lot, client or form..."
            value={table.searchInput}
            onChange={(e) => table.setSearchInput(e.target.value)}
            aria-label="Search jobs"
          />
          <Select
            containerClassName="w-44"
            placeholder="All jobs"
            options={GROUPS.filter((g) => g.key).map((g) => ({ value: g.key, label: g.label }))}
            value={table.filters.group || ''}
            onChange={(e) => table.setFilter('group', e.target.value)}
            aria-label="Filter by group"
          />
          <Select
            containerClassName="w-48"
            placeholder="All stages"
            options={JOB_STATUS_ORDER.map((s) => ({ value: s, label: humanise(s) }))}
            value={table.filters.status || ''}
            onChange={(e) => table.setFilter('status', e.target.value)}
            aria-label="Filter by stage"
          />
          <Select
            containerClassName="w-44"
            placeholder="Any operator"
            options={operators.map((o) => ({ value: o.id, label: o.name }))}
            value={table.filters.assignedTo || ''}
            onChange={(e) => table.setFilter('assignedTo', e.target.value)}
            aria-label="Filter by operator"
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
          onRowClick={(row) => navigate(`/super-admin/jobs/${row.id}`)}
          emptyIcon={Printer}
          emptyTitle="No print jobs"
          emptyDescription="Jobs appear here automatically when a client sends a printing lot."
        />
      </Card>
    </>
  );
}
