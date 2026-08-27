const sharp = require('sharp');
const QRCode = require('qrcode');
const storage = require('./storage');
const logger = require('../utils/logger');

/**
 * Card rendering.
 *
 * The value rules in `resolveText` are mirrored EXACTLY by the browser
 * preview (client/src/features/cardDesigner/resolveValue.js). If the two ever
 * disagree, a student approves one card and receives a different one - so any
 * change here must be made in both places.
 */

/** Escapes text for safe inclusion in the SVG overlay. */
function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Applies the element's text transform. */
function applyTransform(text, transform) {
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'capitalize') {
    return text.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return text;
}

/**
 * Produces the string an element should display for one record.
 * Returns '' when there is nothing to show.
 */
function resolveText(element, values) {
  if (element.type === 'static') {
    return applyTransform(element.text || '', element.style?.transform);
  }

  if (element.type !== 'field' || !element.fieldKey) return '';

  const raw = values[element.fieldKey];
  if (raw === undefined || raw === null || raw === '') return '';

  let text;
  if (Array.isArray(raw)) {
    text = raw.join(', ');
  } else if (typeof raw === 'object') {
    // An address flattens onto one line; a card rarely has room for more.
    text = [raw.line1, raw.line2, raw.city, raw.state, raw.pincode].filter(Boolean).join(', ');
  } else if (element.fieldType === 'date') {
    const d = new Date(raw);
    text = Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString('en-GB');
  } else {
    text = String(raw);
  }

  if (!text) return '';

  const { prefix = '', suffix = '' } = element.style || {};
  return applyTransform(`${prefix}${text}${suffix}`, element.style?.transform);
}

/** True when the element draws an image rather than text. */
function isImageElement(element) {
  return (
    element.type === 'image' ||
    (element.type === 'field' && ['photo', 'signature'].includes(element.fieldType))
  );
}

/**
 * Wraps text to fit the element's box.
 *
 * Approximates character width at 0.52em, which is close enough for the
 * proportional faces used on cards and avoids shipping a font-metrics library
 * just to decide where a name breaks.
 */
