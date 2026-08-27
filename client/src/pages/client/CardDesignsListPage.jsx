import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreditCard, Plus } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { cardDesignsApi } from '../../api/cardDesignsApi.js';
import { formsApi } from '../../api/formsApi.js';
import { errorMessage } from '../../api/client';
import { formatDate } from '../../utils/format.js';

/** Common ID card sizes, so nobody has to remember the millimetres. */
const PRESETS = [
  { value: '54x86', label: 'ID card, portrait (54 x 86 mm)' },
  { value: '86x54', label: 'ID card, landscape (86 x 54 mm)' },
  { value: '65x95', label: 'Large badge (65 x 95 mm)' },
  { value: '100x148', label: 'Postcard (100 x 148 mm)' },
];

export default function CardDesignsListPage() {
  const navigate = useNavigate();

  const [designs, setDesigns] = useState([]);
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [draft, setDraft] = useState({ name: '', form: '', preset: '54x86' });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [designResponse, formResponse] = await Promise.all([
        cardDesignsApi.list({ limit: 100 }),
        formsApi.list({ limit: 100 }),
      ]);
      setDesigns(designResponse.data || []);
      setForms(formResponse.data || []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setSubmitting(true);
    setCreateError(null);
    try {
      const [widthMm, heightMm] = draft.preset.split('x').map(Number);
      const result = await cardDesignsApi.create({
        form: draft.form,
        name: draft.name.trim(),
        widthMm,
        heightMm,
        dpi: 300,
      });
      navigate(`/client/card-designs/${result.design.id}`);
    } catch (err) {
      setCreateError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoader label="Loading card designs..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Card designs"
        subtitle="Position each form field on the printed card. People filling the form see their card build as they type."
        breadcrumbs={[{ label: 'Card designs' }]}
        actions={
          <Button onClick={() => setCreating(true)} disabled={!forms.length}>
            <Plus className="h-4 w-4" />
            New design
          </Button>
        }
      />

      {designs.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No card designs yet"
          description={
            forms.length
              ? 'Create a design to lay out how each form field appears on the printed card.'
              : 'Publish a form first - a card design lays out the fields from one form.'
          }
          action={
            forms.length ? (
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                New design
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => navigate('/client/forms')}>
                Go to forms
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {designs.map((design) => (
            <Link key={design.id} to={`/client/card-designs/${design.id}`}>
              <Card className="h-full transition hover:ring-2 hover:ring-brand-500/40">
                <CardBody className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium text-ink-900">{design.name}</h3>
                    <StatusBadge status={design.status} kind="generic" size="sm" />
                  </div>
                  <p className="text-sm text-ink-600">{design.form?.title || 'Form removed'}</p>
                  <p className="text-xs text-ink-500">
                    {design.widthMm} x {design.heightMm} mm &middot; {design.dpi} DPI
                    {design.hasBack ? ' · front and back' : ''}
                  </p>
                  <p className="text-xs text-ink-400">Updated {formatDate(design.updatedAt)}</p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New card design"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              onClick={create}
              loading={submitting}
              disabled={!draft.name.trim() || !draft.form}
            >
              Create and open
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {createError && <p className="text-sm text-danger-700">{createError}</p>}
          <Input
            label="Design name"
            placeholder="Student ID 2026"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            required
          />
          <Select
            label="Form"
            hint="The card can show any field from this form."
            value={draft.form}
            onChange={(e) => setDraft((d) => ({ ...d, form: e.target.value }))}
            placeholder="Choose a form"
            options={forms.map((f) => ({ value: f.id, label: f.title }))}
            required
          />
          <Select
            label="Card size"
            value={draft.preset}
            onChange={(e) => setDraft((d) => ({ ...d, preset: e.target.value }))}
            options={PRESETS}
          />
        </div>
      </Modal>
    </>
  );
}
