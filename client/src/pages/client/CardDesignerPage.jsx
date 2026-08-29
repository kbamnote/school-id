import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Image as ImageIcon,
  Type,
  QrCode,
  Save,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Loader2,
  RotateCcw,
  Wand2,
  Check,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import DesignerCanvas from '../../features/cardDesigner/DesignerCanvas.jsx';
import ElementInspector from '../../features/cardDesigner/ElementInspector.jsx';
import { sampleValues } from '../../features/cardDesigner/resolveValue.js';
import detectFields from '../../features/cardDesigner/detectFields.js';
import { cardDesignsApi } from '../../api/cardDesignsApi.js';
import { errorMessage } from '../../api/client';
import useUnsavedChanges from '../../hooks/useUnsavedChanges.js';

const CANVAS_WIDTH = 380;

/** A new element, sized so it is visible and grabbable the moment it appears. */
function makeElement(type, face, extra = {}) {
  return {
    id: `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    face,
    x: 10,
    y: 10,
    width: type === 'qr' ? 20 : 60,
    height: type === 'qr' ? 12.6 : 7,
    z: 1,
    text: '',
    style: {
      fontSize: 4,
      fontFamily: 'Helvetica',
      fontWeight: 'normal',
      color: '#111111',
      align: 'left',
      verticalAlign: 'top',
      lineHeight: 1.25,
      transform: 'none',
      objectFit: 'cover',
      radius: 0,
      hideIfEmpty: true,
    },
    ...extra,
  };
}

export default function CardDesignerPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [design, setDesign] = useState(null);
  const [fields, setFields] = useState([]);
  const [fonts, setFonts] = useState([]);
  const [form, setForm] = useState(null);
  const [warnings, setWarnings] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [dirty, setDirty] = useState(false);

  const [face, setFace] = useState('front');
  const [selectedId, setSelectedId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [renderUrl, setRenderUrl] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [detecting, setDetecting] = useState(null);
  const [detectSummary, setDetectSummary] = useState(null);

  const artworkInput = useRef(null);
  const { blocked, confirmLeave, cancelLeave } = useUnsavedChanges(dirty);

  /* ------------------------------- loading ------------------------------- */

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, fontList] = await Promise.all([
        cardDesignsApi.get(id),
        cardDesignsApi.fonts().catch(() => []),
      ]);
      setDesign(data.design);
      setFields(data.fields || []);
      setForm(data.form);
      setWarnings(data.warnings || []);
      setFonts(fontList);
      setDirty(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // A rendered preview is a blob URL; letting them accumulate leaks memory.
  useEffect(() => () => {
    if (renderUrl) URL.revokeObjectURL(renderUrl);
  }, [renderUrl]);

  /* ------------------------------ mutations ------------------------------ */

  /*
   * Touching a detected element counts as confirming it - the admin has
   * looked at it and decided where it goes, which is exactly the human check
   * the `suggested` flag is waiting for.
   */
  const patchElement = useCallback((elementId, patch) => {
    setDesign((current) => ({
      ...current,
      elements: current.elements.map((el) =>
        el.id === elementId ? { ...el, ...patch, suggested: false } : el
      ),
    }));
    setDirty(true);
  }, []);

  const patchStyle = useCallback((elementId, patch) => {
    setDesign((current) => ({
      ...current,
      elements: current.elements.map((el) =>
        el.id === elementId ? { ...el, style: { ...el.style, ...patch }, suggested: false } : el
      ),
    }));
    setDirty(true);
  }, []);

  const addElement = useCallback(
    (type, extra) => {
      const element = makeElement(type, face, extra);
      setDesign((current) => ({ ...current, elements: [...current.elements, element] }));
      setSelectedId(element.id);
      setDirty(true);
    },
    [face]
  );

  const addField = useCallback(
    (field) => {
      const isPhoto = field.type === 'photo' || field.type === 'signature';
      addElement('field', {
        fieldKey: field.key,
        fieldType: field.type,
        // A photo box defaults to the 3:4 shape the portal captures, so the
        // common case needs no adjustment and crops correctly.
        ...(isPhoto ? { width: 30, height: 25.1 } : {}),
        style: {
          ...makeElement('field', face).style,
          ...(isPhoto ? { objectFit: 'cover' } : {}),
        },
      });
    },
    [addElement, face]
  );

  const removeElement = useCallback((elementId) => {
    setDesign((current) => ({
      ...current,
      elements: current.elements.filter((el) => el.id !== elementId),
    }));
    setSelectedId(null);
    setDirty(true);
  }, []);

  /** Accepts every detected element as-is. */
  const confirmAllSuggestions = useCallback(() => {
    setDesign((current) => ({
      ...current,
      elements: current.elements.map((el) => (el.suggested ? { ...el, suggested: false } : el)),
    }));
    setDetectSummary(null);
    setDirty(true);
  }, []);

  /** Throws the detected elements away, leaving anything placed by hand. */
  const discardSuggestions = useCallback(() => {
    setDesign((current) => ({
      ...current,
      elements: current.elements.filter((el) => !el.suggested),
    }));
    setSelectedId(null);
    setDetectSummary(null);
    setDirty(true);
  }, []);

  const duplicateElement = useCallback((element) => {
    const copy = {
      ...element,
      id: `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      x: Math.min(element.x + 3, 90),
      y: Math.min(element.y + 3, 90),
    };
    setDesign((current) => ({ ...current, elements: [...current.elements, copy] }));
    setSelectedId(copy.id);
    setDirty(true);
  }, []);

  /* -------------------------------- saving ------------------------------- */

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await cardDesignsApi.update(id, {
        name: design.name,
        widthMm: design.widthMm,
        heightMm: design.heightMm,
        dpi: design.dpi,
        hasBack: design.hasBack,
        elements: design.elements.map((el) => ({
          id: el.id,
          type: el.type,
          face: el.face || 'front',
          fieldKey: el.fieldKey ?? null,
          fieldType: el.fieldType ?? null,
          text: el.text || '',
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          z: el.z || 0,
          suggested: Boolean(el.suggested),
          style: el.style,
        })),
      });
      setDesign(result.design);
      setWarnings(result.warnings || []);
      setDirty(false);
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [id, design]);

  const activate = useCallback(async () => {
    setSaveError(null);
    try {
      if (dirty) await save();
      const result = await cardDesignsApi.setStatus(id, 'active');
      setDesign((current) => ({ ...current, status: result.design.status }));
    } catch (err) {
      setSaveError(errorMessage(err));
    }
  }, [id, dirty, save]);

  const uploadArtwork = useCallback(
    async (file) => {
      if (!file) return;
      setUploading(true);
      setSaveError(null);
      try {
        const result = await cardDesignsApi.uploadArtwork(id, file, face);
        // Keep the unsaved element edits; only the artwork came from the server.
        setDesign((current) => ({
          ...current,
          [face]: result.design[face],
          hasBack: result.design.hasBack,
        }));

        /*
         * Read the artwork and propose elements for it. Runs in the browser
         * on the file we already have, and never blocks the upload - a design
         * with no detectable text is a perfectly normal design.
         */
        setDetectSummary(null);
        setDetecting({ progress: 0 });
        try {
          const { elements: found, summary } = await detectFields(file, fields, (p) =>
            setDetecting({ progress: p })
          );

          if (found.length) {
            setDesign((current) => ({
              ...current,
              elements: [
                ...current.elements,
                ...found.map((el) => ({ ...el, face })),
              ],
            }));
            setDirty(true);
          }
          setDetectSummary({ ...summary, added: found.length });
        } catch (detectErr) {
          // Detection is a convenience; failing it must not fail the upload.
          setDetectSummary({ failed: true, message: detectErr.message });
        } finally {
          setDetecting(null);
        }
      } catch (err) {
        setSaveError(errorMessage(err));
      } finally {
        setUploading(false);
      }
    },
    [id, face, fields]
  );

  const renderProof = useCallback(async () => {
    setRendering(true);
    try {
      if (dirty) await save();
      const url = await cardDesignsApi.previewUrl(id, { face });
      setRenderUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setRendering(false);
    }
  }, [id, face, dirty, save]);

  /* ------------------------------- rendering ----------------------------- */

  const previewValues = useMemo(() => sampleValues(fields), [fields]);
  const selected = design?.elements.find((el) => el.id === selectedId) || null;
  const suggestionCount = design?.elements.filter((el) => el.suggested).length || 0;

  if (loading) return <PageLoader label="Opening the designer..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const faceElements = design.elements.filter((el) => (el.face || 'front') === face);

  return (
    <>
      <PageHeader
        title={design.name}
        subtitle={form ? `Card layout for "${form.title}"` : 'Card layout'}
        breadcrumbs={[
          { label: 'Card designs', to: '/client/card-designs' },
          { label: design.name },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={design.status} kind="generic" size="sm" />
            <Button size="sm" variant="secondary" onClick={renderProof} loading={rendering}>
              <Eye className="h-4 w-4" />
              Print preview
            </Button>
            <Button size="sm" variant="primary" onClick={save} loading={saving} disabled={!dirty}>
              <Save className="h-4 w-4" />
              {dirty ? 'Save' : 'Saved'}
            </Button>
            {design.status !== 'active' && (
              <Button size="sm" variant="success" onClick={activate}>
                <CheckCircle2 className="h-4 w-4" />
                Activate
              </Button>
            )}
          </div>
        }
      />

      {saveError && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-danger-50 p-3 text-sm text-danger-800 ring-1 ring-danger-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[16rem_1fr_18rem]">
        {/* ----------------------------- palette ----------------------------- */}
        <Card className="h-fit">
          <CardHeader title="Add to card" />
          <CardBody className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-500 uppercase">
                Form fields
              </p>
              <div className="space-y-1">
                {fields
                  .filter((f) => f.type !== 'heading')
                  .map((field) => {
                    const used = design.elements.some((el) => el.fieldKey === field.key);
                    return (
                      <button
                        key={field.key}
                        type="button"
                        onClick={() => addField(field)}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm text-ink-700 hover:bg-ink-100"
                      >
                        <span className="truncate">{field.label}</span>
                        {used && <span className="ml-2 text-[0.625rem] text-ink-400">on card</span>}
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="border-t border-ink-200 pt-3">
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-500 uppercase">
                Other
              </p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => addElement('static', { text: 'Text' })}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-ink-700 hover:bg-ink-100"
                >
                  <Type className="h-4 w-4 text-ink-400" />
                  Fixed text
                </button>
                <button
                  type="button"
                  onClick={() =>
                    addElement('qr', { text: '{{loginId}}', width: 20, height: 12.6 })
                  }
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-ink-700 hover:bg-ink-100"
                >
                  <QrCode className="h-4 w-4 text-ink-400" />
                  QR code
                </button>
              </div>
            </div>

            <div className="border-t border-ink-200 pt-3">
              <input
                ref={artworkInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  uploadArtwork(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                loading={uploading}
                onClick={() => artworkInput.current?.click()}
              >
                <ImageIcon className="h-4 w-4" />
                {design[face]?.artwork?.url ? `Replace ${face} artwork` : `Upload ${face} artwork`}
              </Button>
              <p className="mt-1.5 text-xs text-ink-500">
                Upload the printed background at {Math.round((design.widthMm / 25.4) * design.dpi)} x{' '}
                {Math.round((design.heightMm / 25.4) * design.dpi)} px or larger.
              </p>
            </div>
          </CardBody>
        </Card>

        {/* ----------------------------- canvas ------------------------------ */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-ink-100 p-0.5">
              {['front', 'back'].map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => {
                    setFace(side);
                    setSelectedId(null);
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                    face === side ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-600'
                  }`}
                >
                  {side}
                </button>
              ))}
            </div>
            <span className="text-xs text-ink-500">
              {design.widthMm} x {design.heightMm} mm at {design.dpi} DPI &middot;{' '}
              {faceElements.length} element{faceElements.length === 1 ? '' : 's'}
            </span>
          </div>

          {detecting && (
            <div className="mb-3 rounded-lg bg-brand-50 p-3 ring-1 ring-brand-200">
              <div className="flex items-center gap-2 text-sm text-brand-800">
                <Wand2 className="h-4 w-4 shrink-0 animate-pulse" />
                Reading the artwork...
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-200">
                <div
                  className="h-full rounded-full bg-brand-600 transition-[width]"
                  style={{ width: `${Math.round((detecting.progress || 0) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {suggestionCount > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-warning-50 p-3 ring-1 ring-warning-200">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning-600" />
              <p className="flex-1 text-sm text-warning-900">
                <span className="font-semibold">{suggestionCount}</span> element
                {suggestionCount === 1 ? '' : 's'} detected from the artwork. Check each one is
                the right field &mdash; anything left unconfirmed blocks activation.
              </p>
              <div className="flex gap-2">
                <Button size="xs" variant="secondary" onClick={discardSuggestions}>
                  Discard
                </Button>
                <Button size="xs" variant="success" onClick={confirmAllSuggestions}>
                  <Check className="h-3.5 w-3.5" />
                  Confirm all
                </Button>
              </div>
            </div>
          )}

          {detectSummary && !suggestionCount && (
            <p className="mb-3 text-xs text-ink-500">
              {detectSummary.failed
                ? `Could not read the artwork automatically (${detectSummary.message}). Place elements by hand.`
                : detectSummary.added
                  ? `Read ${detectSummary.linesRead} line(s) of text from the artwork.`
                  : 'No text found in the artwork - place elements by hand.'}
            </p>
          )}

          <div className="flex justify-center rounded-xl bg-ink-100 p-6">
            <DesignerCanvas
              design={design}
              values={previewValues}
              files={{}}
              face={face}
              width={CANVAS_WIDTH}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={patchElement}
            />
          </div>

          {warnings.length > 0 && (
            <ul className="mt-3 space-y-1">
              {warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-2 text-xs text-ink-600">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-500" />
                  {warning}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ---------------------------- inspector ---------------------------- */}
        <Card className="h-fit">
          <CardHeader title={selected ? 'Element' : 'Card'} />
          {selected ? (
            <ElementInspector
              element={selected}
              fields={fields}
              fonts={fonts}
              onChange={(patch) => patchElement(selected.id, patch)}
              onStyleChange={(patch) => patchStyle(selected.id, patch)}
              onDelete={() => removeElement(selected.id)}
              onDuplicate={() => duplicateElement(selected)}
              onRaise={() => patchElement(selected.id, { z: (selected.z || 0) + 1 })}
              onLower={() => patchElement(selected.id, { z: Math.max(0, (selected.z || 0) - 1) })}
            />
          ) : (
            <CardBody className="space-y-3">
              <Input
                label="Design name"
                value={design.name}
                onChange={(e) => {
                  setDesign((c) => ({ ...c, name: e.target.value }));
                  setDirty(true);
                }}
              />
              <div className="grid grid-cols-2 gap-2.5">
                <Input
                  label="Width (mm)"
                  type="number"
                  value={design.widthMm}
                  onChange={(e) => {
                    setDesign((c) => ({ ...c, widthMm: Number(e.target.value) }));
                    setDirty(true);
                  }}
                />
                <Input
                  label="Height (mm)"
                  type="number"
                  value={design.heightMm}
                  onChange={(e) => {
                    setDesign((c) => ({ ...c, heightMm: Number(e.target.value) }));
                    setDirty(true);
                  }}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={design.hasBack}
                  onChange={(e) => {
                    setDesign((c) => ({ ...c, hasBack: e.target.checked }));
                    setDirty(true);
                  }}
                  className="h-4 w-4 rounded border-ink-300"
                />
                This card has a back
              </label>
              {design[face]?.artwork?.url && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const result = await cardDesignsApi.removeArtwork(id, face);
                    setDesign((c) => ({ ...c, [face]: result.design[face] }));
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Remove {face} artwork
                </Button>
              )}
            </CardBody>
          )}
        </Card>
      </div>

      {/* Print-accurate render, straight from the renderer production uses. */}
      <Modal open={Boolean(renderUrl)} onClose={() => setRenderUrl(null)} title="Print preview">
        {renderUrl && (
          <div className="flex flex-col items-center gap-3">
            <img
              src={renderUrl}
              alt={`Rendered ${face} of the card`}
              className="max-h-[70vh] rounded-lg shadow ring-1 ring-ink-900/10"
            />
            <p className="text-xs text-ink-500">
              Rendered by the same code that produces the print files.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={blocked}
        onClose={cancelLeave}
        title="Leave without saving?"
        footer={
          <>
            <Button variant="secondary" onClick={cancelLeave}>
              Stay
            </Button>
            <Button variant="danger" onClick={confirmLeave}>
              Discard changes
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          This design has changes that have not been saved yet.
        </p>
      </Modal>
    </>
  );
}