function wrapText(text, boxWidthPx, fontSizePx) {
  const charsPerLine = Math.max(1, Math.floor(boxWidthPx / (fontSizePx * 0.52)));
  if (text.length <= charsPerLine) return [text];

  const words = text.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= charsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      // A single word longer than the line is hard-split rather than
      // overflowing the card edge.
      if (word.length > charsPerLine) {
        let rest = word;
        while (rest.length > charsPerLine) {
          lines.push(rest.slice(0, charsPerLine));
          rest = rest.slice(charsPerLine);
        }
        current = rest;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Builds one SVG containing every text element for a face. */
function buildTextSvg(elements, values, width, height) {
  const parts = [];

  for (const element of elements) {
    if (isImageElement(element) || element.type === 'qr') continue;

    const text = resolveText(element, values);
    if (!text && element.style?.hideIfEmpty !== false) continue;

    const s = element.style || {};
    const boxX = (element.x / 100) * width;
    const boxY = (element.y / 100) * height;
    const boxW = (element.width / 100) * width;
    const boxH = (element.height / 100) * height;
    // Font size is a percentage of card height, so it scales with the card.
    const fontPx = Math.max(6, (s.fontSize / 100) * height);
    const lineHeight = fontPx * (s.lineHeight || 1.25);

    const lines = wrapText(text, boxW, fontPx);

    const anchor = s.align === 'center' ? 'middle' : s.align === 'right' ? 'end' : 'start';
    const textX = s.align === 'center' ? boxX + boxW / 2 : s.align === 'right' ? boxX + boxW : boxX;

    const blockHeight = lines.length * lineHeight;
    let firstBaseline;
    if (s.verticalAlign === 'middle') {
      firstBaseline = boxY + (boxH - blockHeight) / 2 + fontPx * 0.82;
    } else if (s.verticalAlign === 'bottom') {
      firstBaseline = boxY + boxH - blockHeight + fontPx * 0.82;
    } else {
      firstBaseline = boxY + fontPx * 0.82;
    }

    if (s.backgroundColor) {
      parts.push(
        `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${s.radius || 0}" fill="${escapeXml(s.backgroundColor)}"/>`
      );
    }

    lines.forEach((line, i) => {
      parts.push(
        `<text x="${textX}" y="${firstBaseline + i * lineHeight}" ` +
          `font-family="${escapeXml(s.fontFamily || 'Helvetica')}, Arial, sans-serif" ` +
          `font-size="${fontPx}" font-weight="${s.fontWeight || 'normal'}" ` +
          `${s.italic ? 'font-style="italic" ' : ''}` +
          `${s.letterSpacing ? `letter-spacing="${(s.letterSpacing / 100) * height}" ` : ''}` +
          `fill="${escapeXml(s.color || '#111111')}" text-anchor="${anchor}">` +
          `${escapeXml(line)}</text>`
      );
    });
  }

  if (!parts.length) return null;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join('')}</svg>`
  );
}

/**
 * Reads an asset for compositing, whatever storage backs it.
 *
 * Returns null rather than throwing so one missing photograph produces a card
 * with a gap instead of failing the whole lot - but it logs loudly, because a
 * silently photo-less batch is worse than a late error.
 */
async function readAsset(file) {
  if (!file?.publicId) return null;
  try {
    return await storage.read(file.publicId, file.provider);
  } catch (err) {
    logger.warn('Card render: asset unavailable', {
      publicId: file.publicId,
      provider: file.provider || 'active driver',
      message: err.message,
    });
    return null;
  }
}

/**
 * Renders one face to a PNG buffer.
 * Artwork first, then images, then all text in a single SVG layer on top.
 */
async function renderFace(design, face, { values, files }) {
  const { width, height } = design.pixelSize;
  const faceConfig = design[face] || {};
  const elements = design.elementsFor(face);

  // Base: the uploaded artwork, or a flat colour if there is none.
  let base;
  const artwork = await readAsset(faceConfig.artwork);
  if (artwork) {
    base = sharp(artwork).resize(width, height, { fit: 'fill' });
  } else {
    base = sharp({
      create: {
        width,
        height,
        channels: 4,
        background: faceConfig.backgroundColor || '#ffffff',
      },
    });
  }

  const composites = [];

  for (const element of elements) {
    // --- photographs and signatures ---
    if (isImageElement(element)) {
      const file = element.fieldKey ? files[element.fieldKey] : null;
      const buffer = await readAsset(file);
      if (!buffer) continue;

      const boxW = Math.max(1, Math.round((element.width / 100) * width));
      const boxH = Math.max(1, Math.round((element.height / 100) * height));

      let img = sharp(buffer).resize(boxW, boxH, {
        fit: element.style?.objectFit === 'contain' ? 'inside' : 'cover',
        position: 'centre',
        ...(element.style?.objectFit === 'contain'
          ? { background: { r: 255, g: 255, b: 255, alpha: 0 } }
          : {}),
      });

      if (element.style?.radius) {
        const r = Math.round((element.style.radius / 100) * Math.min(boxW, boxH));
        const mask = Buffer.from(
          `<svg width="${boxW}" height="${boxH}"><rect width="${boxW}" height="${boxH}" rx="${r}" ry="${r}" fill="#fff"/></svg>`
        );
        img = img.composite([{ input: mask, blend: 'dest-in' }]);
      }

      composites.push({
        input: await img.png().toBuffer(),
        left: Math.round((element.x / 100) * width),
        top: Math.round((element.y / 100) * height),
      });
      continue;
    }

    // --- QR codes ---
    if (element.type === 'qr') {
      // The template may reference field values, e.g. "ID: {{loginId}}".
      const content = (element.text || '').replace(/\{\{(\w+)\}\}/g, (_, key) =>
        String(values[key] ?? '')
      );
      if (!content.trim()) continue;

      const boxW = Math.max(32, Math.round((element.width / 100) * width));
      try {
        const qr = await QRCode.toBuffer(content, {
          width: boxW,
          margin: 0,
          color: { dark: element.style?.color || '#000000', light: '#0000' },
        });
        composites.push({
          input: qr,
          left: Math.round((element.x / 100) * width),
          top: Math.round((element.y / 100) * height),
        });
      } catch (err) {
        logger.warn('Card render: QR failed', err.message);
      }
    }
  }

  // Text last, so it always sits above photographs.
  const textSvg = buildTextSvg(elements, values, width, height);
  if (textSvg) composites.push({ input: textSvg, left: 0, top: 0 });

  return base.composite(composites).png().toBuffer();
}

/** Renders both faces of a card for one submission. */
async function renderCard(design, submission) {
  const values = {
    ...(submission.data || {}),
    // Identity fields that are not form answers but are usually printed.
    loginId: submission.userLoginId || '',
    name: submission.userName || '',
  };
  const files =
    submission.files instanceof Map
      ? Object.fromEntries(submission.files)
      : submission.files || {};

  const front = await renderFace(design, 'front', { values, files });
  const back = design.hasBack ? await renderFace(design, 'back', { values, files }) : null;

  return { front, back };
}

module.exports = {
  resolveText,
  isImageElement,
  wrapText,
  renderFace,
  renderCard,
  escapeXml,
};
