import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  History,
  Printer,
  Send,
  Truck,
  Upload,
  Download,
  User,
  FileCheck2,
} from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import { jobsApi } from '../../api/jobsApi.js';
import { platformProofsApi } from '../../api/proofsApi.js';
import { reportsApi } from '../../api/reportsApi.js';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { JOB_STATUS_ORDER, JOB_STAGE_HINTS, jobMeta, PROOF_STATUS_META } from '../../utils/statusMeta.js';
import { formatDateTime, formatNumber, humanise, initials } from '../../utils/format.js';

/** Horizontal progress through the pipeline. */
function Pipeline({ current }) {
  const currentIndex = JOB_STATUS_ORDER.indexOf(current);
  const isSideTrack = currentIndex === -1; // data_issue / cancelled

  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1 py-1">
        {JOB_STATUS_ORDER.map((status, i) => {
          const done = !isSideTrack && i < currentIndex;
          const active = status === current;
          return (
            <li key={status} className="flex items-center gap-1">
              <span
                className={clsx(
                  'rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
                  active && 'bg-brand-600 text-white',
                  done && 'bg-success-50 text-success-700',
                  !active && !done && 'bg-ink-100 text-ink-400'
                )}
              >
                {humanise(status)}
              </span>
              {i < JOB_STATUS_ORDER.length - 1 && (
                <ArrowRight size={11} className="shrink-0 text-ink-300" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function JobDetailPage() {
  const { id } = useParams();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [moveTo, setMoveTo] = useState(null);
  const [note, setNote] = useState('');
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueReason, setIssueReason] = useState('');
  const [issueRecords, setIssueRecords] = useState(new Set());
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatch, setDispatch] = useState({});
  const [proofs, setProofs] = useState([]);
  const [proofOpen, setProofOpen] = useState(false);
  const [proofFile, setProofFile] = useState(null);
  const [proofNotes, setProofNotes] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await jobsApi.get(id);
      setData(res);
      setDispatch(res.job.dispatch || {});
      setIssueRecords(new Set());
      platformProofsApi.forJob(id).then(setProofs).catch(() => setProofs([]));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    jobsApi.operators().then(setOperators).catch(() => {});
  }, []);

  const act = async (fn) => {
    setBusy(true);
    try {
      const res = await fn();
      toast.success(res.message);
      setMoveTo(null);
      setNote('');
      setIssueOpen(false);
      setIssueReason('');
      setDispatchOpen(false);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoader label="Loading job..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const { job, lot, records, allowedTransitions } = data;
  const canRaiseIssue = allowedTransitions.includes('data_issue');

  return (
    <>
      <PageHeader
        title={job.jobNumber}
        subtitle={`${job.organizationName} · ${job.formTitle} · ${formatNumber(job.quantity)} card${job.quantity === 1 ? '' : 's'}`}
        breadcrumbs={[
          { label: 'MR Print World', to: '/super-admin' },
          { label: 'Print jobs', to: '/super-admin/jobs' },
          { label: job.jobNumber },
        ]}
        actions={
          <>
            <StatusBadge status={job.status} kind="job" />
            <Button
              variant="secondary"
              icon={Download}
              loading={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  await reportsApi.exportJob(id, job.jobNumber);
                  toast.success('Print package downloaded.');
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setExporting(false);
                }
              }}
            >
              Download print data
            </Button>
            {job.status === 'ready_for_dispatch' && (
              <Button variant="secondary" icon={Truck} onClick={() => setDispatchOpen(true)}>
                Dispatch details
              </Button>
            )}
            {canRaiseIssue && (
              <Button
                variant="ghost"
                icon={AlertTriangle}
                className="text-danger-600 hover:bg-danger-50"
                onClick={() => setIssueOpen(true)}
              >
                Report data issue
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-5">
        <CardBody>
          <Pipeline current={job.status} />
          <p className="mt-3 text-sm text-ink-600">{JOB_STAGE_HINTS[job.status]}</p>

          {allowedTransitions.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-200 pt-4">
              <span className="text-xs font-medium tracking-wide text-ink-500 uppercase">
                Move to
              </span>
              {allowedTransitions
                .filter((s) => s !== 'data_issue' && s !== 'cancelled')
                .map((status) => (
                  <Button key={status} size="sm" variant="secondary" onClick={() => setMoveTo(status)}>
                    {humanise(status)}
                  </Button>
                ))}
            </div>
          )}
        </CardBody>
      </Card>

      {job.status === 'data_issue' && (
        <div className="mb-5 rounded-card border border-danger-200 bg-danger-50 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-danger-900">
            <AlertTriangle size={16} aria-hidden="true" />
            Returned to {job.organizationName}
          </p>
          <p className="mt-1 text-sm text-danger-800">{job.dataIssue?.reason}</p>
          {job.dataIssue?.records?.length > 0 && (
            <ul className="mt-2 space-y-1">
              {job.dataIssue.records.map((r, i) => (
                <li key={i} className="text-sm text-danger-700">
                  <span className="font-medium">{r.label}</span> — {r.reason}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-danger-700">
            Waiting for the client to correct and re-send. The job reopens automatically when they
            do.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader
            title="Records in this job"
            subtitle={`${records.length} of ${formatNumber(job.quantity)}`}
            icon={Printer}
          />
          <ul className="max-h-[26rem] divide-y divide-ink-200 overflow-y-auto">
            {records.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3">
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
                  <p className="truncate text-sm font-medium text-ink-900">{r.userName}</p>
                  <p className="truncate font-mono text-xs text-ink-500">{r.userLoginId}</p>
                </div>
                <StatusBadge status={r.status} kind="submission" size="sm" />
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Client" icon={Building2} />
            <CardBody className="space-y-2.5 text-sm">
              {[
                ['Organisation', job.organization?.name || job.organizationName],
                ['Contact', job.organization?.contact?.personName || '—'],
                ['Phone', job.organization?.contact?.phone || '—'],
                ['Lot', `${job.lotNumber}${lot?.revision > 1 ? ` (rev ${lot.revision})` : ''}`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-ink-500">{label}</span>
                  <span className="text-right text-ink-800">{value}</span>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Assignment" icon={User} />
            <CardBody>
              <Select
                label="Operator"
                placeholder="Unassigned"
                value={job.assignedTo?.id || ''}
                onChange={(e) => act(() => jobsApi.assign(id, e.target.value || null))}
                options={operators.map((o) => ({ value: o.id, label: o.name }))}
                disabled={busy}
              />
              <div className="mt-4 space-y-2.5 border-t border-ink-200 pt-4 text-sm">
                {[
                  ['Priority', humanise(job.priority)],
                  ['Received', formatDateTime(job.receivedAt)],
                  ['Due', job.dueDate ? formatDateTime(job.dueDate) : 'Not set'],
                  ...(job.dispatchedAt ? [['Dispatched', formatDateTime(job.dispatchedAt)]] : []),
                  ...(job.completedAt ? [['Completed', formatDateTime(job.completedAt)]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <span className="text-ink-500">{label}</span>
                    <span className="text-right text-ink-800">{value}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {job.dispatch?.trackingNumber && (
            <Card>
              <CardHeader title="Dispatch" icon={Truck} />
              <CardBody className="space-y-2.5 text-sm">
                {[
                  ['Courier', job.dispatch.courier],
                  ['Tracking', job.dispatch.trackingNumber],
                  ['Method', job.dispatch.method],
                ]
                  .filter(([, v]) => v)
                  .map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <span className="text-ink-500">{label}</span>
                      <span className="text-right font-mono text-ink-800">{value}</span>
                    </div>
                  ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Proofs"
              subtitle={proofs.length ? `${proofs.length} version${proofs.length === 1 ? '' : 's'}` : 'None sent yet'}
              icon={FileCheck2}
              action={
                ['design_processing', 'proof_ready', 'awaiting_client_approval'].includes(
                  job.status
                ) && (
                  <Button size="sm" icon={Upload} onClick={() => setProofOpen(true)}>
                    {proofs.length ? 'New version' : 'Send proof'}
                  </Button>
                )
              }
            />
            {proofs.length ? (
              <ul className="divide-y divide-ink-200">
                {proofs.map((p) => {
                  const pm = PROOF_STATUS_META[p.status] || { label: p.status, tone: 'neutral' };
                  return (
                    <li key={p.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <a
                          href={p.file?.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-ink-900 hover:text-brand-700"
                        >
                          Version {p.version}
                        </a>
                        <Badge tone={pm.tone} size="sm">
                          {pm.label}
                        </Badge>
                      </div>
                      {p.notes && <p className="mt-0.5 text-xs text-ink-500">{p.notes}</p>}
                      {p.decidedByName && (
                        <p className="mt-1 text-xs text-ink-600">
                          {p.status === 'approved' ? 'Approved' : 'Changes requested'} by{' '}
                          {p.decidedByName} · {formatDateTime(p.decidedAt)}
                        </p>
                      )}
                      {p.decisionComment && (
                        <p className="mt-1 rounded bg-ink-50 p-2 text-xs leading-relaxed text-ink-700">
                          {p.decisionComment}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <CardBody>
                <p className="text-sm leading-relaxed text-ink-500">
                  Nothing is printed until the client signs off a proof. Move the job to design
                  processing, then send one.
                </p>
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader title="History" icon={History} />
            <ul className="max-h-72 divide-y divide-ink-200 overflow-y-auto">
              {[...job.statusHistory].reverse().map((h, i) => (
                <li key={i} className="px-5 py-2.5">
                  <div className="flex items-center gap-2">
                    <Badge tone={jobMeta(h.to).tone} size="sm">
                      {humanise(h.to)}
                    </Badge>
                    <span className="text-xs text-ink-400">{formatDateTime(h.at)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">by {h.byName}</p>
                  {h.note && <p className="mt-0.5 text-sm text-ink-700">{h.note}</p>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {/* ------------------------- move status ------------------------- */}
      <Modal
        open={Boolean(moveTo)}
        onClose={() => setMoveTo(null)}
        title={`Move to ${moveTo ? humanise(moveTo) : ''}?`}
        description={moveTo ? JOB_STAGE_HINTS[moveTo] : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoveTo(null)} disabled={busy}>
              Cancel
            </Button>
            <Button loading={busy} onClick={() => act(() => jobsApi.setStatus(id, moveTo, note))}>
              Confirm
            </Button>
          </>
        }
      >
        <Input
          label="Note (optional)"
          placeholder="Recorded against this step in the job history"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {moveTo === 'completed' && (
          <p className="mt-3 rounded-lg bg-warning-50 p-3 text-xs leading-relaxed text-warning-800">
            Completing the job also closes the client&rsquo;s lot and marks every record as
            completed. This is the end of the pipeline.
          </p>
        )}
      </Modal>

      {/* ------------------------- data issue -------------------------- */}
      <Modal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        title="Report a data issue"
        description="This sends the batch back to the client. Naming specific records returns only those, so the rest can carry on."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIssueOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={!issueReason.trim()}
              onClick={() =>
                act(() =>
                  jobsApi.raiseDataIssue(id, {
                    reason: issueReason,
                    records: [...issueRecords].map((rid) => {
                      const rec = records.find((r) => r.id === rid);
                      return {
                        submission: rid,
                        label: `${rec?.userLoginId || ''} ${rec?.userName || ''}`.trim(),
                        reason: issueReason,
                      };
                    }),
                  })
                )
              }
            >
              Send back to client
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="What is wrong?"
            required
            placeholder="e.g. The photograph is too dark to print legibly at card size."
            value={issueReason}
            onChange={(e) => setIssueReason(e.target.value)}
            hint="The client and the affected people see this wording."
          />

          <div>
            <p className="mb-2 text-sm font-medium text-ink-700">
              Which records? ({issueRecords.size} selected)
            </p>
            <p className="mb-2 text-xs leading-relaxed text-ink-500">
              Leave all unticked to return the whole batch without releasing individual records.
            </p>
            <ul className="max-h-56 divide-y divide-ink-200 overflow-y-auto rounded-lg border border-ink-200">
              {records.map((r) => (
                <li key={r.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-ink-50">
                    <input
                      type="checkbox"
                      checked={issueRecords.has(r.id)}
                      onChange={() =>
                        setIssueRecords((prev) => {
                          const next = new Set(prev);
                          if (next.has(r.id)) next.delete(r.id);
                          else next.add(r.id);
                          return next;
                        })
                      }
                      className="size-4 rounded border-ink-300 text-danger-600"
                    />
                    {r.files?.photograph?.url && (
                      <img src={r.files.photograph.url} alt="" className="size-8 rounded object-cover" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink-800">{r.userName}</span>
                      <span className="block truncate font-mono text-xs text-ink-500">
                        {r.userLoginId}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Modal>

      {/* ------------------------ send a proof ------------------------- */}
      <Modal
        open={proofOpen}
        onClose={() => setProofOpen(false)}
        title={proofs.length ? `Send proof version ${proofs.length + 1}` : 'Send the first proof'}
        description="The client reviews this and must approve it before anything is printed."
        footer={
          <>
            <Button variant="secondary" onClick={() => setProofOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              icon={Send}
              loading={busy}
              disabled={!proofFile}
              onClick={() =>
                act(() =>
                  platformProofsApi.upload(id, proofFile, proofNotes).then((r) => {
                    setProofOpen(false);
                    setProofFile(null);
                    setProofNotes('');
                    return r;
                  })
                )
              }
            >
              Send to client
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label
            className={
              proofFile
                ? 'flex cursor-pointer items-center gap-3 rounded-lg border-2 border-brand-300 bg-brand-50 p-4'
                : 'flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-ink-300 bg-ink-50 p-4 transition hover:border-brand-400'
            }
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-ink-500">
              <Upload size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink-800">
                {proofFile ? proofFile.name : 'Choose the proof file'}
              </span>
              <span className="block text-xs text-ink-500">PDF or image, up to 8 MB</span>
            </span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(e) => setProofFile(e.target.files?.[0] || null)}
            />
          </label>

          <Input
            label="What changed in this version?"
            placeholder={
              proofs.length
                ? 'e.g. Crest enlarged, blood group added to the reverse.'
                : 'e.g. First draft for your review.'
            }
            value={proofNotes}
            onChange={(e) => setProofNotes(e.target.value)}
            hint="Shown to the client above the proof."
          />

          {proofs.length > 0 && (
            <p className="rounded-lg bg-info-50 p-3 text-xs leading-relaxed text-info-800">
              Sending this replaces version {proofs.length} as the one awaiting approval. Earlier
              versions are kept for the record, along with who decided on them.
            </p>
          )}
        </div>
      </Modal>

      {/* -------------------------- dispatch --------------------------- */}
      <Modal
        open={dispatchOpen}
        onClose={() => setDispatchOpen(false)}
        title="Dispatch details"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDispatchOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              icon={Send}
              loading={busy}
              onClick={() => act(() => jobsApi.update(id, { dispatch }).then(() => ({ message: 'Dispatch details saved' })))}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Courier"
            value={dispatch.courier || ''}
            onChange={(e) => setDispatch({ ...dispatch, courier: e.target.value })}
            placeholder="Blue Dart"
          />
          <Input
            label="Tracking number"
            value={dispatch.trackingNumber || ''}
            onChange={(e) => setDispatch({ ...dispatch, trackingNumber: e.target.value })}
          />
          <Input
            label="Delivered to"
            value={dispatch.dispatchedTo || ''}
            onChange={(e) => setDispatch({ ...dispatch, dispatchedTo: e.target.value })}
            placeholder="Client address"
          />
        </div>
      </Modal>
    </>
  );
}
