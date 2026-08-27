import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Lock, Save, Send } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { PageLoader, Spinner } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import FieldRenderer from '../../features/portal/FieldRenderer.jsx';
import { portalApi } from '../../api/portalApi.js';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import useUnsavedChanges from '../../hooks/useUnsavedChanges.js';
import LiveCardPreview from '../../features/portal/LiveCardPreview.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';

const LAYOUT_TYPES = ['heading', 'instructions', 'divider', 'hidden'];
const FILE_TYPES = ['photo', 'signature', 'document'];

export default function FormFillPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [payload, setPayload] = useState(null);
  const [values, setValues] = useState({});
  const [files, setFiles] = useState({});
  const [declaration, setDeclaration] = useState(false);
  const [errors, setErrors] = useState({});

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [done, setDone] = useState(null);

  const { blocked, confirmLeave, cancelLeave } = useUnsavedChanges(dirty);
  const autosaveTimer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await portalApi.getForm(id);
      setPayload(data);
      setValues(data.submission.data || {});
      setFiles(data.submission.files || {});
      setDeclaration(Boolean(data.submission.declarationAccepted));
      setDirty(false);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const editable = payload?.submission?.editable && payload?.isOpen;
  const allowDrafts = payload?.form?.settings?.allowDrafts !== false;

  const persistDraft = useCallback(
    async ({ silent = true } = {}) => {
      if (!editable || !allowDrafts) return;
      setSaving(true);
      try {
        const res = await portalApi.saveDraft(id, { data: values, declarationAccepted: declaration });
        setLastSaved(new Date());
        setDirty(false);
        setPayload((p) => (p ? { ...p, submission: { ...p.submission, completeness: res.completeness } } : p));
        if (!silent) toast.success('Progress saved.');
      } catch (err) {
        if (!silent) toast.error(errorMessage(err));
      } finally {
        setSaving(false);
      }
    },
    [id, values, declaration, editable, allowDrafts, toast]
  );

  /**
   * Autosave 3s after typing stops.
   *
   * These forms are filled on phones, often on poor connections. Losing ten
   * minutes of typing to a dropped tab is the failure worth engineering away.
   */
  useEffect(() => {
    if (!dirty || !editable || !allowDrafts) return undefined;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => persistDraft({ silent: true }), 3000);
    return () => clearTimeout(autosaveTimer.current);
  }, [values, declaration, dirty, editable, allowDrafts, persistDraft]);

  const setValue = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    // Clear the error as soon as the user starts fixing that field.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const uploadFor = async (field, file) => {
    setUploading(field.key);
    try {
      const res = await portalApi.uploadFile(id, field.key, file);
      setFiles((prev) => ({ ...prev, [field.key]: res.file }));
      setErrors((prev) => ({ ...prev, [field.key]: undefined }));
      toast.success(`${field.label} uploaded.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(null);
    }
  };

  const removeFileFor = async (field) => {
    try {
      await portalApi.removeFile(id, field.key);
      setFiles((prev) => {
        const next = { ...prev };
        delete next[field.key];
        return next;
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const doSubmit = async () => {
    setSubmitting(true);
    setErrors({});
    try {
      const res = await portalApi.submit(id, { data: values, declarationAccepted: declaration });
      setDirty(false);
      setConfirmOpen(false);
      setDone(res.data);
    } catch (err) {
      setConfirmOpen(false);
      const details = err?.response?.data?.details;
      if (Array.isArray(details)) {
        const map = {};
        details.forEach((d) => {
          map[d.field] = d.message;
        });
        setErrors(map);
        toast.error('Some details need fixing. They are highlighted below.');
        // Take the user to the first problem rather than leaving them hunting.
        const first = details[0]?.field;
        if (first) {
          document
            .querySelector(`[data-field="${first}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoader label="Loading form..." />;
  if (loadError) return <ErrorState message={loadError} onRetry={load} />;

  const { form, submission } = payload;
  const correctionMap = (submission.correctionRequested?.fields || []).reduce(
    (acc, f) => ({ ...acc, [f.key]: f.message }),
    {}
  );

  /* ------------------------------ success ------------------------------ */
  if (done) {
    return (
      <div className="mx-auto max-w-lg py-8">
        <Card>
          <CardBody className="flex flex-col items-center py-10 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-success-50 text-success-600">
              <CheckCircle2 size={26} aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-lg font-semibold text-ink-900">
              {done.status === 'resubmitted' ? 'Resubmitted' : 'Submitted'}
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-600">
              {done.successMessage ||
                'Your details have been sent to your organisation for review.'}
            </p>
            <Button className="mt-6" onClick={() => navigate('/portal')}>
              Back to my forms
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={form.title}
        subtitle={form.description || undefined}
        breadcrumbs={[{ label: 'My forms', to: '/portal' }, { label: form.title }]}
        actions={<StatusBadge status={submission.status} kind="submission" />}
      />

      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,42rem)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0">
        {!payload.isOpen && (
          <div className="mb-4 flex items-start gap-2.5 rounded-card border border-ink-200 bg-ink-50 p-4">
            <Lock size={17} className="mt-0.5 shrink-0 text-ink-500" aria-hidden="true" />
            <p className="text-sm text-ink-700">{payload.closedReason}</p>
          </div>
        )}

        {submission.status === 'correction_required' && (
          <div className="mb-4 rounded-card border border-warning-200 bg-warning-50 p-4">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={17} className="mt-0.5 shrink-0 text-warning-600" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-warning-900">Changes were requested</p>
                {submission.correctionRequested?.note && (
                  <p className="mt-1 text-sm leading-relaxed text-warning-800">
                    {submission.correctionRequested.note}
                  </p>
                )}
                <p className="mt-1.5 text-xs text-warning-700">
                  The fields needing attention are marked below. Fix them and submit again.
                </p>
              </div>
            </div>
          </div>
        )}

        {!editable && payload.isOpen && submission.status !== 'correction_required' && (
          <div className="mb-4 flex items-start gap-2.5 rounded-card border border-info-200 bg-info-50 p-4">
            <Lock size={17} className="mt-0.5 shrink-0 text-info-600" aria-hidden="true" />
            <p className="text-sm text-info-800">
              You have already submitted this. It is now with your organisation for review and can
              no longer be edited.
            </p>
          </div>
        )}

        <Card>
          <CardBody className="space-y-5">
            {form.fields.map((field) => {
              if (field.type === 'hidden') return null;
              const isLayout = LAYOUT_TYPES.includes(field.type);
              const isFile = FILE_TYPES.includes(field.type);

              return (
                <div
                  key={field.key}
                  data-field={field.key}
                  className={field.width === 'half' && !isLayout ? 'sm:max-w-[calc(50%-0.5rem)]' : undefined}
                >
                  {uploading === field.key ? (
                    <div className="flex items-center gap-2.5 rounded-lg border border-ink-200 p-4">
                      <Spinner size={16} />
                      <span className="text-sm text-ink-600">Uploading {field.label}...</span>
                    </div>
                  ) : (
                    <FieldRenderer
                      field={field}
                      value={values[field.key]}
                      fileValue={isFile ? files[field.key] : undefined}
                      onChange={(v) => setValue(field.key, v)}
                      onUpload={(file) => uploadFor(field, file)}
                      onRemoveFile={() => removeFileFor(field)}
                      disabled={!editable}
                      error={errors[field.key]}
                      correctionNote={correctionMap[field.key]}
                    />
                  )}
                </div>
              );
            })}

            {form.settings?.requireDeclaration && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-ink-50 p-3.5">
                <input
                  type="checkbox"
                  checked={declaration}
                  disabled={!editable}
                  onChange={(e) => {
                    setDeclaration(e.target.checked);
                    setDirty(true);
                    setErrors((prev) => ({ ...prev, __declaration: undefined }));
                  }}
                  className="mt-0.5 size-4 rounded border-ink-300 text-brand-600 focus:ring-2 focus:ring-brand-500/30"
                />
                <span className="text-sm leading-relaxed text-ink-700">
                  {form.settings.declarationText}
                </span>
              </label>
            )}

            {errors.__declaration && (
              <p role="alert" className="text-sm font-medium text-danger-600">
                {errors.__declaration}
              </p>
            )}
          </CardBody>
        </Card>

        {editable && (
          <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-ink-200 bg-white/95 p-3.5 shadow-float backdrop-blur">
            <p className="text-xs text-ink-500">
              {saving ? (
                <span className="inline-flex items-center gap-1.5">
                  <Spinner size={12} /> Saving...
                </span>
              ) : lastSaved ? (
                <span className="inline-flex items-center gap-1.5 text-success-600">
                  <Check size={12} /> Saved
                </span>
              ) : allowDrafts ? (
                'Your progress saves automatically.'
              ) : (
                'This form must be completed in one go.'
              )}
            </p>
            <div className="flex gap-2">
              {allowDrafts && (
                <Button
                  variant="secondary"
                  icon={Save}
                  loading={saving}
                  onClick={() => persistDraft({ silent: false })}
                >
                  Save draft
                </Button>
              )}
              <Button icon={Send} onClick={() => setConfirmOpen(true)}>
                {submission.status === 'correction_required' ? 'Resubmit' : 'Submit'}
              </Button>
            </div>
          </div>
        )}

        {!editable && (
          <Button
            variant="secondary"
            icon={ArrowLeft}
            className="mt-4"
            onClick={() => navigate('/portal')}
          >
            Back to my forms
          </Button>
        )}
        </div>

        {/* Sticky so the card stays in view while the form is scrolled. */}
        <aside className="lg:sticky lg:top-6">
          <LiveCardPreview
            formId={form.id}
            values={values}
            files={files}
            userName={user?.name}
            loginId={user?.loginId}
          />
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={doSubmit}
        loading={submitting}
        title="Submit your details?"
        message="Once submitted, your organisation reviews these details and you will not be able to edit them unless changes are requested."
        confirmLabel="Yes, submit"
        variant="primary"
      />

      <ConfirmDialog
        open={blocked}
        onClose={cancelLeave}
        onConfirm={confirmLeave}
        title="Leave without saving?"
        message="You have changes that have not been saved yet."
        confirmLabel="Leave"
        cancelLabel="Stay"
      />
    </>
  );
}
