import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { resolveText, isImageElement, resolveImageSrc } from './resolveValue.js';
import { useAuthedImage } from '../../components/ui/AuthedImage.jsx';

/**
 * Draws a card design at any pixel size.
 *
 * Shared by the designer canvas, the end-user's live preview and the review
 * screen, so all three show the same thing. Every coordinate in a design is a
 * percentage, which is what lets one component serve a 260px phone preview and
 * a 900px designer canvas without a scale factor being passed around.
 */

/** Renders a QR payload to a data URL, regenerating only when the text changes. */
function useQrDataUrl(text, color) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!text) {
      setUrl(null);
      return undefined;
    }
    let cancelled = false;
    QRCode.toDataURL(text, { margin: 0, width: 256, color: { dark: color || '#000000', light: '#0000' } })
      .then((dataUrl) => {
        if (!cancelled) setUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [text, color]);

  return url;
}

function QrElement({ element, values, cardHeight }) {
  const content = useMemo(
    () => (element.text || '').replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? '')),
    [element.text, values]
  );
  const src = useQrDataUrl(content.trim(), element.style?.color);
  if (!src) return null;
  return <img src={src} alt="" className="h-full w-full object-contain" draggable={false} />;
}

/** Photographs and signatures come from the authenticated file route. */
function ImageElement({ element, files, cardHeight }) {
  const style = element.style || {};
  const src = useAuthedImage(resolveImageSrc(element, files));

  if (!src) {
    // An empty photo box is shown as a soft placeholder rather than nothing,
    // so the student can see where their photograph will land.
    return (
      <div className="flex h-full w-full items-center justify-center rounded-[inherit] border border-dashed border-ink-300 bg-ink-100/60">
        <span className="text-ink-400" style={{ fontSize: Math.max(7, cardHeight * 0.022) }}>
          Photo
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className="h-full w-full rounded-[inherit]"
      style={{ objectFit: style.objectFit || 'cover' }}
    />
  );
}

function ElementBody({ element, values, files, cardWidth, cardHeight }) {
  const style = element.style || {};

  if (isImageElement(element)) {
    return <ImageElement element={element} files={files} cardHeight={cardHeight} />;
  }

  if (element.type === 'qr') {
    return <QrElement element={element} values={values} cardHeight={cardHeight} />;
  }

  const text = resolveText(element, values);
  if (!text && style.hideIfEmpty !== false) return null;

  const justify =
    style.verticalAlign === 'middle'
      ? 'center'
      : style.verticalAlign === 'bottom'
        ? 'flex-end'
        : 'flex-start';

  return (
    <div
      className="flex h-full w-full overflow-hidden"
      style={{
        flexDirection: 'column',
        justifyContent: justify,
        // Font size is a percentage of card height, matching the print renderer.
        fontSize: (style.fontSize / 100) * cardHeight,
        fontFamily: `${style.fontFamily || 'Helvetica'}, Arial, sans-serif`,
        fontWeight: style.fontWeight || 'normal',
        fontStyle: style.italic ? 'italic' : 'normal',
        color: style.color || '#111111',
        textAlign: style.align || 'left',
        lineHeight: style.lineHeight || 1.25,
        letterSpacing: style.letterSpacing ? (style.letterSpacing / 100) * cardHeight : undefined,
        wordBreak: 'break-word',
      }}
    >
      <span>{text}</span>
    </div>
  );
}

export default function CardPreview({
  design,
  values = {},
  files = {},
  face = 'front',
  width = 320,
  className = '',
  selectedId = null,
  onSelect = null,
  children = null,
}) {
  const containerRef = useRef(null);
  // Every hook runs before the null guard below - a design arriving or being
  // cleared must not change how many hooks this component calls.
  const artworkUrl = useAuthedImage(design?.[face]?.artwork?.url || null);

  if (!design) return null;

  const ratio = (design.heightMm || 86) / (design.widthMm || 54);
  const height = width * ratio;

  const faceConfig = design[face] || {};
  const elements = (design.elements || [])
    .filter((el) => (el.face || 'front') === face)
    .sort((a, b) => (a.z || 0) - (b.z || 0));

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg shadow-sm ring-1 ring-ink-900/10 ${className}`}
      style={{
        width,
        height,
        backgroundColor: faceConfig.backgroundColor || '#ffffff',
      }}
    >
      {artworkUrl && (
        <img
          src={artworkUrl}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-fill"
        />
      )}

      {elements.map((el) => (
        <div
          key={el.id}
          onPointerDown={onSelect ? (e) => onSelect(el.id, e) : undefined}
          className={[
            'absolute',
            onSelect ? 'cursor-move' : 'pointer-events-none',
            selectedId === el.id ? 'outline outline-2 outline-brand-500' : '',
          ].join(' ')}
          style={{
            left: `${el.x}%`,
            top: `${el.y}%`,
            width: `${el.width}%`,
            height: `${el.height}%`,
            zIndex: el.z || 0,
            borderRadius: el.style?.radius
              ? `${(el.style.radius / 100) * Math.min(width * (el.width / 100), height * (el.height / 100))}px`
              : undefined,
            backgroundColor: el.style?.backgroundColor || undefined,
          }}
        >
          <ElementBody
            element={el}
            values={values}
            files={files}
            cardWidth={width}
            cardHeight={height}
          />
        </div>
      ))}

      {children}
    </div>
  );
}
