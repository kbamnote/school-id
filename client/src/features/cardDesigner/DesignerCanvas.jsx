import { useRef } from 'react';
import CardPreview from './CardPreview.jsx';
import useCanvasDrag from './useCanvasDrag.js';

const HANDLES = [
  { key: 'nw', className: '-top-1 -left-1 cursor-nwse-resize' },
  { key: 'ne', className: '-top-1 -right-1 cursor-nesw-resize' },
  { key: 'sw', className: '-bottom-1 -left-1 cursor-nesw-resize' },
  { key: 'se', className: '-bottom-1 -right-1 cursor-nwse-resize' },
];

/**
 * The editable card surface.
 *
 * Rendering is delegated to the same <CardPreview> the end user sees, with the
 * interaction layer laid over it. Reusing the renderer is deliberate: if the
 * designer drew elements its own way, the admin would position against one
 * rendering and the student would see another.
 */
export default function DesignerCanvas({
  design,
  values,
  files,
  face,
  width,
  selectedId,
  onSelect,
  onChange,
  showGrid = true,
  gridSize = 0,
}) {
  const canvasRef = useRef(null);
  const drag = useCanvasDrag({ canvasRef, onChange, gridSize });

  const elements = (design.elements || []).filter((el) => (el.face || 'front') === face);
  const selected = elements.find((el) => el.id === selectedId);

  const ratio = (design.heightMm || 86) / (design.widthMm || 54);
  const height = width * ratio;

  return (
    <div
      ref={canvasRef}
      className="relative touch-none select-none"
      style={{ width, height }}
      onPointerMove={drag.move}
      onPointerUp={drag.end}
      onPointerCancel={drag.end}
      onPointerDown={(e) => {
        // A click on bare canvas clears the selection.
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <CardPreview
        design={design}
        values={values}
        files={files}
        face={face}
        width={width}
        selectedId={selectedId}
        onSelect={(id, event) => {
          onSelect(id);
          const element = elements.find((el) => el.id === id);
          if (element) drag.begin(event, element, 'move');
        }}
      />

      {showGrid && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #0f172a 1px, transparent 1px), linear-gradient(to bottom, #0f172a 1px, transparent 1px)',
            backgroundSize: `${width / 10}px ${height / 10}px`,
          }}
        />
      )}

      {/*
       * Bleed guide. Anything inside the outer 2mm risks being trimmed off by
       * the cutter, which is a mistake that only shows up after printing.
       */}
      <div
        className="pointer-events-none absolute rounded border border-dashed border-danger-400/50"
        style={{
          left: `${(2 / (design.widthMm || 54)) * 100}%`,
          top: `${(2 / (design.heightMm || 86)) * 100}%`,
          right: `${(2 / (design.widthMm || 54)) * 100}%`,
          bottom: `${(2 / (design.heightMm || 86)) * 100}%`,
        }}
      />

      {selected && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: `${selected.x}%`,
            top: `${selected.y}%`,
            width: `${selected.width}%`,
            height: `${selected.height}%`,
            zIndex: 500,
          }}
        >
          {HANDLES.map((handle) => (
            <button
              key={handle.key}
              type="button"
              aria-label={`Resize ${handle.key}`}
              onPointerDown={(e) => drag.begin(e, selected, 'resize', handle.key)}
              className={`pointer-events-auto absolute h-2.5 w-2.5 rounded-full border border-white bg-brand-600 shadow ${handle.className}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
