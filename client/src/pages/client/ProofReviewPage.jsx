import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  History,
  XCircle,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import { proofsApi } from '../../api/proofsApi.js';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSIONS } from '../../utils/rbac.js';
import { PROOF_STATUS_META } from '../../utils/statusMeta.js';
import { formatBytes, formatDateTime } from '../../utils/format.js';

export default function ProofReviewPage() {
  const { id } = useParams();
  const toast = useToast();
  const { can } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null); // 'approve' | 'changes'
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await proofsApi.get(id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (decision) => {
    setBusy(true);
    try {
      const res = await proofsApi.decide(id, decision, comment);
      toast.success(res.message);
      setDialog(null);
      setComment('');
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoader label="Loading proof..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const { proof, job, history } = data;
  const meta = PROOF_STATUS_META[proof.status] || { label: proof.status, tone: 'neutral' };
  const isPdf = proof.file?.mimetype === 'application/pdf';
  const canDecide = proof.status === 'pending' && can(PERMISSIONS.PROOFS_APPROVE);

  return (
    <>
      <PageHeader
        title={`Proof v${proof.version}`}
        subtitle={`${job?.jobNumber || ''} · ${job?.formTitle || ''} · ${job?.quantity || 0} card${job?.quantity === 1 ? '' : 's'}`}
        breadcrumbs={[
          { label: 'Dashboard', to: '/client' },
          { label: 'Proofs', to: '/client/proofs' },
          { label: `v${proof.version}` },
        ]}
        actions={
          <>
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {canDecide && (
              <>
                <Button variant="secondary" icon={XCircle} onClick={() => setDialog('changes')}>
                  Request changes
                </Button>
                <Button variant="success" icon={CheckCircle2} onClick={() => setDialog('approve')}>
                  Approve for printing
                </Button>
              </>
            )}
          </>
        }
      />

      {proof.status === 'pending' && (
        <div className="mb-5 flex items-start gap-2.5 rounded-card border border-warning-200 bg-warning-50 p-4">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-warning-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-warning-900">
              Nothing is printed until you approve this
            </p>
            <p className="mt-0.5 text-sm text-warning-800">
              Check the spelling, the photographs and the layout carefully. Approving authorises MR
              Print World to produce {job?.quantity || 'these'} cards, and your name is recorded
              against this exact version.
            </p>
          </div>
        </div>
      )}

      {proof.status === 'approved' && (
        <div className="mb-5 flex items-start gap-2.5 rounded-card border border-success-200 bg-success-50 p-4">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-success-600" aria-hidden="true" />
          <p className="text-sm text-success-800">
            Approved by <span className="font-medium">{proof.decidedByName}</span> on{' '}
            {formatDateTime(proof.decidedAt)}.
            {proof.decisionComment ? ` “${proof.decisionComment}”` : ''}
          </p>
        </div>
      )}

      {proof.status === 'superseded' && (
        <div className="mb-5 rounded-card border border-ink-200 bg-ink-50 p-4">
          <p className="text-sm text-ink-700">
            A newer version has been sent. Review the latest one instead — this version is kept only
            for the record.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardHeader
            title={`Version ${proof.version}`}
            subtitle={proof.file?.originalName}
            icon={FileCheck2}
            action={
              <a href={proof.file?.url} target="_blank" rel="noreferrer">
                <Button size="sm" variant="secondary" icon={Download}>
                  Open full size
                </Button>
              </a>
            }
          />
          <CardBody>
            {proof.notes && (
              <p className="mb-4 rounded-lg bg-info-50 p-3.5 text-sm leading-relaxed text-info-800">
                <span className="font-medium">From MR Print World: </span>
                {proof.notes}
              </p>
            )}

            {isPdf ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-ink-50 py-12 text-center">
                <FileText size={32} className="text-ink-400" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-ink-700">
                  {proof.file.originalName}
                </p>
                <p className="text-xs text-ink-500">{formatBytes(proof.file.bytes)} PDF</p>
                <a href={proof.file.url} target="_blank" rel="noreferrer" className="mt-4">
                  <Button size="sm">Open the PDF</Button>
                </a>
              </div>
            ) : (
              <a href={proof.file?.url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={proof.file?.url}
                  alt={`Proof version ${proof.version}`}
                  className="w-full rounded-lg border border-ink-200 object-contain"
                />
              </a>
            )}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="space-y-2.5 text-sm">
              {[
                ['Job', job?.jobNumber],
                ['Lot', job?.lotNumber],
                ['Cards', job?.quantity],
                ['Version', `v${proof.version}`],
                ['Sent', formatDateTime(proof.uploadedAt)],
                ['File size', formatBytes(proof.file?.bytes)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-ink-500">{label}</span>
                  <span className="text-right text-ink-800">{value ?? '—'}</span>
                </div>
              ))}
            </CardBody>
          </Card>

          {history.length > 0 && (
            <Card>
              <CardHeader title="Earlier versions" icon={History} />
              <ul className="divide-y divide-ink-200">
                {history.map((h) => {
                  const hm = PROOF_STATUS_META[h.status] || { label: h.status, tone: 'neutral' };
                  return (
                    <li key={h.id}>
                      <Link
                        to={`/client/proofs/${h.id}`}
                        className="block px-5 py-3 transition hover:bg-ink-50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-ink-900">v{h.version}</span>
                          <Badge tone={hm.tone} size="sm">
                            {hm.label}
                          </Badge>
                        </div>
                        {h.decidedByName && (
                          <p className="mt-0.5 text-xs text-ink-500">
                            {h.decidedByName} · {formatDateTime(h.decidedAt)}
                          </p>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {/* --------------------------- approve --------------------------- */}
      <Modal
        open={dialog === 'approve'}
        onClose={() => setDialog(null)}
        title={`Approve proof v${proof.version} for printing?`}
        description="This is the point of no return — MR Print World will begin producing the cards."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="success" loading={busy} onClick={() => decide('approve')}>
              Yes, approve for printing
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-600">
          Your name and the time are recorded against version {proof.version} specifically. If
          anything is wrong with the spelling, photographs or layout, request changes instead —
          corrections after printing mean reprinting {job?.quantity || 'the whole batch'}.
        </p>
        <Input
          containerClassName="mt-4"
          label="Comment (optional)"
          placeholder="Anything to note alongside your approval"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </Modal>

      {/* ------------------------ request changes ---------------------- */}
      <Modal
        open={dialog === 'changes'}
        onClose={() => setDialog(null)}
        title="Request changes"
        description="MR Print World will produce a new version and send it back to you."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!comment.trim()}
              onClick={() => decide('changes_requested')}
            >
              Send change request
            </Button>
          </>
        }
      >
        <Input
          label="What needs changing?"
          required
          placeholder="e.g. The school crest is too small and the blood group is missing."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          hint="Be specific — this is what the design team works from."
        />
      </Modal>
    </>
  );
}
