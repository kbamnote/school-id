const Form = require('../models/Form');
const FormAssignment = require('../models/FormAssignment');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { slugify } = require('../utils/strings');
const {
  FIELD_TYPES,
  definition,
  isDataBearing,
  isFileField,
  hasOptions,
} = require('../constants/fieldTypes');

/**
 * Turns a label into a stable machine key, unique within the form.
 *
 * Keys are generated once, at the moment a field is added, and then frozen -
 * they are the property names under which answers are stored, so changing one
 * would orphan every answer already collected under the old key.
 */
function generateFieldKey(label, existingKeys = []) {
  const base = slugify(label).replace(/-/g, '_').slice(0, 50) || 'field';
  let candidate = base;
  let n = 1;
  while (existingKeys.includes(candidate)) {
    n += 1;
    candidate = `${base}_${n}`;
  }
  return candidate;
}

/**
 * Normalises a field coming from the builder.
 *
 * Settings that the field's type does not support are dropped rather than
 * stored, so a dropdown cannot carry a stale `minLength` that silently starts
 * applying if the type is later changed.
 */
function normaliseField(input, existingKeys = []) {
  const def = definition(input.type);
  if (!def) throw ApiError.badRequest(`Unknown field type "${input.type}"`);

  const key = input.key || generateFieldKey(input.label || def.label, existingKeys);

  const field = {
    key,
    type: input.type,
    label: (input.label || def.label).trim(),
    placeholder: def.supports?.placeholder ? (input.placeholder || '').trim() : '',
    helpText: (input.helpText || '').trim(),
    // Layout fields can never be "required" - there is nothing to fill in.
    required: def.dataBearing ? Boolean(input.required) : false,
    order: Number.isFinite(input.order) ? input.order : existingKeys.length,
    width: input.width === 'half' ? 'half' : 'full',
    archived: Boolean(input.archived),
  };

  if (hasOptions(input.type)) {
    const options = (input.options || def.defaults.options || [])
      .map((o) => String(o).trim())
      .filter(Boolean);
    if (!options.length) {
      throw ApiError.badRequest(`"${field.label}" needs at least one option.`, {
        details: [{ field: `fields.${key}.options`, message: 'Add at least one option' }],
      });
    }
    // Duplicates make the stored answer ambiguous.
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      throw ApiError.badRequest(`"${field.label}" has duplicate options.`, {
        details: [{ field: `fields.${key}.options`, message: 'Options must be unique' }],
      });
    }
    field.options = options;
  }

  if (input.defaultValue !== undefined && input.defaultValue !== '' && def.supports?.defaultValue) {
    field.defaultValue = input.defaultValue;
  }

  // Only copy validation keys this type declares support for.
  const validation = {};
  const v = input.validation || {};
  const supported = def.supports || {};
  for (const rule of ['minLength', 'maxLength', 'min', 'max', 'pattern', 'minDate', 'maxDate', 'minSelected', 'maxSelected', 'unique']) {
    if (supported[rule] && v[rule] !== undefined && v[rule] !== null && v[rule] !== '') {
      validation[rule] = v[rule];
    }
  }
  // patternMessage rides along with pattern rather than being declared per type -
  // it is the author's own wording for the rule, and dropping it silently
  // replaces a helpful "Use ADM-1234" with a generic format complaint.
  if (validation.pattern && v.patternMessage) {
    validation.patternMessage = String(v.patternMessage).trim();
  }
  if (def.defaults?.maxLength && validation.maxLength === undefined) {
    validation.maxLength = def.defaults.maxLength;
  }
  if (Object.keys(validation).length) field.validation = validation;

  if (isFileField(input.type)) {
    field.fileSettings = { ...def.defaults, ...(input.fileSettings || {}) };
  }

  return field;
}

/** Normalises the whole field list, enforcing unique keys and sequential order. */
function normaliseFields(inputFields = []) {
  const keys = [];
  const fields = [];

  inputFields.forEach((input, index) => {
    const field = normaliseField({ ...input, order: index }, keys);
    if (keys.includes(field.key)) {
      throw ApiError.badRequest(`Duplicate field key "${field.key}".`);
    }
    keys.push(field.key);
    fields.push(field);
  });

  return fields;
}

/**
 * Applies an edit to a published form.
 *
 * Existing fields keep their key and type no matter what the client sends:
 * changing either would silently invalidate answers already submitted under
 * that key. Removing a field archives it instead of deleting it, so historical
 * submissions remain readable.
 */
