const { z } = require('zod');
const { objectId, listQuery } = require('./common');

/** A CSS colour we are willing to hand to the SVG renderer. */
const colour = z
  .string()
  .trim()
  .regex(/^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|transparent)$/, 'Enter a valid colour')
  .max(40);

/**
 * Font families are restricted to a known list rather than free text.
 *
 * The value is interpolated into the SVG the print renderer builds, and a
 * design that names a font the render host does not have would silently fall
 * back to a different face - so the card that prints would not be the card the
 * client approved.
 */
const FONT_FAMILIES = [
  'Helvetica',
  'Arial',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
];

const styleSchema = z
  .object({
    fontSize: z.number().min(0.5).max(40).optional(),
    fontFamily: z.enum(FONT_FAMILIES).optional(),
    fontWeight: z.enum(['normal', 'bold']).optional(),
    italic: z.boolean().optional(),
    color: colour.optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
    lineHeight: z.number().min(0.8).max(3).optional(),
    letterSpacing: z.number().min(-2).max(10).optional(),
    transform: z.enum(['none', 'uppercase', 'capitalize']).optional(),
    prefix: z.string().max(60).optional(),
    suffix: z.string().max(60).optional(),
    objectFit: z.enum(['cover', 'contain']).optional(),
    radius: z.number().min(0).max(50).optional(),
    backgroundColor: colour.optional().or(z.literal('')),
    hideIfEmpty: z.boolean().optional(),
  })
  .strict();

const elementSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    type: z.enum(['field', 'static', 'qr', 'image']),
    face: z.enum(['front', 'back']).default('front'),
    fieldKey: z.string().trim().max(120).nullable().optional(),
    fieldType: z.string().trim().max(40).nullable().optional(),
    text: z.string().max(2000).optional(),
    x: z.number().min(-20).max(120),
    y: z.number().min(-20).max(120),
    width: z.number().min(1).max(140),
    height: z.number().min(1).max(140),
    style: styleSchema.optional(),
    z: z.number().int().min(0).max(999).optional(),
  })
  .strict()
  .superRefine((el, ctx) => {
    // A field element with no key would render as a permanent blank box, and
    // the designer would look correct while every printed card came out empty.
    if (el.type === 'field' && !el.fieldKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fieldKey'],
        message: 'Choose which form field this element shows',
      });
    }
    if (el.type === 'static' && !(el.text || '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['text'],
        message: 'Enter the text to print',
      });
    }
    if (el.type === 'qr' && !(el.text || '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['text'],
        message: 'Enter what the QR code should contain',
      });
    }
  });

/** 60 elements is already far more than a 54x86mm card can hold legibly. */
const elements = z.array(elementSchema).max(60);

const listSchema = listQuery.extend({
  form: objectId.optional(),
  status: z.enum(['draft', 'active']).optional(),
});

const createSchema = z
  .object({
    form: objectId,
    name: z.string().trim().min(1, 'Give the design a name').max(160),
    widthMm: z.number().min(20).max(500).optional(),
    heightMm: z.number().min(20).max(500).optional(),
    dpi: z.number().int().min(150).max(1200).optional(),
    orientation: z.enum(['portrait', 'landscape']).optional(),
    hasBack: z.boolean().optional(),
  })
  .strict();

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    widthMm: z.number().min(20).max(500).optional(),
    heightMm: z.number().min(20).max(500).optional(),
    dpi: z.number().int().min(150).max(1200).optional(),
    orientation: z.enum(['portrait', 'landscape']).optional(),
    hasBack: z.boolean().optional(),
    elements: elements.optional(),
    frontBackgroundColor: colour.optional(),
    backBackgroundColor: colour.optional(),
  })
  .strict();

const statusSchema = z.object({ status: z.enum(['draft', 'active']) }).strict();

/** `face` arrives as a multipart text field alongside the artwork file. */
const artworkSchema = z.object({ face: z.enum(['front', 'back']).default('front') }).strict();

const previewSchema = z.object({
  submission: objectId.optional(),
  face: z.enum(['front', 'back']).optional(),
});

module.exports = {
  listSchema,
  createSchema,
  updateSchema,
  statusSchema,
  artworkSchema,
  previewSchema,
  FONT_FAMILIES,
};
