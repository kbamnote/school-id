import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Copy,
  History,
  Pencil,
  Save,
  X,
  ZoomIn,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import Modal, { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import { submissionsApi } from '../../api/submissionsApi.js';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSIONS } from '../../utils/rbac.js';
import { formatDateTime, humanise } from '../../utils/format.js';

const LAYOUT_TYPES = ['heading', 'instructions', 'divider'];
const FILE_TYPES = ['photo', 'signature', 'document'];

/** Renders a stored answer for reading, whatever its type. */
function displayValue(field, value) {
  if (value === undefined || value === null || value === '') return null;

  if (field.type === 'address' && typeof value === 'object') {
    return [value.line1, value.line2, value.city, value.state, value.pincode]
      .filter(Boolean)
      .join(', ');
  }
  if (Array.isArray(value)) return value.join(', ');
  if (field.type === 'date') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-IN');
  }
  return String(value);
}

export default function SubmissionReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState({});
  const [flagged, setFlagged] = useState({});
  const [correctionNote, setCorrectionNote] = useState('');
  const [dialog, setDialog] = useState(null); // 'approve' | 'correction' | 'reject'
  const [rejectNote, setRejectNote] = useState('');
  const [zoomed, setZoomed] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await submissionsApi.get(id);
      setData(res);
      setEdits({});
      setFlagged({});
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn, successNav = false) => {
    setBusy(true);
    try {
      const res = await fn();
      toast.success(res.message);
      setDialog(null);
      if (successNav) navigate('/client/submissions/pending');
      else await load();
    } catch (err) {
      const details = err?.response?.data?.details;
      if (Array.isArray(details) && details.length) {
        toast.error(`${errorMessage(err)} — ${details.map((d) => d.message).join('; ')}`);
      } else {
        toast.error(errorMessage(err));
      }
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  const saveEdits = async () => {
    const changed = Object.entries(edits).filter(
      ([key, v]) => JSON.stringify(v) !== JSON.stringify(data.values[key])
    );
    if (!changed.length) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const res = await submissionsApi.editData(id, Object.fromEntries(changed));
      toast.success(res.message);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoader label="Loading submission..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const { submission, fields, values, files, orphanedValues } = data;
  const canReview = can(PERMISSIONS.SUBMISSIONS_APPROVE);
  const canEdit = can(PERMISSIONS.SUBMISSIONS_EDIT);
  const isPending = ['submitted', 'resubmitted', 'under_review'].includes(submission.status);
  const flaggedCount = Object.values(flagged).filter(Boolean).length;

  return (
    <>
      <PageHeader
        title={submission.userName}
        subtitle={`${submission.userLoginId || ''} · ${submission.form?.title || ''}`}
        breadcrumbs={[
          { label: 'Dashboard', to: '/client' },
          { label: 'Submissions', to: '/client/submissions' },
          { label: submission.userName },
        ]}
        actions={
          <>
            <StatusBadge status={submission.status} kind="submission" />
            {canEdit && !editing && submission.status !== 'completed' && (
              <Button
                variant="secondary"
                icon={Pencil}
                onClick={() => {
                  setEdits({ ...values });
                  setEditing(true);
                }}
              >
                Correct a typo
              </Button>
            )}
            {editing && (
              <>
                <Button variant="secondary" icon={X} onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button icon={Save} loading={busy} onClick={saveEdits}>
                  Save edits
                </Button>
              </>
            )}
            {canReview && isPending && !editing && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setDialog('correction')}
                  disabled={busy}
                >
                  Request correction
                </Button>
                <Button
                  variant="success"
                  icon={CheckCircle2}
                  loading={busy}
                  onClick={() => setDialog('approve')}
                >
                  Approve
                </Button>
              </>
            )}
          </>
        }
      />

      {submission.duplicateOf && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-card border border-warning-200 bg-warning-50 p-4">
          <div className="flex items-start gap-2.5">
            <Copy size={17} className="mt-0.5 shrink-0 text-warning-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-warning-900">Possible duplicate</p>
              <p className="mt-0.5 text-sm text-warning-800">
                These identity details match{' '}
                <Link
                  to={`/client/submissions/view/${submission.duplicateOf.id || submission.duplicateOf}`}
                  className="font-medium underline"
                >
                  {submission.duplicateOf.userName || 'another record'}
                </Link>
                {submission.duplicateOf.userLoginId
                  ? ` (${submission.duplicateOf.userLoginId})`
                  : ''}
                . Two people can genuinely share a name and date of birth — check before deciding.
              </p>
            </div>
          </div>
          {canReview && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => act(() => submissionsApi.dismissDuplicate(id))}
              loading={busy}
            >
              Different person
            </Button>
          )}
        </div>
      )}

      {submission.status === 'correction_required' && submission.correctionRequested?.note && (
        <div className="mb-5 rounded-card border border-info-200 bg-info-50 p-4">
          <p className="text-sm font-medium text-info-900">Waiting on the user</p>
          <p className="mt-1 text-sm text-info-800">{submission.correctionRequested.note}</p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader
            title="Submitted details"
            subtitle={
              submission.formSnapshot?.length
                ? 'Shown exactly as the form stood when this was submitted.'
                : 'This record is still a draft.'
            }
          />
          <CardBody className="space-y-4">
            {fields.map((field) => {
              if (LAYOUT_TYPES.includes(field.type)) {
                return field.type === 'heading' ? (
                  <h3
                    key={field.key}
                    className="border-b border-ink-200 pt-2 pb-1.5 text-xs font-semibold tracking-wider text-ink-500 uppercase"
                  >
                    {field.label}
                  </h3>
                ) : null;
              }

              const isFile = FILE_TYPES.includes(field.type);
              const file = files[field.key];
              const shown = displayValue(field, values[field.key]);

              return (
                <div key={field.key} className="flex flex-wrap items-start gap-4">
                  <div className="w-40 shrink-0">
                    <p className="text-sm font-medium text-ink-600">{field.label}</p>
                    {field.required && (
                      <p className="text-[0.6875rem] text-ink-400">required</p>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {isFile ? (
                      file?.url ? (
                        <button
                          type="button"
                          onClick={() => setZoomed(file)}
                          className="group relative inline-block"
                          aria-label={`Enlarge ${field.label}`}
                        >
                          <img
                            src={file.url}
                            alt={field.label}
                            className="max-h-40 rounded-lg object-contain ring-1 ring-ink-200"
                          />
                          <span className="absolute inset-0 grid place-items-center rounded-lg bg-ink-900/0 text-white opacity-0 transition group-hover:bg-ink-900/35 group-hover:opacity-100">
                            <ZoomIn size={20} />
                          </span>
                        </button>
                      ) : (
                        <span className="text-sm text-danger-600">Not uploaded</span>
                      )
                    ) : editing ? (
                      <Input
                        value={edits[field.key] ?? ''}
                        onChange={(e) => setEdits({ ...edits, [field.key]: e.target.value })}
                        disabled={field.type === 'address'}
                        hint={field.type === 'address' ? 'Address is edited by the user only' : undefined}
                      />
                    ) : shown ? (
                      <p className="text-sm break-words text-ink-900">{shown}</p>
                    ) : (
                      <span className="text-sm text-ink-400">— not provided</span>
                    )}

                    {file?.width && (
                      <p className="mt-1 text-xs text-ink-500">
                        {file.width}×{file.height}px
                        {file.width < (field.fileSettings?.minWidth || 0) && (
                          <span className="ml-1.5 font-medium text-warning-700">
                            below the required size
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {canReview && isPending && !editing && (
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-ink-500">
                      <input
                        type="checkbox"
                        checked={Boolean(flagged[field.key])}
                        onChange={(e) =>
                          setFlagged({ ...flagged, [field.key]: e.target.checked ? '' : undefined })
                        }
                        className="size-3.5 rounded border-ink-300 text-warning-500"
                      />
                      flag
                    </label>
                  )}
                </div>
              );
            })}

            {orphanedValues.length > 0 && (
              <p className="rounded-lg bg-ink-50 p-3 text-xs leading-relaxed text-ink-500">
                {orphanedValues.length} answer{orphanedValues.length === 1 ? '' : 's'} were given for
                fields that have since been removed from the form. They are kept on the record but
                not shown here.
              </p>
            )}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Record" />
            <CardBody className="space-y-2.5 text-sm">
              {[
                ['User', `${submission.user?.name || submission.userName}`],
                ['User ID', submission.userLoginId || '—'],
                ['Category', submission.orgCategory?.name || '—'],
                ['Department', submission.department?.name || '—'],
                ['Submitted', submission.submittedAt ? formatDateTime(submission.submittedAt) : '—'],
                ['Attempts', submission.submissionCount || 0],
                ...(submission.approvedAt
                  ? [['Approved', formatDateTime(submission.approvedAt)]]
                  : []),
                ...(submission.approvedBy ? [['Approved by', submission.approvedBy.name]] : []),
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-ink-500">{label}</span>
                  <span className="text-right text-ink-800">{value}</span>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="History" icon={History} />
            {submission.reviews?.length ? (
              <ul className="divide-y divide-ink-200">
                {[...submission.reviews].reverse().map((r, i) => (
                  <li key={i} className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          r.action === 'approved'
                            ? 'success'
                            : r.action === 'rejected'
                              ? 'danger'
                              : r.action === 'edited'
                                ? 'info'
                                : 'warning'
                        }
                        size="sm"
                      >
                        {humanise(r.action)}
                      </Badge>
                      <span className="text-xs text-ink-500">{formatDateTime(r.at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-600">by {r.byName}</p>
                    {r.note && <p className="mt-1 text-sm text-ink-700">{r.note}</p>}
                    {r.fieldNotes?.map((f, j) => (
                      <p key={j} className="mt-1 text-xs text-ink-500">
                        <span className="font-medium">{f.key}:</span> {f.message}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            ) : (
              <CardBody>
                <p className="text-sm text-ink-500">No review activity yet.</p>
              </CardBody>
            )}
          </Card>

          {canReview && isPending && (
            <Button
              variant="ghost"
              icon={Ban}
              fullWidth
              className="text-danger-600 hover:bg-danger-50"
              onClick={() => setDialog('reject')}
            >
              Reject this record
            </Button>
          )}
        </div>
      </div>

      {/* ------------------------- approve dialog ------------------------- */}
      <ConfirmDialog
        open={dialog === 'approve'}
        onClose={() => setDialog(null)}
        onConfirm={() => act(() => submissionsApi.approve(id), true)}
        loading={busy}
        title="Approve this record?"
        message={`${submission.userName}'s details become eligible for a printing lot. If anything is still missing, the approval is refused and you will be told what.`}
        confirmLabel="Approve"
        variant="success"
      />

      {/* ----------------------- correction dialog ------------------------ */}
      <Modal
        open={dialog === 'correction'}
        onClose={() => setDialog(null)}
        title="Request a correction"
        description="Say what is wrong. The user sees your note against each flagged field."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!correctionNote.trim() && flaggedCount === 0}
              onClick={() =>
                act(
                  () =>
                    submissionsApi.requestCorrection(id, {
                      note: correctionNote,
                      fields: Object.entries(flagged)
                        .filter(([, v]) => v !== undefined && String(v).trim())
                        .map(([key, message]) => ({ key, message })),
                    }),
                  true
                )
              }
            >
              Send back to {submission.userName.split(' ')[0]}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Overall message"
            placeholder="e.g. Two things need fixing before we can print your card."
            value={correctionNote}
            onChange={(e) => setCorrectionNote(e.target.value)}
          />

          {Object.keys(flagged).filter((k) => flagged[k] !== undefined).length > 0 ? (
            <div className="space-y-3 rounded-lg bg-ink-50 p-3.5">
              <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
                Flagged fields
              </p>
              {Object.keys(flagged)
                .filter((k) => flagged[k] !== undefined)
                .map((key) => {
                  const field = fields.find((f) => f.key === key);
                  return (
                    <Input
                      key={key}
                      label={field?.label || key}
                      placeholder="What is wrong with this one?"
                      value={flagged[key]}
                      onChange={(e) => setFlagged({ ...flagged, [key]: e.target.value })}
                    />
                  );
                })}
            </div>
          ) : (
            <p className="flex items-start gap-2 rounded-lg bg-info-50 p-3 text-xs leading-relaxed text-info-800">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              Tick “flag” next to any field on the left before opening this dialog to attach a
              note to that specific field.
            </p>
          )}
        </div>
      </Modal>

      {/* ------------------------- reject dialog -------------------------- */}
      <Modal
        open={dialog === 'reject'}
        onClose={() => setDialog(null)}
        title="Reject this record?"
        description="Use this only when the record should not be printed at all. A correction request is usually the better option."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={!rejectNote.trim()}
              onClick={() => act(() => submissionsApi.reject(id, rejectNote), true)}
            >
              Reject
            </Button>
          </>
        }
      >
        <Input
          label="Reason"
          required
          placeholder="Recorded in the audit trail"
          value={rejectNote}
          onChange={(e) => setRejectNote(e.target.value)}
        />
      </Modal>

      {/* --------------------------- photo zoom --------------------------- */}
      <Modal
        open={Boolean(zoomed)}
        onClose={() => setZoomed(null)}
        title="Inspect image"
        description={zoomed ? `${zoomed.width}×${zoomed.height}px` : ''}
        size="lg"
      >
        {zoomed && (
          <img
            src={zoomed.url}
            alt="Enlarged submission"
            className="mx-auto max-h-[65vh] rounded-lg object-contain"
          />
        )}
      </Modal>
    </>
  );
}
