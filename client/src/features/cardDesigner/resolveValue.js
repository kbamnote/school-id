/**
 * Card value rules for the browser.
 *
 * MIRRORS server/src/services/card.service.js `resolveText` exactly. The
 * student approves what this file draws and receives what the server renders,
 * so the two must agree - any change to one belongs in the other on the same
 * commit.
 */

function applyTransform(text, transform) {
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'capitalize') return text.replace(/\b\w/g, (c) => c.toUpperCase());
  return text;
}

/** The string an element shows for a set of answers. '' means nothing to show. */
export function resolveText(element, values = {}) {
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
export function isImageElement(element) {
  return (
    element.type === 'image' ||
    (element.type === 'field' && ['photo', 'signature'].includes(element.fieldType))
  );
}

/**
 * The image an element should show.
 *
 * Prefers a local object URL so a photo appears the instant it is chosen,
 * before any upload finishes - that immediacy is the point of a live preview.
 */
export function resolveImageSrc(element, files = {}) {
  if (element.type === 'image') return element.src || null;
  if (!element.fieldKey) return null;
  const file = files[element.fieldKey];
  if (!file) return null;
  return file.localUrl || file.url || null;
}

/** Placeholder answers so an empty form still shows the card's shape. */
export function sampleValues(fields = []) {
  const values = {};
  for (const field of fields) {
    if (field.type === 'photo' || field.type === 'signature') continue;
    if (field.type === 'heading') continue;
    values[field.key] = field.type === 'date' ? new Date().toISOString() : field.label;
  }
  return values;
}
