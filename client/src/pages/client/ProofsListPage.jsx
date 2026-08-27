import { useNavigate } from 'react-router-dom';
import { FileCheck2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import useServerTable from '../../hooks/useServerTable.js';
import { proofsApi } from '../../api/proofsApi.js';
import { PROOF_STATUS_META } from '../../utils/statusMeta.js';
import { formatDateTime } from '../../utils/format.js';

const FILTER_KEYS = ['status'];

export default function ProofsListPage() {
  const navigate = useNavigate();
  const table = useServerTable(proofsApi.list, { filterKeys: FILTER_KEYS });

  const pending = table.rows.filter((p) => p.status === 'pending').length;

  const columns = [
    {
      key: 'jobNumber',
      header: 'Job',
      render: (row) => (
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <FileCheck2 size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-semibold text-ink-900">{row.jobNumber}</p>
            <p className="truncate text-xs text-ink-500">Version {row.version}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'notes',
      header: 'What changed',
      render: (row) =>
        row.notes ? (
          <span className="line-clamp-2 text-ink-600">{row.notes}</span>
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      nowrap: true,
      render: (row) => {
        const meta = PROOF_STATUS_META[row.status] || { label: row.status, tone: 'neutral' };
        return <Badge tone={meta.tone} size="sm">{meta.label}</Badge>;
      },
    },
    {
      key: 'decidedBy',
      header: 'Decided by',
      nowrap: true,
      render: (row) =>
        row.decidedByName ? (
          <div className="min-w-0">
            <p className="truncate text-ink-700">{row.decidedByName}</p>
            <p className="truncate text-xs text-ink-500">{formatDateTime(row.decidedAt)}</p>
          </div>
        ) : (
          <span className="text-ink-400">Awaiting you</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Received',
      nowrap: true,
      render: (row) => <span className="text-ink-500">{formatDateTime(row.createdAt)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Proofs"
        subtitle="Check what MR Print World has produced before it goes to print."
        breadcrumbs={[{ label: 'Dashboard', to: '/client' }, { label: 'Proofs' }]}
      />

      {pending > 0 && (
        <div className="mb-5 rounded-card border border-warning-200 bg-warning-50 p-4">
          <p className="text-sm font-medium text-warning-900">
            {pending} proof{pending === 1 ? '' : 's'} waiting for your approval
          </p>
          <p className="mt-0.5 text-sm text-warning-800">
            Nothing is printed until you sign off, so production is paused until then.
          </p>
        </div>
      )}

      <Card>
        <DataTable
          columns={columns}
          rows={table.rows}
          loading={table.loading}
          error={table.error}
          meta={table.meta}
          onPageChange={table.setPage}
          onRetry={table.reload}
          onRowClick={(row) => navigate(`/client/proofs/${row.id}`)}
          emptyIcon={FileCheck2}
          emptyTitle="No proofs yet"
          emptyDescription="Once MR Print World has laid out your cards, the proof appears here for you to check."
        />
      </Card>
    </>
  );
}