function mergeFieldsPreservingData(existingFields, incomingFields) {
  const existingByKey = new Map(existingFields.map((f) => [f.key, f]));
  const incomingKeys = new Set(incomingFields.map((f) => f.key).filter(Boolean));

  const merged = incomingFields.map((incoming, index) => {
    const previous = incoming.key ? existingByKey.get(incoming.key) : null;
    if (!previous) {
      return normaliseField({ ...incoming, order: index }, [...existingByKey.keys()]);
    }
    const normalised = normaliseField(
      { ...incoming, key: previous.key, type: previous.type, order: index },
      []
    );
    return normalised;
  });

  // Anything the client dropped is archived, not lost.
  for (const previous of existingFields) {
    if (!incomingKeys.has(previous.key) && !previous.archived) {
      merged.push({ ...previous.toObject?.() ?? previous, archived: true, order: 9999 });
    }
  }

  return merged;
}

/* --------------------------- validation engine --------------------------- */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^[0-9+\-\s()]{6,20}$/;

function isBlank(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.values(value).every((v) => !v || String(v).trim() === '');
  return false;
}

/**
 * Validates one answer against its field definition.
 * Returns an error string, or null when the value is acceptable.
 */
function validateValue(field, value) {
  const def = definition(field.type);
  if (!def || !def.dataBearing) return null;

  const blank = isBlank(value);

  if (field.required && blank) return `${field.label} is required`;
  // An optional field left blank skips every other rule.
  if (blank) return null;

  const rules = field.validation || {};

  switch (field.type) {
    case FIELD_TYPES.SHORT_TEXT:
    case FIELD_TYPES.LONG_TEXT:
    case FIELD_TYPES.CUSTOM_ID: {
      const text = String(value).trim();
      if (rules.minLength && text.length < rules.minLength) {
        return `${field.label} must be at least ${rules.minLength} characters`;
      }
      if (rules.maxLength && text.length > rules.maxLength) {
        return `${field.label} must be ${rules.maxLength} characters or fewer`;
      }
      if (rules.pattern) {
        try {
          if (!new RegExp(rules.pattern).test(text)) {
            return rules.patternMessage || `${field.label} is not in the expected format`;
          }
        } catch {
          // An invalid stored pattern must not block a submission.
          return null;
        }
      }
      return null;
    }

    case FIELD_TYPES.NUMBER: {
      const num = Number(value);
      if (!Number.isFinite(num)) return `${field.label} must be a number`;
      if (rules.min !== undefined && num < rules.min) {
        return `${field.label} must be at least ${rules.min}`;
      }
      if (rules.max !== undefined && num > rules.max) {
        return `${field.label} must be no more than ${rules.max}`;
      }
      return null;
    }

    case FIELD_TYPES.EMAIL:
      return EMAIL_RE.test(String(value).trim()) ? null : `${field.label} must be a valid email address`;

    case FIELD_TYPES.PHONE:
      return PHONE_RE.test(String(value).trim()) ? null : `${field.label} must be a valid phone number`;

    case FIELD_TYPES.DATE: {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return `${field.label} must be a valid date`;
      if (rules.minDate && date < new Date(rules.minDate)) {
        return `${field.label} cannot be before ${new Date(rules.minDate).toLocaleDateString('en-IN')}`;
      }
      if (rules.maxDate && date > new Date(rules.maxDate)) {
        return `${field.label} cannot be after ${new Date(rules.maxDate).toLocaleDateString('en-IN')}`;
      }
      return null;
    }

    case FIELD_TYPES.DROPDOWN:
    case FIELD_TYPES.RADIO:
      // The answer must be one of the offered options - not arbitrary text.
      return (field.options || []).includes(String(value))
        ? null
        : `${field.label} must be one of the available choices`;

    case FIELD_TYPES.CHECKBOX: {
      const selected = Array.isArray(value) ? value : [value];
      const invalid = selected.find((s) => !(field.options || []).includes(String(s)));
      if (invalid) return `"${invalid}" is not a valid choice for ${field.label}`;
      if (rules.minSelected && selected.length < rules.minSelected) {
        return `Select at least ${rules.minSelected} for ${field.label}`;
      }
      if (rules.maxSelected && selected.length > rules.maxSelected) {
        return `Select no more than ${rules.maxSelected} for ${field.label}`;
      }
      return null;
    }

    case FIELD_TYPES.ADDRESS: {
      const addr = typeof value === 'object' ? value : {};
      if (field.required && !String(addr.line1 || '').trim()) {
        return `${field.label}: street address is required`;
      }
      if (addr.pincode && !/^[0-9]{6}$/.test(String(addr.pincode).trim())) {
        return `${field.label}: PIN code must be 6 digits`;
      }
      return null;
    }

    case FIELD_TYPES.PHOTO:
    case FIELD_TYPES.SIGNATURE:
    case FIELD_TYPES.DOCUMENT:
      // The upload itself was validated when it was stored; here we only
      // confirm the submission is pointing at something.
      return typeof value === 'object' && value.url ? null : `${field.label} must be uploaded`;

    default:
      return null;
  }
}

