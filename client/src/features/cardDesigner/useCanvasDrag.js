import { useCallback, useRef, useState } from 'react';

/** Keeps a box inside sane bounds without snapping it hard to the edge. */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const round = (n) => Math.round(n * 100) / 100;

/**
 * Dragging and resizing on the card canvas.
 *
 * Pointer deltas are converted to PERCENTAGES of the canvas before they touch
 * the element, so a design dragged on a 900px canvas lands in exactly the same
 * place when rendered at 638px for print. Doing the conversion here rather
 * than in the component is what keeps that guarantee in one place.
 *
 * Pointer capture is used so a fast drag that leaves the canvas keeps
 * tracking instead of dropping the element wherever the cursor exited.
 */
export default function useCanvasDrag({ canvasRef, onChange, gridSize = 0 }) {
  const [dragging, setDragging] = useState(null);
  const stateRef = useRef(null);

  const snap = useCallback(
    (value) => (gridSize > 0 ? Math.round(value / gridSize) * gridSize : value),
    [gridSize]
  );

  const begin = useCallback(
    (event, element, mode = 'move', handle = null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      event.preventDefault();
      event.stopPropagation();

      const rect = canvas.getBoundingClientRect();
      stateRef.current = {
        mode,
        handle,
        id: element.id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        rect,
        origin: {
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
        },
      };
      setDragging({ id: element.id, mode });

      /*
       * Capture AFTER the drag state exists, and never let it break the drag.
       * setPointerCapture throws for a pointer id the browser does not
       * consider active; doing it first meant one throw left the element
       * selected but unmovable, with nothing reported.
       */
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Without capture the drag still tracks while the pointer stays over
        // the canvas, which is the common case.
      }
    },
    [canvasRef]
  );

  const move = useCallback(
    (event) => {
      const state = stateRef.current;
      if (!state || event.pointerId !== state.pointerId) return;

      const dxPct = ((event.clientX - state.startX) / state.rect.width) * 100;
      const dyPct = ((event.clientY - state.startY) / state.rect.height) * 100;
      const { origin } = state;

      let next;
      if (state.mode === 'move') {
        next = {
          x: round(snap(clamp(origin.x + dxPct, -10, 110 - origin.width))),
          y: round(snap(clamp(origin.y + dyPct, -10, 110 - origin.height))),
        };
      } else {
        // Each handle moves its own two edges. Width and height are floored at
        // 1% so an element can never be resized into something unclickable.
        const h = state.handle || 'se';
        const patch = { ...origin };

        if (h.includes('e')) patch.width = clamp(origin.width + dxPct, 1, 140);
        if (h.includes('s')) patch.height = clamp(origin.height + dyPct, 1, 140);
        if (h.includes('w')) {
          const width = clamp(origin.width - dxPct, 1, 140);
          patch.x = origin.x + (origin.width - width);
          patch.width = width;
        }
        if (h.includes('n')) {
          const height = clamp(origin.height - dyPct, 1, 140);
          patch.y = origin.y + (origin.height - height);
          patch.height = height;
        }

        next = {
          x: round(snap(patch.x)),
          y: round(snap(patch.y)),
          width: round(snap(patch.width)),
          height: round(snap(patch.height)),
        };
      }

      onChange(state.id, next);
    },
    [onChange, snap]
  );

  const end = useCallback(
    (event) => {
      const state = stateRef.current;
      if (!state || (event && event.pointerId !== state.pointerId)) return;
      stateRef.current = null;
      setDragging(null);
    },
    []
  );

  return { begin, move, end, dragging };
}
