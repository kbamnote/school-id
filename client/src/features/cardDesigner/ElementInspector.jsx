import { Trash2, MoveUp, MoveDown, Copy } from 'lucide-react';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';

const ALIGNMENTS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
];

const VERTICAL = [
  { value: 'top', label: 'Top' },
  { value: 'middle', label: 'Middle' },
  { value: 'bottom', label: 'Bottom' },
];

const TRANSFORMS = [
  { value: 'none', label: 'As entered' },
  { value: 'uppercase', label: 'UPPERCASE' },
  { value: 'capitalize', label: 'Capitalised' },
];

/** A labelled number input that reports percentages of the card. */
function NumberRow({ label, value, onChange, step = 0.5, min, max, suffix = '%' }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-600">{label}</span>
      <div className="relative">
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const next = e.target.value === '' ? '' : Number(e.target.value);
            if (next === '' || Number.isFinite(next)) onChange(next === '' ? 0 : next);
          }}
          className="h-9 w-full rounded-lg pr-7 pl-2.5 text-sm ring-1 ring-inset ring-ink-300 focus:ring-2 focus:ring-brand-500"
        />
        <span className="absolute top-1/2 right-2 -translate-y-1/2 text-xs text-ink-400">
          {suffix}
        </span>
      </div>
    </label>
  );
}

export default function ElementInspector({
  element,
  fields,
  fonts,
  onChange,
  onStyleChange,
  onDelete,
  onDuplicate,
  onRaise,
  onLower,
}) {
  if (!element) {
    return (
      <div className="p-4 text-sm text-ink-500">
        Select an element on the card to edit it, or add one from the panel on the left.
      </div>
    );
  }

  const style = element.style || {};
  const isText = element.type === 'field' || element.type === 'static';
  const isImage =
    element.type === 'image' ||
    (element.type === 'field' && ['photo', 'signature'].includes(element.fieldType));

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-1.5">
        <Button size="xs" variant="ghost" onClick={onRaise} title="Bring forward">
          <MoveUp className="h-3.5 w-3.5" />
        </Button>
        <Button size="xs" variant="ghost" onClick={onLower} title="Send backward">
          <MoveDown className="h-3.5 w-3.5" />
        </Button>
        <Button size="xs" variant="ghost" onClick={onDuplicate} title="Duplicate">
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <span className="flex-1" />
        <Button size="xs" variant="ghost" onClick={onDelete} title="Delete">
          <Trash2 className="h-3.5 w-3.5 text-danger-600" />
        </Button>
      </div>

      {element.type === 'field' && (
        <Select
          label="Shows"
          value={element.fieldKey || ''}
          onChange={(e) => {
            const key = e.target.value;
            const field = fields.find((f) => f.key === key);
            onChange({ fieldKey: key, fieldType: field?.type || null });
          }}
          options={fields
            .filter((f) => f.type !== 'heading')
            .map((f) => ({
              value: f.key,
              label: f.archived ? `${f.label} (removed from form)` : f.label,
            }))}
        />
      )}

      {element.type === 'static' && (
        <Input
          label="Text"
          value={element.text || ''}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      )}

      {element.type === 'qr' && (
        <Input
          label="QR contains"
          hint="Use {{loginId}} to insert each person's ID."
          value={element.text || ''}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <NumberRow label="Left" value={element.x} onChange={(v) => onChange({ x: v })} />
        <NumberRow label="Top" value={element.y} onChange={(v) => onChange({ y: v })} />
        <NumberRow label="Width" value={element.width} onChange={(v) => onChange({ width: v })} />
        <NumberRow label="Height" value={element.height} onChange={(v) => onChange({ height: v })} />
      </div>

      {isText && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <NumberRow
              label="Font size"
              value={style.fontSize}
              step={0.2}
              min={0.5}
              max={40}
              onChange={(v) => onStyleChange({ fontSize: v })}
            />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-600">Colour</span>
              <input
                type="color"
                value={style.color || '#111111'}
                onChange={(e) => onStyleChange({ color: e.target.value })}
                className="h-9 w-full cursor-pointer rounded-lg ring-1 ring-inset ring-ink-300"
              />
            </label>
          </div>

          <Select
            label="Font"
            value={style.fontFamily || 'Helvetica'}
            onChange={(e) => onStyleChange({ fontFamily: e.target.value })}
            options={(fonts || []).map((f) => ({ value: f, label: f }))}
          />

          <div className="grid grid-cols-2 gap-2.5">
            <Select
              label="Align"
              value={style.align || 'left'}
              onChange={(e) => onStyleChange({ align: e.target.value })}
              options={ALIGNMENTS}
            />
            <Select
              label="Vertical"
              value={style.verticalAlign || 'top'}
              onChange={(e) => onStyleChange({ verticalAlign: e.target.value })}
              options={VERTICAL}
            />
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant={style.fontWeight === 'bold' ? 'primary' : 'secondary'}
              onClick={() =>
                onStyleChange({ fontWeight: style.fontWeight === 'bold' ? 'normal' : 'bold' })
              }
            >
              Bold
            </Button>
            <Button
              size="sm"
              variant={style.italic ? 'primary' : 'secondary'}
              onClick={() => onStyleChange({ italic: !style.italic })}
            >
              Italic
            </Button>
          </div>

          {element.type === 'field' && (
            <>
              <Select
                label="Letter case"
                value={style.transform || 'none'}
                onChange={(e) => onStyleChange({ transform: e.target.value })}
                options={TRANSFORMS}
              />
              <div className="grid grid-cols-2 gap-2.5">
                <Input
                  label="Before"
                  placeholder="Blood group: "
                  value={style.prefix || ''}
                  onChange={(e) => onStyleChange({ prefix: e.target.value })}
                />
                <Input
                  label="After"
                  value={style.suffix || ''}
                  onChange={(e) => onStyleChange({ suffix: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={style.hideIfEmpty !== false}
                  onChange={(e) => onStyleChange({ hideIfEmpty: e.target.checked })}
                  className="h-4 w-4 rounded border-ink-300"
                />
                Hide when this person has no value
              </label>
            </>
          )}
        </>
      )}

      {isImage && (
        <div className="grid grid-cols-2 gap-2.5">
          <Select
            label="Fit"
            value={style.objectFit || 'cover'}
            onChange={(e) => onStyleChange({ objectFit: e.target.value })}
            options={[
              { value: 'cover', label: 'Fill the box' },
              { value: 'contain', label: 'Fit inside' },
            ]}
          />
          <NumberRow
            label="Corner radius"
            value={style.radius || 0}
            min={0}
            max={50}
            onChange={(v) => onStyleChange({ radius: v })}
          />
        </div>
      )}
    </div>
  );
}