/**
 * Validates a whole submission against a form.
 * Returns `{ valid, errors: { fieldKey: message }, cleaned }`.
 */
function validateSubmission(form, data = {}) {
  const errors = {};
  const cleaned = {};

  for (const field of form.fields) {
    if (field.archived || !isDataBearing(field.type)) continue;

    const raw = data[field.key];
    const error = validateValue(field, raw);
    if (error) {
      errors[field.key] = error;
      continue;
    }
    if (!isBlank(raw)) {
      cleaned[field.key] = typeof raw === 'string' ? raw.trim() : raw;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, cleaned };
}

/**
 * Verifies that duplicate-check keys actually name data-bearing fields.
 *
 * A key that matches nothing makes the duplicate check silently never fire,
 * which is worse than having none at all - the client believes duplicates are
 * being caught while identical records flow straight into production.
 */
function assertValidDuplicateKeys(fields, keys = []) {
  if (!keys.length) return;

  const usable = fields
    .filter((f) => !f.archived && isDataBearing(f.type) && !isFileField(f.type))
    .map((f) => f.key);

  const unknown = keys.filter((k) => !usable.includes(k));
  if (unknown.length) {
    throw ApiError.badRequest(
      `Duplicate-check ${unknown.length === 1 ? 'field' : 'fields'} ${unknown
        .map((k) => `"${k}"`)
        .join(', ')} ${unknown.length === 1 ? 'does' : 'do'} not exist on this form.`,
      {
        code: 'UNKNOWN_DUPLICATE_FIELD',
        details: { unknown, available: usable },
      }
    );
  }
}

/** Field keys that must be present for a record to be production-ready. */
function requiredFieldKeys(form) {
  return form.fields
    .filter((f) => !f.archived && f.required && isDataBearing(f.type))
    .map((f) => f.key);
}

/* ----------------------------- assignments ------------------------------- */

/**
 * Resolves every assignment on a form into the set of users it covers.
 * Rules are evaluated live, so newly added users are picked up automatically.
 */
async function resolveAssignedUsers(formId, organizationId, { countOnly = false, select } = {}) {
  const assignments = await FormAssignment.find({
    form: formId,
    organization: organizationId,
    isActive: true,
  });

  if (!assignments.length) return countOnly ? 0 : [];

  const filters = assignments.map((a) => a.toUserFilter());
  // $or across the rules, so a user covered by two assignments appears once.
  const filter = filters.length === 1 ? filters[0] : { $or: filters };

  if (countOnly) return User.countDocuments(filter);
  return User.find(filter).select(select || 'name loginId email orgCategory department');
}

/** Every form currently assigned to one user. */
async function formsAssignedToUser(user) {
  const assignments = await FormAssignment.find({
    organization: user.organization,
    isActive: true,
    $or: [
      { scope: 'organization' },
      ...(user.orgCategory ? [{ scope: 'category', orgCategory: user.orgCategory }] : []),
      ...(user.department ? [{ scope: 'department', department: user.department }] : []),
      { scope: 'users', users: user._id },
    ],
  }).select('form dueDate');

  const formIds = [...new Set(assignments.map((a) => String(a.form)))];
  const dueByForm = {};
  for (const a of assignments) {
    const key = String(a.form);
    // If several assignments cover the same user, the earliest due date wins.
    if (a.dueDate && (!dueByForm[key] || a.dueDate < dueByForm[key])) dueByForm[key] = a.dueDate;
  }

  const forms = await Form.find({
    _id: { $in: formIds },
    organization: user.organization,
    status: 'published',
  });

  return forms.map((form) => ({ form, dueDate: dueByForm[String(form._id)] || null }));
}

/** True when this user is covered by at least one assignment on the form. */
async function isFormAssignedToUser(formId, user) {
  const match = await FormAssignment.exists({
    form: formId,
    organization: user.organization,
    isActive: true,
    $or: [
      { scope: 'organization' },
      ...(user.orgCategory ? [{ scope: 'category', orgCategory: user.orgCategory }] : []),
      ...(user.department ? [{ scope: 'department', department: user.department }] : []),
      { scope: 'users', users: user._id },
    ],
  });
  return Boolean(match);
}

module.exports = {
  generateFieldKey,
  assertValidDuplicateKeys,
  normaliseField,
  normaliseFields,
  mergeFieldsPreservingData,
  validateValue,
  validateSubmission,
  requiredFieldKeys,
  resolveAssignedUsers,
  formsAssignedToUser,
  isFormAssignedToUser,
  isBlank,
};
