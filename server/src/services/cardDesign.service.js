const CardDesign = require('../models/CardDesign');
const ApiError = require('../utils/ApiError');
const { isPrintable } = require('../constants/fieldTypes');

/** Identity values every design may print without the form declaring them. */
const IMPLICIT_KEYS = {
  loginId: { label: 'Login ID', type: 'short_text' },
  name: { label: 'Account name', type: 'short_text' },
};

/**
 * The fields a design is allowed to bind to.
 *
 * Archived fields are included deliberately: a form may have moved on while
 * approved records still carry the old value, and a design bound to one should
 * keep rendering rather than silently blanking.
 */
function bindableFields(form) {
  const fields = (form.fields || []).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    archived: !!f.archived,
    printable: isPrintable(f.type),
  }));

  for (const [key, meta] of Object.entries(IMPLICIT_KEYS)) {
    fields.push({ key, label: meta.label, type: meta.type, archived: false, printable: true });
  }
  return fields;
}

/**
 * Rejects elements bound to field keys the form does not have.
 *
 * Without this the designer accepts a typo, every preview renders an empty
 * box, and nothing reports an error until a batch of blank cards comes off
 * the printer. The same silent-failure shape as unchecked duplicate keys.
 */
function assertValidFieldKeys(form, elements = []) {
  const available = bindableFields(form);
  const known = new Set(available.map((f) => f.key));

  const unknown = [
    ...new Set(
      elements
        .filter((el) => el.type === 'field' && el.fieldKey && !known.has(el.fieldKey))
        .map((el) => el.fieldKey)
    ),
  ];

  if (unknown.length) {
    throw ApiError.badRequest(
      `${unknown.length === 1 ? 'Field' : 'Fields'} ${unknown
        .map((k) => `"${k}"`)
        .join(', ')} ${unknown.length === 1 ? 'does' : 'do'} not exist on this form.`,
      { code: 'UNKNOWN_CARD_FIELD', details: { unknown, available: [...known] } }
    );
  }
}

/**
 * Copies the current field type onto each bound element.
 *
 * The renderer decides "draw a photograph" or "draw text" from `fieldType`,
 * so it is stored with the element rather than looked up at print time - the
 * form may have changed by then.
 */
function syncFieldTypes(form, elements = []) {
  const byKey = new Map(bindableFields(form).map((f) => [f.key, f.type]));
  return elements.map((el) =>
    el.type === 'field' && el.fieldKey ? { ...el, fieldType: byKey.get(el.fieldKey) || null } : el
  );
}

/**
 * Makes one design the active one for its form.
 *
 * The unique partial index guarantees only one active design per form, so the
 * previous holder is demoted first. Done in this order because the index would
 * otherwise reject the write, and reporting "a design is already active" to a
 * user who just clicked Activate is not a useful answer - replacing is what
 * they meant.
 */
async function activate(design) {
  await CardDesign.updateMany(
    { form: design.form, status: 'active', _id: { $ne: design._id } },
    { $set: { status: 'draft' } }
  );
  design.status = 'active';
  await design.save();
  return design;
}

/** Warnings worth showing in the designer, none of which block saving. */
function lint(design, form) {
  const warnings = [];
  const elements = design.elements || [];

  if (!elements.length) warnings.push('This design has no elements yet.');

  const unreviewed = elements.filter((el) => el.suggested).length;
  if (unreviewed) {
    warnings.push(
      `${unreviewed} element${unreviewed === 1 ? '' : 's'} detected from the artwork ` +
        `${unreviewed === 1 ? 'is' : 'are'} not confirmed yet - check each one is the right field.`
    );
  }
  if (!design.front?.artwork?.publicId) {
    warnings.push('No front artwork uploaded - cards will print on a plain background.');
  }
  if (design.hasBack && !design.back?.artwork?.publicId) {
    warnings.push('The back is enabled but has no artwork.');
  }

  for (const el of elements) {
    if (el.x + el.width > 100.5 || el.y + el.height > 100.5 || el.x < -0.5 || el.y < -0.5) {
      warnings.push(`"${elementLabel(el, form)}" extends past the edge of the card.`);
    }
  }

  // A photograph box that is not roughly 3:4 will crop faces oddly, because
  // the portal captures portrait photos at that ratio.
  for (const el of elements) {
    if (el.type === 'field' && el.fieldType === 'photo' && design.widthMm && design.heightMm) {
      const boxRatio = (el.width * design.widthMm) / (el.height * design.heightMm);
      if (boxRatio < 0.62 || boxRatio > 0.88) {
        warnings.push(
          `The photo box is not the 3:4 shape the portal captures - faces may crop badly.`
        );
        break;
      }
    }
  }

  const required = (form?.fields || []).filter((f) => f.required && !f.archived);
  const bound = new Set(elements.filter((e) => e.type === 'field').map((e) => e.fieldKey));
  const unused = required.filter((f) => !bound.has(f.key));
  if (unused.length && unused.length <= 6) {
    warnings.push(`Not shown on the card: ${unused.map((f) => f.label).join(', ')}.`);
  }

  return warnings;
}

function elementLabel(el, form) {
  if (el.type === 'static') return el.text?.slice(0, 30) || 'Text';
  if (el.type === 'qr') return 'QR code';
  if (el.type === 'image') return 'Image';
  const field = (form?.fields || []).find((f) => f.key === el.fieldKey);
  return field?.label || el.fieldKey || 'Field';
}

module.exports = {
  bindableFields,
  assertValidFieldKeys,
  syncFieldTypes,
  activate,
  lint,
  elementLabel,
  IMPLICIT_KEYS,
};
