const mongoose = require('mongoose');

/**
 * One positioned element on a card face.
 *
 * Coordinates are PERCENTAGES of the card, never pixels. The same layout has
 * to render in a 320px phone preview, a 900px designer canvas and a 1016px
 * print file - percentages are the only representation that survives all
 * three without a scaling factor threaded through every consumer.
 */
const elementSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },

    /**
     * field   - bound to a form field key, filled per person
     * static  - the same words on every card (terms, "Authorized Signature")
     * qr      - generated from the record
     * image   - a fixed graphic such as a logo
     */
    type: { type: String, enum: ['field', 'static', 'qr', 'image'], required: true },

    face: { type: String, enum: ['front', 'back'], default: 'front' },

    /** Which form field supplies the value. Only for type `field`. */
    fieldKey: { type: String, default: null },
    /** What the field is, so the renderer knows to draw a photo not text. */
    fieldType: { type: String, default: null },

    /** Literal content for `static`; a template for `qr`. */
    text: { type: String, default: '', maxlength: 2000 },

    /** Box, as percentages of card width/height. */
    x: { type: Number, required: true, min: -20, max: 120 },
    y: { type: Number, required: true, min: -20, max: 120 },
    width: { type: Number, required: true, min: 1, max: 140 },
    height: { type: Number, required: true, min: 1, max: 140 },

    style: {
      /** Font size in percent of card HEIGHT, so text scales with the card. */
      fontSize: { type: Number, default: 4 },
      fontFamily: { type: String, default: 'Helvetica' },
      fontWeight: { type: String, enum: ['normal', 'bold'], default: 'normal' },
      italic: { type: Boolean, default: false },
      color: { type: String, default: '#111111' },
      align: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
      verticalAlign: { type: String, enum: ['top', 'middle', 'bottom'], default: 'top' },
      lineHeight: { type: Number, default: 1.25 },
      letterSpacing: { type: Number, default: 0 },
      transform: { type: String, enum: ['none', 'uppercase', 'capitalize'], default: 'none' },
      /** Text placed before/after the value, e.g. "Blood group: " */
      prefix: { type: String, default: '', maxlength: 60 },
      suffix: { type: String, default: '', maxlength: 60 },
      /** Photo framing. */
      objectFit: { type: String, enum: ['cover', 'contain'], default: 'cover' },
      radius: { type: Number, default: 0 },
      backgroundColor: { type: String, default: '' },
      /** Hide the element when its value is empty, rather than leaving a gap. */
      hideIfEmpty: { type: Boolean, default: true },
    },

    /** Stacking, so overlapping elements are predictable. */
    z: { type: Number, default: 0 },

    /**
     * Proposed by artwork detection and not yet confirmed by a person.
     *
     * OCR cannot tell a per-person value from wording fixed on every card, so
     * an unreviewed guess must never reach production - a designer's name read
     * as a student's name would print on the whole batch.
     */
    suggested: { type: Boolean, default: false },
  },
  { _id: false }
);

const faceSchema = new mongoose.Schema(
  {
    artwork: {
      upload: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload' },
      url: String,
      publicId: String,
      provider: String,
      width: Number,
      height: Number,
    },
    backgroundColor: { type: String, default: '#ffffff' },
  },
  { _id: false }
);

const cardDesignSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },

    /** A design belongs to one form - that is where its field keys come from. */
    form: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', required: true, index: true },

    name: { type: String, required: true, trim: true, maxlength: 160 },

    /** Physical size. 54 x 86 mm is the standard vertical ID card. */
    widthMm: { type: Number, default: 54, min: 20, max: 500 },
    heightMm: { type: Number, default: 86, min: 20, max: 500 },
    dpi: { type: Number, default: 300, min: 150, max: 1200 },
    orientation: { type: String, enum: ['portrait', 'landscape'], default: 'portrait' },

    front: { type: faceSchema, default: () => ({}) },
    back: { type: faceSchema, default: () => ({}) },
    hasBack: { type: Boolean, default: false },

    elements: { type: [elementSchema], default: [] },

    status: { type: String, enum: ['draft', 'active'], default: 'draft', index: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/* One active design per form - otherwise printing would not know which to use. */
cardDesignSchema.index(
  { form: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

/** Pixel dimensions at the configured print resolution. */
cardDesignSchema.virtual('pixelSize').get(function pixelSize() {
  const mmToPx = (mm) => Math.round((mm / 25.4) * this.dpi);
  return { width: mmToPx(this.widthMm), height: mmToPx(this.heightMm) };
});

/** Elements on one face, in stacking order. */
cardDesignSchema.methods.elementsFor = function elementsFor(face) {
  return (this.elements || [])
    .filter((el) => el.face === face)
    .sort((a, b) => (a.z || 0) - (b.z || 0));
};

module.exports = mongoose.model('CardDesign', cardDesignSchema);
