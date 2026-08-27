import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, Plus, Search, Upload, Users, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import useServerTable from '../../hooks/useServerTable.js';
import { categoriesApi, departmentsApi, usersApi } from '../../api/clientApi.js';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSIONS, ROLE_LABELS } from '../../utils/rbac.js';
import { formatDate, formatRelative, initials } from '../../utils/format.js';

const FILTER_KEYS = ['status', 'orgCategory', 'department', 'group'];

export default function UsersListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();

  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [stats, setStats] = useState(null);
  const [exporting, setExporting] = useState(false);

  const table = useServerTable(usersApi.list, { defaultSort: '-createdAt', filterKeys: FILTER_KEYS });

  useEffect(() => {
    // Filter options and chips are supplementary - a failure here must not
    // stop the table itself from rendering.
    categoriesApi.list({ limit: 100 }).then((r) => setCategories(r.data)).catch(() => {});
    departmentsApi.list({ limit: 200 }).then((r) => setDepartments(r.data)).catch(() => {});
    usersApi.stats().then(setStats).catch(() => {});
  }, []);

  const doExport = useCallback(
    async (format) => {
      setExporting(true);
      try {
        await usersApi.export({ ...table.filters, search: table.search, format });
        toast.success('Export downloaded.');
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setExporting(false);
      }
    },
    [table.filters, table.search, toast]
  );

  const columns = [
    {
      key: 'loginId',
      header: 'User ID',
      sortable: true,
      nowrap: true,
      width: '9rem',
      render: (row) =>
        row.loginId ? (
          <span className="font-mono text-xs font-semibold text-brand-700">{row.loginId}</span>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          {row.avatar?.url ? (
            <img src={row.avatar.url} alt="" className="size-8 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-100 text-[0.625rem] font-semibold text-ink-600">
              {initials(row.name)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{row.name}</p>
            {row.email && <p className="truncate text-xs text-ink-500">{row.email}</p>}
          </div>
        </div>
      ),
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
          <Badge tone="brand" size="sm">
            {ROLE_LABELS[row.role] || row.role}
          </Badge>
        ),
    },
    {
      key: 'department',
      header: 'Department',
      nowrap: true,
      render: (row) =>
        row.department ? (
          <span className="text-ink-600">{row.department.name}</span>
        ) : (
          <span className="text-ink-400">—</span>
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
      key: 'lastLoginAt',
      header: 'Last sign-in',
      sortable: true,
      nowrap: true,
      render: (row) =>
        row.lastLoginAt ? (
          <span className="text-ink-500">{formatRelative(row.lastLoginAt)}</span>
        ) : row.mustChangePassword ? (
          <Badge tone="warning" size="sm">
            Never signed in
          </Badge>
        ) : (
          <span className="text-ink-400">—</span>
        ),
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
        title="Users"
        subtitle="Everyone in your organisation who can be printed for."
        breadcrumbs={[{ label: 'Dashboard', to: '/client' }, { label: 'Users' }]}
        actions={
          <>
            {can(PERMISSIONS.USERS_EXPORT) && (
              <Button
                variant="secondary"
                icon={Download}
                loading={exporting}
                onClick={() => doExport('xlsx')}
              >
                Export
              </Button>
            )}
            {can(PERMISSIONS.USERS_IMPORT) && (
              <Link to="/client/users/import">
                <Button variant="secondary" icon={Upload}>
                  Import
                </Button>
              </Link>
            )}
            {can(PERMISSIONS.USERS_CREATE) && (
              <Link to="/client/users/new">
                <Button icon={Plus}>Add user</Button>
              </Link>
            )}
          </>
        }
      />

      {stats && (
        <div className="mb-5 flex flex-wrap gap-2">
          {[
            { label: 'All', filter: {}, count: stats.total },
            { label: 'End users', filter: { group: 'endUsers' }, count: stats.endUsers },
            { label: 'Staff', filter: { group: 'staff' }, count: stats.staff },
            { label: 'Inactive', filter: { status: 'inactive' }, count: stats.inactive },
          ].map((chip) => {
            const key = Object.keys(chip.filter)[0];
            const active = key
              ? table.filters[key] === chip.filter[key]
              : !table.filters.group && !table.filters.status;
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => {
                  // Chips are mutually exclusive views, so clear the other one.
                  table.setFilter('group', chip.filter.group || '');
                  table.setFilter('status', chip.filter.status || '');
                }}
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
            containerClassName="min-w-[14rem] flex-1"
            icon={Search}
            placeholder="Search name, ID, email or phone..."
            value={table.searchInput}
            onChange={(e) => table.setSearchInput(e.target.value)}
            aria-label="Search users"
          />
          <Select
            containerClassName="w-44"
            placeholder="All categories"
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            value={table.filters.orgCategory || ''}
            onChange={(e) => table.setFilter('orgCategory', e.target.value)}
            aria-label="Filter by category"
          />
          <Select
            containerClassName="w-44"
            placeholder="All departments"
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
            value={table.filters.department || ''}
            onChange={(e) => table.setFilter('department', e.target.value)}
            aria-label="Filter by department"
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
          onRowClick={(row) => navigate(`/client/users/${row.id}`)}
          emptyIcon={table.hasActiveFilters ? Search : Users}
          emptyTitle={table.hasActiveFilters ? 'No users match those filters' : 'No users yet'}
          emptyDescription={
            table.hasActiveFilters
              ? 'Try a different search, or clear the filters.'
              : 'Add people one at a time, or import a spreadsheet to create hundreds at once.'
          }
          emptyAction={
            table.hasActiveFilters ? (
              <Button variant="secondary" icon={X} onClick={table.clearFilters}>
                Clear filters
              </Button>
            ) : (
              can(PERMISSIONS.USERS_IMPORT) && (
                <Link to="/client/users/import">
                  <Button icon={Upload}>Import users</Button>
                </Link>
              )
            )
          }
        />
      </Card>
    </>
  );
}
