const mongoose = require('mongoose');
const { FIELD_TYPE_VALUES, FIELD_TYPES } = require('../constants/fieldTypes');
const { slugify, randomToken } = require('../utils/strings');

/**
 * A field on a form.
 *
 * Embedded rather than a separate collection: fields have no independent
 * lifecycle, are always read with their parent, and are never queried on their
 * own. A join here would cost a lookup on every render for no benefit.
 */
const fieldSchema = new mongoose.Schema(
  {
    /**
     * Stable machine key. This is the property name under which the answer is
     * stored on every submission, so it is generated once and never changed
     * afterwards - renaming it would orphan the data already collected.
     */
    key: { type: String, required: true, trim: true, maxlength: 60 },

    type: { type: String, enum: FIELD_TYPE_VALUES, required: true },

    label: { type: String, required: true, trim: true, maxlength: 200 },
    placeholder: { type: String, trim: true, default: '', maxlength: 200 },
    helpText: { type: String, trim: true, default: '', maxlength: 500 },

    required: { type: Boolean, default: false },
    order: { type: Number, default: 0 },

    /** For dropdown / radio / checkbox. */
    options: { type: [String], default: undefined },

    defaultValue: { type: mongoose.Schema.Types.Mixed, default: undefined },

    /** Type-specific rules; only the keys the type declares support for apply. */
    validation: {
      minLength: { type: Number, default: undefined },
      maxLength: { type: Number, default: undefined },
      min: { type: Number, default: undefined },
      max: { type: Number, default: undefined },
      pattern: { type: String, default: undefined },
      patternMessage: { type: String, default: undefined },
      minDate: { type: Date, default: undefined },
      maxDate: { type: Date, default: undefined },
      minSelected: { type: Number, default: undefined },
      maxSelected: { type: Number, default: undefined },
      /** Rejects a value already used by another submission on the same form. */
      unique: { type: Boolean, default: false },
    },

    /** File-field settings. */
    fileSettings: {
      aspectRatio: { type: String, default: undefined },
      minWidth: { type: Number, default: undefined },
      minHeight: { type: Number, default: undefined },
      maxSizeMb: { type: Number, default: undefined },
      acceptPdf: { type: Boolean, default: undefined },
    },

    /** Layout hint used by the renderer. */
    width: { type: String, enum: ['full', 'half'], default: 'full' },

    /** A field kept for existing data but no longer shown on the form. */
    archived: { type: Boolean, default: false },
  },
  { _id: false }
);

const formSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },

    title: { type: String, required: [true, 'Form title is required'], trim: true, maxlength: 200 },
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, default: '', maxlength: 2000 },

    /** What is being produced from this data - shown to production staff. */
    productType: {
      type: String,
      enum: ['id_card', 'certificate', 'badge', 'visiting_card', 'letter', 'other'],
      default: 'id_card',
    },

    fields: { type: [fieldSchema], default: [] },

    status: {
      type: String,
      enum: ['draft', 'published', 'closed'],
      default: 'draft',
      index: true,
    },
    publishedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },

    /**
     * Unguessable public identifier for the shareable link. Regenerating it
     * invalidates every previously distributed URL.
     */
    linkToken: { type: String, default: () => randomToken(16), index: true },
    /** Whether the tokenised URL works at all, independent of status. */
    allowPublicLink: { type: Boolean, default: false },

    settings: {
      allowDrafts: { type: Boolean, default: true },
      allowEditAfterSubmit: { type: Boolean, default: false },
      requireDeclaration: { type: Boolean, default: false },
      declarationText: {
        type: String,
        default: 'I confirm the information provided above is true and correct.',
        maxlength: 1000,
      },
      successMessage: {
        type: String,
        default: 'Your details have been submitted. Your organisation will review them shortly.',
        maxlength: 1000,
      },
      /** Closes the form automatically once this passes. */
      opensAt: { type: Date, default: null },
      closesAt: { type: Date, default: null },
      maxSubmissions: { type: Number, default: null },
    },

    /**
     * Field keys whose combined values identify a duplicate person.
     * Empty means duplicate detection is off for this form.
     */
    duplicateCheckFields: { type: [String], default: [] },

    stats: {
      assignedCount: { type: Number, default: 0 },
      submissionCount: { type: Number, default: 0 },
      approvedCount: { type: Number, default: 0 },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

formSchema.index({ organization: 1, status: 1, createdAt: -1 });
formSchema.index({ organization: 1, slug: 1 }, { unique: true });
formSchema.index({ organization: 1, title: 'text' });

/**
 * Fields the end user actually sees, in order.
 *
 * Guards against `fields` being absent: virtuals are evaluated during JSON
 * serialisation, and the list endpoint deliberately runs `.select('-fields')`
 * to keep the payload small. Reading the path unguarded crashes the response.
 */
formSchema.virtual('visibleFields').get(function visibleFields() {
  if (!Array.isArray(this.fields)) return [];
  return this.fields
    .filter((f) => !f.archived && f.type !== FIELD_TYPES.HIDDEN)
    .sort((a, b) => a.order - b.order);
});

/** True when the form is currently accepting submissions. */
formSchema.methods.isOpen = function isOpen() {
  if (this.status !== 'published') return false;
  const now = new Date();
  if (this.settings.opensAt && this.settings.opensAt > now) return false;
  if (this.settings.closesAt && this.settings.closesAt < now) return false;
  if (
    this.settings.maxSubmissions &&
    this.stats.submissionCount >= this.settings.maxSubmissions
  ) {
    return false;
  }
  return true;
};

/** Explains *why* a form is unavailable, so the user is not left guessing. */
formSchema.methods.closedReason = function closedReason() {
  if (this.status === 'draft') return 'This form has not been published yet.';
  if (this.status === 'closed') return 'This form is closed and no longer accepting submissions.';

  const now = new Date();
  if (this.settings.opensAt && this.settings.opensAt > now) {
    return `This form opens on ${this.settings.opensAt.toLocaleDateString('en-IN')}.`;
  }
  if (this.settings.closesAt && this.settings.closesAt < now) {
    return `This form closed on ${this.settings.closesAt.toLocaleDateString('en-IN')}.`;
  }
  if (
    this.settings.maxSubmissions &&
    this.stats.submissionCount >= this.settings.maxSubmissions
  ) {
    return 'This form has reached its submission limit.';
  }
  return null;
};

/** Unique slug within the organisation, appending -2, -3 ... on collision. */
formSchema.statics.generateSlug = async function generateSlug(organizationId, title, excludeId) {
  const base = slugify(title) || 'form';
  let candidate = base;
  let n = 1;
  /* eslint-disable no-await-in-loop */
  while (
    await this.exists({
      organization: organizationId,
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
  ) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  /* eslint-enable no-await-in-loop */
  return candidate;
};

module.exports = mongoose.model('Form', formSchema);
