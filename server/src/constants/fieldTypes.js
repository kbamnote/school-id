/**
 * The field type registry.
 *
 * One declaration per type, describing everything the rest of the system needs
 * to know: whether it holds a value, whether it accepts options, how it is
 * validated, and how it is exported for printing. The builder UI, the
 * submission validator and the print export all read from this table rather
 * than each maintaining their own list - a new field type is added here once.
 */

const FIELD_TYPES = {
  // --- text --------------------------------------------------------------
  SHORT_TEXT: 'short_text',
  LONG_TEXT: 'long_text',
  NUMBER: 'number',
  EMAIL: 'email',
  PHONE: 'phone',
  DATE: 'date',

  // --- choice ------------------------------------------------------------
  DROPDOWN: 'dropdown',
  RADIO: 'radio',
  CHECKBOX: 'checkbox',

  // --- composite ---------------------------------------------------------
  ADDRESS: 'address',

  // --- files -------------------------------------------------------------
  PHOTO: 'photo',
  SIGNATURE: 'signature',
  DOCUMENT: 'document',

  // --- system ------------------------------------------------------------
  CUSTOM_ID: 'custom_id',
  HIDDEN: 'hidden',

  // --- layout (carry no value) -------------------------------------------
  HEADING: 'heading',
  INSTRUCTIONS: 'instructions',
  DIVIDER: 'divider',
};

/**
 * `dataBearing: false` marks presentation-only fields. They are skipped by the
 * validator, excluded from exports, and never counted towards completeness.
 */
