const mongoose = require('mongoose');

/**
 * Who a form applies to.
 *
 * Stored as rules rather than a materialised list of user ids, so a student
 * added to Class 10 next week is automatically covered by an assignment made
 * today. Resolution to actual users happens at query time.
 */
const formAssignmentSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    form: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', required: true, index: true },

    /**
     * organization - everyone in the tenant
     * category     - everyone in an OrgCategory (all Students)
     * department   - everyone in a Department (all of Class 10)
     * users        - a hand-picked list
     */
    scope: {
      type: String,
      enum: ['organization', 'category', 'department', 'users'],
      required: true,
    },

    orgCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'OrgCategory', default: null },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    /** Only when scope is `users`; capped by the validator to keep documents small. */
    users: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },

    /** Turning this off suspends the assignment without losing the rule. */
    isActive: { type: Boolean, default: true },

    dueDate: { type: Date, default: null },
    notifyOnAssign: { type: Boolean, default: true },

    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

formAssignmentSchema.index({ organization: 1, form: 1, scope: 1 });
formAssignmentSchema.index({ organization: 1, orgCategory: 1 });
formAssignmentSchema.index({ organization: 1, department: 1 });
formAssignmentSchema.index({ users: 1 });

/**
 * Builds the User filter that this assignment resolves to.
 * Returning a filter (rather than ids) keeps the membership live.
 */
formAssignmentSchema.methods.toUserFilter = function toUserFilter() {
  const base = { organization: this.organization, role: 'END_USER', status: 'active' };

  switch (this.scope) {
    case 'organization':
      return base;
    case 'category':
      return { ...base, orgCategory: this.orgCategory };
    case 'department':
      return { ...base, department: this.department };
    case 'users':
      return { ...base, _id: { $in: this.users } };
    default:
      // An unknown scope must match nobody rather than everybody.
      return { _id: null };
  }
};

/** Human description used in the assignments table. */
formAssignmentSchema.methods.describe = function describe() {
  switch (this.scope) {
    case 'organization':
      return 'Everyone in the organisation';
    case 'category':
      return this.orgCategory?.name ? `All ${this.orgCategory.name}` : 'A category';
    case 'department':
      return this.department?.name ? `All of ${this.department.name}` : 'A department';
    case 'users':
      return `${this.users.length} selected user${this.users.length === 1 ? '' : 's'}`;
    default:
      return 'Unknown';
  }
};

module.exports = mongoose.model('FormAssignment', formAssignmentSchema);
