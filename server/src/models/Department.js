const mongoose = require('mongoose');

/**
 * A grouping inside a tenant: department, class, section, batch, shift.
 *
 * Deliberately generic and self-referential (`parent`) so a school can model
 * Class 10 > Section A while a company models Sales > Field Sales, without the
 * platform needing to know either domain.
 */
const departmentSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },

    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 120 },
    code: { type: String, trim: true, uppercase: true, default: '', maxlength: 20 },

    kind: {
      type: String,
      enum: ['department', 'class', 'section', 'batch', 'group', 'shift', 'branch'],
      default: 'department',
      index: true,
    },

    /** Optional hierarchy - a Section sits under a Class. */
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },

    description: { type: String, trim: true, default: '', maxlength: 500 },
    headName: { type: String, trim: true, default: '' },

    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    userCount: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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

departmentSchema.index({ organization: 1, name: 1, parent: 1 }, { unique: true });
departmentSchema.index({ organization: 1, kind: 1, isActive: 1 });

module.exports = mongoose.model('Department', departmentSchema);