const FIELD_DEFINITIONS = {
  [FIELD_TYPES.SHORT_TEXT]: {
    type: FIELD_TYPES.SHORT_TEXT,
    label: 'Short text',
    description: 'A single line, such as a name.',
    icon: 'type',
    group: 'text',
    dataBearing: true,
    hasOptions: false,
    supports: { minLength: true, maxLength: true, pattern: true, placeholder: true, defaultValue: true },
    defaults: { maxLength: 120 },
    printable: true,
  },
  [FIELD_TYPES.LONG_TEXT]: {
    type: FIELD_TYPES.LONG_TEXT,
    label: 'Long text',
    description: 'A paragraph, such as an address or remarks.',
    icon: 'align-left',
    group: 'text',
    dataBearing: true,
    hasOptions: false,
    supports: { minLength: true, maxLength: true, placeholder: true, rows: true },
    defaults: { maxLength: 1000, rows: 3 },
    printable: true,
  },
  [FIELD_TYPES.NUMBER]: {
    type: FIELD_TYPES.NUMBER,
    label: 'Number',
    description: 'Digits only, such as a roll number.',
    icon: 'hash',
    group: 'text',
    dataBearing: true,
    hasOptions: false,
    supports: { min: true, max: true, placeholder: true, defaultValue: true },
    defaults: {},
    printable: true,
  },
  [FIELD_TYPES.EMAIL]: {
    type: FIELD_TYPES.EMAIL,
    label: 'Email',
    description: 'A validated email address.',
    icon: 'mail',
    group: 'text',
    dataBearing: true,
    hasOptions: false,
    supports: { placeholder: true },
    defaults: {},
    printable: true,
  },
  [FIELD_TYPES.PHONE]: {
    type: FIELD_TYPES.PHONE,
    label: 'Phone',
    description: 'A contact number.',
    icon: 'phone',
    group: 'text',
    dataBearing: true,
    hasOptions: false,
    supports: { placeholder: true },
    defaults: {},
    printable: true,
  },
  [FIELD_TYPES.DATE]: {
    type: FIELD_TYPES.DATE,
    label: 'Date',
    description: 'A calendar date, such as date of birth.',
    icon: 'calendar',
    group: 'text',
    dataBearing: true,
    hasOptions: false,
    supports: { minDate: true, maxDate: true },
    defaults: {},
    printable: true,
  },

  [FIELD_TYPES.DROPDOWN]: {
    type: FIELD_TYPES.DROPDOWN,
    label: 'Dropdown',
    description: 'Pick one from a list.',
    icon: 'chevron-down-square',
    group: 'choice',
    dataBearing: true,
    hasOptions: true,
    supports: { placeholder: true, defaultValue: true },
    defaults: { options: ['Option 1', 'Option 2'] },
    printable: true,
  },
  [FIELD_TYPES.RADIO]: {
    type: FIELD_TYPES.RADIO,
    label: 'Radio buttons',
    description: 'Pick one, all choices visible.',
    icon: 'circle-dot',
    group: 'choice',
    dataBearing: true,
    hasOptions: true,
    supports: { defaultValue: true },
    defaults: { options: ['Option 1', 'Option 2'] },
    printable: true,
  },
  [FIELD_TYPES.CHECKBOX]: {
    type: FIELD_TYPES.CHECKBOX,
    label: 'Checkboxes',
    description: 'Pick any number of choices.',
    icon: 'check-square',
    group: 'choice',
    dataBearing: true,
    hasOptions: true,
    // Stores an array, so it validates on count rather than length.
    multiple: true,
    supports: { minSelected: true, maxSelected: true },
    defaults: { options: ['Option 1', 'Option 2'] },
    printable: true,
  },

  [FIELD_TYPES.ADDRESS]: {
    type: FIELD_TYPES.ADDRESS,
    label: 'Address',
    description: 'Street, city, state and PIN code together.',
    icon: 'map-pin',
    group: 'composite',
    dataBearing: true,
    hasOptions: false,
    // Stored as an object; each part is exported as its own print column.
    composite: ['line1', 'line2', 'city', 'state', 'pincode'],
    supports: {},
    defaults: {},
    printable: true,
  },

  [FIELD_TYPES.PHOTO]: {
    type: FIELD_TYPES.PHOTO,
    label: 'Photograph',
    description: 'A portrait for the card, with cropping.',
    icon: 'camera',
    group: 'file',
    dataBearing: true,
    hasOptions: false,
    isFile: true,
    supports: { aspectRatio: true, minWidth: true, minHeight: true, maxSizeMb: true },
    // 3:4 portrait at 600x800 is the usual ID-card photo box.
    defaults: { aspectRatio: '3:4', minWidth: 420, minHeight: 560, maxSizeMb: 5 },
    printable: true,
    exportFolder: 'photos',
  },
  [FIELD_TYPES.SIGNATURE]: {
    type: FIELD_TYPES.SIGNATURE,
    label: 'Signature',
    description: 'A scanned or photographed signature.',
    icon: 'pen-tool',
    group: 'file',
    dataBearing: true,
    hasOptions: false,
    isFile: true,
    supports: { aspectRatio: true, maxSizeMb: true },
    defaults: { aspectRatio: '3:1', maxSizeMb: 2 },
    printable: true,
    exportFolder: 'signatures',
  },
  [FIELD_TYPES.DOCUMENT]: {
    type: FIELD_TYPES.DOCUMENT,
    label: 'Document',
    description: 'A supporting file, such as a certificate.',
    icon: 'file-text',
    group: 'file',
    dataBearing: true,
    hasOptions: false,
    isFile: true,
    supports: { maxSizeMb: true, acceptPdf: true },
    defaults: { maxSizeMb: 8, acceptPdf: true },
    printable: false,
    exportFolder: 'documents',
  },

  [FIELD_TYPES.CUSTOM_ID]: {
    type: FIELD_TYPES.CUSTOM_ID,
    label: 'Custom ID',
    description: 'A reference the user enters, such as an admission number.',
    icon: 'badge',
    group: 'system',
    dataBearing: true,
    hasOptions: false,
    supports: { pattern: true, placeholder: true, unique: true },
    defaults: {},
    printable: true,
  },
  [FIELD_TYPES.HIDDEN]: {
    type: FIELD_TYPES.HIDDEN,
    label: 'Hidden value',
    description: 'Stored with the record but never shown to the user.',
    icon: 'eye-off',
    group: 'system',
    dataBearing: true,
    hasOptions: false,
    supports: { defaultValue: true },
    defaults: {},
    printable: true,
  },

  [FIELD_TYPES.HEADING]: {
    type: FIELD_TYPES.HEADING,
    label: 'Section heading',
    description: 'Breaks a long form into sections.',
    icon: 'heading',
    group: 'layout',
    dataBearing: false,
    hasOptions: false,
    supports: {},
    defaults: {},
    printable: false,
  },
  [FIELD_TYPES.INSTRUCTIONS]: {
    type: FIELD_TYPES.INSTRUCTIONS,
    label: 'Instructions',
    description: 'A note explaining what to do.',
    icon: 'info',
    group: 'layout',
    dataBearing: false,
    hasOptions: false,
    supports: {},
    defaults: {},
    printable: false,
  },
  [FIELD_TYPES.DIVIDER]: {
    type: FIELD_TYPES.DIVIDER,
    label: 'Divider',
    description: 'A horizontal rule.',
    icon: 'minus',
    group: 'layout',
    dataBearing: false,
    hasOptions: false,
    supports: {},
    defaults: {},
    printable: false,
  },
};

