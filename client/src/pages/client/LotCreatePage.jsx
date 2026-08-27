import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Layers,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardHeader, CardBody, CardFooter } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { PageLoader, Spinner } from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { lotsApi } from '../../api/lotsApi.js';
import { formsApi } from '../../api/formsApi.js';
import { categoriesApi } from '../../api/clientApi.js';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { formatNumber, initials } from '../../utils/format.js';

export default function LotCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [forms, setForms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [formId, setFormId] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const [preview, setPreview] = useState(null);
  const [checking, setChecking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [lotName, setLotName] = useState('');
  const [priority, setPriority] = useState('normal');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    formsApi
      .list({ limit: 100, status: 'published' })
      .then((r) => {
        setForms(r.data);
        // One form is the common case; pick it so the page is useful immediately.
        if (r.data.length === 1) setFormId(r.data[0].id);
      })
      .catch(() => {});
    categoriesApi.list({ limit: 100 }).then((r) => setCategories(r.data)).catch(() => {});
  }, []);

  const loadEligible = useCallback(async () => {
    if (!formId) {
      setRecords([]);
      return;
    }
    setLoading(true);
    try {
      const res = await lotsApi.eligible({
        form: formId,
        limit: 100,
        ...(search ? { search } : {}),
        ...(category ? { orgCategory: category } : {}),
      });
      setRecords(res.data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [formId, search, category, toast]);

  useEffect(() => {
    const t = setTimeout(loadEligible, 300);
    return () => clearTimeout(t);
  }, [loadEligible]);

  // A record filtered out of view should not stay silently selected.
  useEffect(() => {
    setSelected((prev) => {
      const visible = new Set(records.map((r) => r.id));
      return new Set([...prev].filter((id) => visible.has(id)));
    });
  }, [records]);

  const selectedForm = useMemo(() => forms.find((f) => f.id === formId), [forms, formId]);
  const allVisible = records.length > 0 && records.every((r) => selected.has(r.id));

  const runPreview = async () => {
    setChecking(true);
    try {
      const res = await lotsApi.validate([...selected], formId);
      setPreview(res);
      if (!lotName && selectedForm) {
        setLotName(`${selectedForm.title} — ${new Date().toLocaleDateString('en-IN')}`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const create = async () => {
    setCreating(true);
    try {
      const res = await lotsApi.create({
        form: formId,
        submissions: [...selected],
        name: lotName,
        priority,
        notes,
      });
      toast.success(res.message);
      navigate(`/client/lots/${res.data.lot.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Create a printing lot"
        subtitle="Group approved records into one batch to send to MR Print World."
        breadcrumbs={[
          { label: 'Dashboard', to: '/client' },
          { label: 'Printing lots', to: '/client/lots' },
          { label: 'New' },
        ]}
      />

      <div className="max-w-5xl space-y-5">
        <Card>
          <CardHeader title="Which form" icon={Layers} />
          <CardBody>
            <Select
              label="Form"
              required
              placeholder={forms.length ? 'Select a form' : 'No published forms'}
              options={forms.map((f) => ({ value: f.id, label: f.title }))}
              value={formId}
              onChange={(e) => {
                setFormId(e.target.value);
                setSelected(new Set());
                setPreview(null);
              }}
              hint="A lot covers one form, because it becomes a single print run."
            />
          </CardBody>
        </Card>

        {formId && (
          <Card>
            <CardHeader
              title="Approved records"
              subtitle={`${formatNumber(records.length)} available · ${selected.size} selected`}
              action={
                records.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setSelected(allVisible ? new Set() : new Set(records.map((r) => r.id)))
                    }
                  >
                    {allVisible ? 'Clear all' : 'Select all'}
                  </Button>
                )
              }
            />

            <div className="flex flex-wrap items-end gap-3 border-b border-ink-200 p-4">
              <Input
                containerClassName="min-w-[14rem] flex-1"
                icon={Search}
                placeholder="Search name or user ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search records"
              />
              <Select
                containerClassName="w-48"
                placeholder="All categories"
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Filter by category"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2.5 py-12">
                <Spinner size={16} />
                <span className="text-sm text-ink-500">Loading approved records...</span>
              </div>
            ) : records.length ? (
              <ul className="max-h-[26rem] divide-y divide-ink-200 overflow-y-auto">
                {records.map((r) => (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-5 py-3 transition hover:bg-ink-50">
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
                      />
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
                      {r.orgCategory && (
                        <span className="hidden text-xs text-ink-500 sm:block">
                          {r.orgCategory.name}
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={CheckCircle2}
                title="No approved records waiting"
                description="Records appear here once they have been approved and are not already in another lot."
                action={
                  <Link to="/client/submissions/pending">
                    <Button size="sm" variant="secondary">
                      Go to submissions
                    </Button>
                  </Link>
                }
              />
            )}

            {selected.size > 0 && (
              <CardFooter>
                <p className="mr-auto text-sm text-ink-600">
                  {selected.size} record{selected.size === 1 ? '' : 's'} selected
                </p>
                <Button icon={ShieldCheck} loading={checking} onClick={runPreview}>
                  Check before creating
                </Button>
              </CardFooter>
            )}
          </Card>
        )}
      </div>

      {/* --------------------------- preflight --------------------------- */}
      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title="Ready to create this lot?"
        description="Anything with a problem is excluded automatically — it never reaches production."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(null)} disabled={creating}>
              Back
            </Button>
            <Button
              loading={creating}
              disabled={!preview?.summary.valid}
              onClick={create}
              icon={Layers}
            >
              Create lot with {preview?.summary.valid || 0} record
              {preview?.summary.valid === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        {preview && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Will be included', value: preview.summary.valid, tone: 'success', icon: CheckCircle2 },
                { label: 'Excluded', value: preview.summary.invalid, tone: 'danger', icon: XCircle },
                { label: 'Duplicate flags', value: preview.summary.duplicatesFlagged, tone: 'warning', icon: Copy },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-ink-200 p-3">
                  <div className="flex items-center gap-2">
                    <s.icon
                      size={15}
                      className={
                        s.tone === 'success'
                          ? 'text-success-600'
                          : s.tone === 'danger'
                            ? 'text-danger-600'
                            : 'text-warning-600'
                      }
                      aria-hidden="true"
                    />
                    <p className="text-[0.6875rem] font-medium tracking-wide text-ink-500 uppercase">
                      {s.label}
                    </p>
                  </div>
                  <p className="mt-1.5 text-2xl font-semibold text-ink-900 tabular">{s.value}</p>
                </div>
              ))}
            </div>

            {preview.invalid.length > 0 && (
              <div className="rounded-lg border border-danger-200 bg-danger-50 p-3.5">
                <p className="flex items-center gap-1.5 text-sm font-medium text-danger-800">
                  <AlertTriangle size={14} aria-hidden="true" />
                  These will not be included
                </p>
                <ul className="mt-2 space-y-1.5">
                  {preview.invalid.map((r) => (
                    <li key={r.id} className="text-sm text-danger-700">
                      <span className="font-medium">
                        {r.userLoginId || ''} {r.userName}
                      </span>{' '}
                      — {r.problems.join('; ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-3 border-t border-ink-200 pt-4">
              <Input
                label="Lot name"
                value={lotName}
                onChange={(e) => setLotName(e.target.value)}
                placeholder="Class 10 ID Cards - Batch 1"
                hint="For your own reference. A lot number is assigned automatically."
              />
              <Select
                label="Priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                options={[
                  { value: 'normal', label: 'Normal' },
                  { value: 'high', label: 'High' },
                  { value: 'urgent', label: 'Urgent' },
                ]}
              />
              <Input
                label="Notes for MR Print World"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
