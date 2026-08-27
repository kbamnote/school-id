import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Ban,
  Copy,
  Layers,
  Lock,
  Send,
  Trash2,
  CheckCircle2,
  Download,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import { lotsApi } from '../../api/lotsApi.js';
import { reportsApi } from '../../api/reportsApi.js';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSIONS } from '../../utils/rbac.js';
import { formatDateTime, formatNumber, humanise, initials } from '../../utils/format.js';

const EDITABLE_STATUSES = ['draft', 'ready', 'returned'];

export default function LotDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [dialog, setDialog] = useState(null); // 'send' | 'cancel'
  const [cancelReason, setCancelReason] = useState('');
  const [blockers, setBlockers] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await lotsApi.get(id));
      setSelected(new Set());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const removeSelected = async () => {
    setBusy(true);
    try {
      const res = await lotsApi.removeRecords(id, [...selected]);
      toast.success(res.message);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const send = async (force = false) => {
    setBusy(true);
    try {
      const res = await lotsApi.submit(id, force);
      toast.success(res.message);
      setDialog(null);
      setBlockers(null);
      await load();
    } catch (err) {
      const details = err?.response?.data?.details;
      if (details?.invalid?.length) {
        // Show exactly which records would fail, rather than a bare error.
        setBlockers(details.invalid);
        setDialog(null);
      } else {
        toast.error(errorMessage(err));
        setDialog(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    setBusy(true);
    try {
      const res = await lotsApi.cancel(id, cancelReason);
      toast.success(res.message);
      navigate('/client/lots');
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  if (loading) return <PageLoader label="Loading lot..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const { lot, records } = data;
  const editable = EDITABLE_STATUSES.includes(lot.status);
  const canSend = can(PERMISSIONS.LOTS_SUBMIT);
  const canEdit = can(PERMISSIONS.LOTS_CREATE) && editable;

  return (
    <>
      <PageHeader
        title={lot.lotNumber}
        subtitle={lot.name || lot.formTitle}
        breadcrumbs={[
          { label: 'Dashboard', to: '/client' },
          { label: 'Printing lots', to: '/client/lots' },
          { label: lot.lotNumber },
        ]}
        actions={
          <>
            <StatusBadge status={lot.status} kind="lot" />
            {can(PERMISSIONS.SUBMISSIONS_EXPORT) && lot.recordCount > 0 && (
              <Button
                variant="secondary"
                icon={Download}
                loading={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    await reportsApi.exportLot(id, lot.lotNumber);
                    toast.success('Print package downloaded.');
                  } catch (err) {
                    toast.error(errorMessage(err));
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                Download data
              </Button>
            )}
            {canEdit && lot.status === 'draft' && (
              <Button
                variant="secondary"
                icon={CheckCircle2}
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await lotsApi.markReady(id);
                    toast.success('Marked ready to send.');
                    await load();
                  } catch (err) {
                    toast.error(errorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Mark ready
              </Button>
            )}
            {canSend && editable && (
              <Button icon={Send} onClick={() => setDialog('send')} disabled={!lot.recordCount}>
                Send for printing
              </Button>
            )}
            {canSend && editable && (
              <Button
                variant="ghost"
                icon={Ban}
                className="text-danger-600 hover:bg-danger-50"
                onClick={() => setDialog('cancel')}
              >
                Cancel lot
              </Button>
            )}
          </>
        }
      />

      {!editable && (
        <div className="mb-5 flex items-start gap-2.5 rounded-card border border-accent-200 bg-accent-50 p-4">
          <Lock size={17} className="mt-0.5 shrink-0 text-accent-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-accent-900">
              This lot is with MR Print World
            </p>
            <p className="mt-0.5 text-sm text-accent-800">
              Sent {lot.submittedAt ? formatDateTime(lot.submittedAt) : ''}
              {lot.submittedBy?.name ? ` by ${lot.submittedBy.name}` : ''}. The records inside are
              locked so production and your data cannot drift apart.
            </p>
          </div>
        </div>
      )}

      {lot.status === 'returned' && (
        <div className="mb-5 rounded-card border border-danger-200 bg-danger-50 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-danger-900">
            <AlertTriangle size={16} aria-hidden="true" />
            Returned by MR Print World
          </p>
          {lot.returnReason && <p className="mt-1 text-sm text-danger-800">{lot.returnReason}</p>}
          {lot.returnedRecords?.length > 0 && (
            <ul className="mt-2 space-y-1">
              {lot.returnedRecords.map((r, i) => (
                <li key={i} className="text-sm text-danger-700">
                  {r.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardHeader
            title="Records in this lot"
            subtitle={`${formatNumber(lot.recordCount)} record${lot.recordCount === 1 ? '' : 's'}`}
            icon={Layers}
            action={
              canEdit && (
                <Link to="/client/lots/new">
                  <Button size="sm" variant="secondary">
                    Add more
                  </Button>
                </Link>
              )
            }
          />

          {selected.size > 0 && canEdit && (
            <div className="flex items-center justify-between gap-3 border-b border-brand-200 bg-brand-50 px-5 py-2.5">
              <p className="text-sm font-medium text-brand-800">{selected.size} selected</p>
              <Button
                size="sm"
                variant="secondary"
                icon={Trash2}
                loading={busy}
                onClick={removeSelected}
              >
                Remove from lot
              </Button>
            </div>
          )}

          <ul className="max-h-[30rem] divide-y divide-ink-200 overflow-y-auto">
            {records.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                {canEdit && (
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        return next;
                      })
                    }
                    className="size-4 shrink-0 rounded border-ink-300 text-brand-600"
                    aria-label={`Select ${r.userName}`}
                  />
                )}
                {r.files?.photograph?.url ? (
                  <img
                    src={r.files.photograph.url}
                    alt=""
                    className="size-9 shrink-0 rounded object-cover ring-1 ring-ink-200"
                  />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded bg-ink-100 text-[0.625rem] font-semibold text-ink-500">
                    {initials(r.userName)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/client/submissions/view/${r.id}`}
                    className="truncate text-sm font-medium text-ink-900 hover:text-brand-700"
                  >
                    {r.userName}
                  </Link>
                  <p className="truncate font-mono text-xs text-ink-500">
                    {r.userLoginId}
                    {r.department?.name ? ` · ${r.department.name}` : ''}
                  </p>
                </div>
                {r.duplicateOf && (
                  <Badge tone="warning" size="sm" icon={Copy}>
                    duplicate?
                  </Badge>
                )}
                <StatusBadge status={r.status} kind="submission" size="sm" />
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Lot details" />
            <CardBody className="space-y-2.5 text-sm">
              {[
                ['Form', lot.formTitle],
                ['Records', formatNumber(lot.recordCount)],
                // Only this one needs title-casing; applying `capitalize` to the
                // whole column also mangles timestamps into "06:43 Pm".
                ['Priority', humanise(lot.priority)],
                ['Revision', lot.revision],
                ['Created', formatDateTime(lot.createdAt)],
                ['Created by', lot.createdBy?.name || '—'],
                ...(lot.submittedAt ? [['Sent', formatDateTime(lot.submittedAt)]] : []),
                ...(lot.requiredBy
                  ? [['Required by', formatDateTime(lot.requiredBy)]]
                  : []),
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-ink-500">{label}</span>
                  <span className="text-right text-ink-800">{value}</span>
                </div>
              ))}
            </CardBody>
          </Card>

          {lot.notes && (
            <Card>
              <CardHeader title="Notes" />
              <CardBody>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink-600">
                  {lot.notes}
                </p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {/* --------------------------- send dialog -------------------------- */}
      <ConfirmDialog
        open={dialog === 'send'}
        onClose={() => setDialog(null)}
        onConfirm={() => send(false)}
        loading={busy}
        title={`Send ${lot.lotNumber} to MR Print World?`}
        message={`${lot.recordCount} record${lot.recordCount === 1 ? '' : 's'} will be handed to production and locked. Nobody at your organisation — including you — can edit them afterwards without MR Print World returning the lot.`}
        confirmLabel="Send for printing"
        variant="accent"
      />

      {/* ------------------------ blockers dialog ------------------------- */}
      <Modal
        open={Boolean(blockers)}
        onClose={() => setBlockers(null)}
        title="Some records would fail in production"
        description="These were caught before anything was sent. Fix or remove them, then send again."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBlockers(null)}>
              Close
            </Button>
            <Button variant="danger" loading={busy} onClick={() => send(true)}>
              Send anyway
            </Button>
          </>
        }
      >
        <ul className="space-y-2">
          {(blockers || []).map((r) => (
            <li key={r.id} className="rounded-lg border border-danger-200 bg-danger-50 p-3">
              <p className="text-sm font-medium text-danger-900">
                {r.userLoginId} {r.userName}
              </p>
              <ul className="mt-1 space-y-0.5">
                {r.problems.map((p, i) => (
                  <li key={i} className="text-sm text-danger-700">
                    — {p}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-lg bg-warning-50 p-3 text-xs leading-relaxed text-warning-800">
          Sending anyway is recorded in the audit log against your name. MR Print World will
          almost certainly return the lot, which costs time on both sides.
        </p>
      </Modal>

      {/* -------------------------- cancel dialog ------------------------- */}
      <Modal
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title={`Cancel ${lot.lotNumber}?`}
        description="Every record returns to approved and can be used in a future lot. Nothing is deleted."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>
              Keep the lot
            </Button>
            <Button variant="danger" loading={busy} onClick={doCancel}>
              Cancel lot
            </Button>
          </>
        }
      >
        <Input
          label="Reason"
          placeholder="Recorded in the audit trail"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
        />
      </Modal>
    </>
  );
}
