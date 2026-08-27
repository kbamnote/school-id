import { useEffect, useState } from 'react';
import { CreditCard, RotateCw } from 'lucide-react';
import CardPreview from '../cardDesigner/CardPreview.jsx';
import { portalCardApi } from '../../api/cardDesignsApi.js';

const PREVIEW_WIDTH = 240;

/**
 * The card, building itself as the person fills the form in.
 *
 * Drawn in the browser from the same layout the print renderer uses, so what
 * someone watches take shape is what actually gets printed. It is deliberately
 * forgiving: a form with no active card design renders nothing at all rather
 * than an error, because most forms will not have one.
 */
export default function LiveCardPreview({ formId, values, files, userName, loginId }) {
  const [design, setDesign] = useState(null);
  const [face, setFace] = useState('front');

  useEffect(() => {
    let cancelled = false;
    portalCardApi
      .designForForm(formId)
      .then((result) => {
        if (!cancelled) setDesign(result);
      })
      // No design, or no permission to see one, simply means no preview.
      .catch(() => {
        if (!cancelled) setDesign(null);
      });
    return () => {
      cancelled = true;
    };
  }, [formId]);

  if (!design) return null;

  // The identity fields a design may print without the form declaring them.
  const previewValues = { ...values, name: userName || '', loginId: loginId || '' };

  return (
    <div className="rounded-card border border-ink-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CreditCard size={16} className="text-brand-600" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-ink-800">Your card</h2>
        </div>
        {design.hasBack && (
          <button
            type="button"
            onClick={() => setFace((f) => (f === 'front' ? 'back' : 'front'))}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-ink-100"
          >
            <RotateCw size={13} aria-hidden="true" />
            {face === 'front' ? 'See back' : 'See front'}
          </button>
        )}
      </div>

      <div className="flex justify-center">
        <CardPreview
          design={design}
          values={previewValues}
          files={files}
          face={face}
          width={PREVIEW_WIDTH}
        />
      </div>

      <p className="mt-3 text-center text-xs leading-relaxed text-ink-500">
        This updates as you type. Final colours and sharpness come from the printer.
      </p>
    </div>
  );
}