const FIELD_TYPE_VALUES = Object.values(FIELD_TYPES);

const FIELD_GROUPS = [
  { key: 'text', label: 'Text & numbers' },
  { key: 'choice', label: 'Choices' },
  { key: 'composite', label: 'Composite' },
  { key: 'file', label: 'Uploads' },
  { key: 'system', label: 'System' },
  { key: 'layout', label: 'Layout' },
];

function definition(type) {
  return FIELD_DEFINITIONS[type] || null;
}

const isDataBearing = (type) => Boolean(definition(type)?.dataBearing);
const isFileField = (type) => Boolean(definition(type)?.isFile);
const hasOptions = (type) => Boolean(definition(type)?.hasOptions);
const isPrintable = (type) => Boolean(definition(type)?.printable);

/**
 * A starter library of common fields.
 *
 * Building an ID-card form from scratch means typing the same twenty labels
 * every time, so the builder offers these as one-click additions.
 */
const FIELD_LIBRARY = [
  { key: 'full_name', label: 'Full Name', type: FIELD_TYPES.SHORT_TEXT, required: true, group: 'Personal' },
  { key: 'father_name', label: "Father's Name", type: FIELD_TYPES.SHORT_TEXT, group: 'Personal' },
  { key: 'mother_name', label: "Mother's Name", type: FIELD_TYPES.SHORT_TEXT, group: 'Personal' },
  { key: 'date_of_birth', label: 'Date of Birth', type: FIELD_TYPES.DATE, required: true, group: 'Personal' },
  {
    key: 'gender',
    label: 'Gender',
    type: FIELD_TYPES.DROPDOWN,
    options: ['Male', 'Female', 'Other'],
    group: 'Personal',
  },
  {
    key: 'blood_group',
    label: 'Blood Group',
    type: FIELD_TYPES.DROPDOWN,
    options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    group: 'Personal',
  },
  { key: 'photo', label: 'Photograph', type: FIELD_TYPES.PHOTO, required: true, group: 'Personal' },
  { key: 'signature', label: 'Signature', type: FIELD_TYPES.SIGNATURE, group: 'Personal' },

  { key: 'contact_no', label: 'Contact Number', type: FIELD_TYPES.PHONE, required: true, group: 'Contact' },
  { key: 'emergency_contact', label: 'Emergency Contact', type: FIELD_TYPES.PHONE, group: 'Contact' },
  { key: 'email', label: 'Email Address', type: FIELD_TYPES.EMAIL, group: 'Contact' },
  { key: 'address', label: 'Address', type: FIELD_TYPES.ADDRESS, group: 'Contact' },

  { key: 'admission_no', label: 'Admission Number', type: FIELD_TYPES.CUSTOM_ID, group: 'Academic' },
  { key: 'roll_no', label: 'Roll Number', type: FIELD_TYPES.SHORT_TEXT, group: 'Academic' },
  { key: 'class', label: 'Class', type: FIELD_TYPES.DROPDOWN, options: [], group: 'Academic' },
  { key: 'section', label: 'Section', type: FIELD_TYPES.DROPDOWN, options: [], group: 'Academic' },
  { key: 'course', label: 'Course', type: FIELD_TYPES.SHORT_TEXT, group: 'Academic' },
  { key: 'session', label: 'Academic Session', type: FIELD_TYPES.SHORT_TEXT, group: 'Academic' },

  { key: 'employee_id', label: 'Employee ID', type: FIELD_TYPES.CUSTOM_ID, group: 'Employment' },
  { key: 'designation', label: 'Designation', type: FIELD_TYPES.SHORT_TEXT, group: 'Employment' },
  { key: 'department', label: 'Department', type: FIELD_TYPES.SHORT_TEXT, group: 'Employment' },
  { key: 'date_of_joining', label: 'Date of Joining', type: FIELD_TYPES.DATE, group: 'Employment' },

  { key: 'aadhaar_no', label: 'Aadhaar Number', type: FIELD_TYPES.SHORT_TEXT, group: 'Identity' },
  { key: 'pan_no', label: 'PAN Number', type: FIELD_TYPES.SHORT_TEXT, group: 'Identity' },
  { key: 'licence_no', label: 'Licence Number', type: FIELD_TYPES.SHORT_TEXT, group: 'Identity' },
];

module.exports = {
  FIELD_TYPES,
  FIELD_TYPE_VALUES,
  FIELD_DEFINITIONS,
  FIELD_GROUPS,
  FIELD_LIBRARY,
  definition,
  isDataBearing,
  isFileField,
  hasOptions,
  isPrintable,
};
