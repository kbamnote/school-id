import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Plus, Search, X, Users } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import useServerTable from '../../hooks/useServerTable.js';
import { clientsApi } from '../../api/superAdmin.js';
import { formatDate, formatNumber, initials } from '../../utils/format.js';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'archived', label: 'Archived' },
];

const TYPE_OPTIONS = [
  { value: 'school', label: 'School' },
  { value: 'college', label: 'College' },
  { value: 'university', label: 'University' },
  { value: 'company', label: 'Company' },
  { value: 'government', label: 'Government' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'ngo', label: 'NGO' },
  { value: 'other', label: 'Other' },
];

const FILTER_KEYS = ['status', 'type'];

export default function ClientsListPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  const table = useServerTable(clientsApi.list, {
    defaultSort: '-createdAt',
    filterKeys: FILTER_KEYS,
  });

  // Loaded once for the summary chips - the table itself carries its own count.
  const loadStats = useCallback(async () => {
    try {
      setStats(await clientsApi.stats());
    } catch {
      setStats(null); // the chips are supplementary; never block the table on them
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const columns = [
    {
      key: 'name',
      header: 'Organisation',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.logo?.url ? (
            <img
              src={row.logo.url}
              alt=""
              className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-ink-200"
            />
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-600">
              {initials(row.name)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{row.name}</p>
            <p className="truncate text-xs text-ink-500">{row.slug}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      nowrap: true,
      render: (row) => <span className="capitalize text-ink-600">{row.type}</span>,
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (row) =>
        row.contact?.personName ? (
          <div className="min-w-0">
            <p className="truncate text-ink-700">{row.contact.personName}</p>
            <p className="truncate text-xs text-ink-500">
              {row.contact.phone || row.contact.email || '—'}
            </p>
          </div>
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
    {
      key: 'subscription',
      header: 'Plan',
      nowrap: true,
      render: (row) =>
        row.subscription ? (
          <Badge tone="brand" size="sm">
            {row.subscription.planName}
          </Badge>
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
    {
      key: 'stats.userCount',
      header: 'Users',
      sortable: true,
      align: 'right',
      nowrap: true,
      render: (row) => <span className="tabular">{formatNumber(row.stats?.userCount || 0)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      nowrap: true,
      render: (row) => <StatusBadge status={row.status} kind="generic" size="sm" />,
    },
    {
      key: 'createdAt',
      header: 'Added',
      sortable: true,
      nowrap: true,
      render: (row) => <span className="text-ink-500">{formatDate(row.createdAt)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Every organisation onboarded to the platform."
        breadcrumbs={[{ label: 'MR Print World', to: '/super-admin' }, { label: 'Clients' }]}
        actions={
          <Link to="/super-admin/clients/new">
            <Button icon={Plus}>New client</Button>
          </Link>
        }
      />

      {stats && (
        <div className="mb-5 flex flex-wrap gap-2">
          {[
            { label: 'All', value: '', count: stats.total },
            { label: 'Active', value: 'active', count: stats.active },
            { label: 'Suspended', value: 'suspended', count: stats.suspended },
            { label: 'Archived', value: 'archived', count: stats.archived },
          ].map((chip) => {
            const active = (table.filters.status || '') === chip.value;
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => table.setFilter('status', chip.value)}
                className={
                  active
                    ? 'inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-medium text-white'
                    : 'inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink-600 ring-1 ring-ink-200 transition hover:bg-ink-50'
                }
              >
                {chip.label}
                <span className={active ? 'text-white/70' : 'text-ink-400'}>{chip.count}</span>
              </button>
            );
          })}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-ink-200 p-4">
          <Input
            containerClassName="min-w-[15rem] flex-1"
            icon={Search}
            placeholder="Search name, contact, phone or GST..."
            value={table.searchInput}
            onChange={(e) => table.setSearchInput(e.target.value)}
            aria-label="Search clients"
          />
          <Select
            containerClassName="w-44"
            placeholder="All types"
            options={TYPE_OPTIONS}
            value={table.filters.type || ''}
            onChange={(e) => table.setFilter('type', e.target.value)}
            aria-label="Filter by type"
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
          onRowClick={(row) => navigate(`/super-admin/clients/${row.id}`)}
          emptyIcon={table.hasActiveFilters ? Search : Building2}
          emptyTitle={table.hasActiveFilters ? 'No clients match those filters' : 'No clients yet'}
          emptyDescription={
            table.hasActiveFilters
              ? 'Try a different search term, or clear the filters to see everything.'
              : 'Onboard your first organisation to start collecting print data.'
          }
          emptyAction={
            table.hasActiveFilters ? (
              <Button variant="secondary" icon={X} onClick={table.clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Link to="/super-admin/clients/new">
                <Button icon={Plus}>Add your first client</Button>
              </Link>
            )
          }
        />
      </Card>
    </>
  );
}
