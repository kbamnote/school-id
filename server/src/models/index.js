/**
 * Model registry.
 *
 * Mongoose only knows about a model once its module has been required. Models
 * that are reached exclusively through `populate()` would otherwise never be
 * registered, producing a "Schema hasn't been registered" error at runtime.
 * Requiring this one module at startup registers all of them, in dependency
 * order.
 */
const Counter = require('./Counter');
const Plan = require('./Plan');
const Organization = require('./Organization');
const Subscription = require('./Subscription');
const OrgCategory = require('./OrgCategory');
const Department = require('./Department');
const User = require('./User');
const AuditLog = require('./AuditLog');
const Form = require('./Form');
const FormAssignment = require('./FormAssignment');
const Submission = require('./Submission');
const PrintingLot = require('./PrintingLot');
const PrintJob = require('./PrintJob');
const Proof = require('./Proof');
const Upload = require('./Upload');
const CardDesign = require('./CardDesign');
const Notification = require('./Notification');

module.exports = {
  Counter,
  Plan,
  Organization,
  Subscription,
  OrgCategory,
  Department,
  User,
  AuditLog,
  Form,
  FormAssignment,
  Submission,
  PrintingLot,
  PrintJob,
  Proof,
  Upload,
  CardDesign,
  Notification,
};
