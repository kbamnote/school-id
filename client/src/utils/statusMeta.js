/**
 * The single source of truth for how every workflow state is presented.
 *
 * Mirrors server/src/constants/workflow.js. Keeping it in one map means a
 * status can never be blue on one screen and grey on another, and adding a
 * state is a one-line change instead of a hunt through components.
 */

export const SUBMISSION_STATUS = {
  NOT_STARTED: 'not_started',
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  CORRECTION_REQUIRED: 'correction_required',
  RESUBMITTED: 'resubmitted',
  APPROVED: 'approved',
  IN_LOT: 'in_lot',
  SENT_FOR_PRINTING: 'sent_for_printing',
  PRINTED: 'printed',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
};

export const SUBMISSION_STATUS_META = {
  not_started: { label: 'Not Started', tone: 'neutral', description: 'The form has not been opened yet.' },
  draft: { label: 'Draft', tone: 'neutral', description: 'Saved but not yet submitted.' },
  submitted: { label: 'Submitted', tone: 'info', description: 'Waiting for the organisation to review.' },
  under_review: { label: 'Under Review', tone: 'info', description: 'An administrator is checking this record.' },
  correction_required: { label: 'Correction Required', tone: 'warning', description: 'Changes were requested. The user must fix and resubmit.' },
  resubmitted: { label: 'Resubmitted', tone: 'info', description: 'Corrected and sent back for review.' },
  approved: { label: 'Approved', tone: 'success', description: 'Verified and eligible for a printing lot.' },
  in_lot: { label: 'In Printing Lot', tone: 'brand', description: 'Grouped into a lot, not yet sent to production.' },
  sent_for_printing: { label: 'Sent for Printing', tone: 'accent', description: 'Handed over to MR Print World.' },
  printed: { label: 'Printed', tone: 'accent', description: 'Physically produced.' },
  completed: { label: 'Completed', tone: 'success', description: 'Dispatched and closed.' },
  rejected: { label: 'Rejected', tone: 'danger', description: 'Not accepted for production.' },
};

export const LOT_STATUS_META = {
  draft: { label: 'Draft', tone: 'neutral', description: 'Being assembled. Records can still be added or removed.' },
  ready: { label: 'Ready to Send', tone: 'info', description: 'Reviewed and ready to hand to MR Print World.' },
  submitted: { label: 'Sent for Printing', tone: 'brand', description: 'Received by MR Print World.' },
  in_production: { label: 'In Production', tone: 'accent', description: 'Being processed in the print workflow.' },
  returned: { label: 'Returned - Data Issue', tone: 'danger', description: 'Sent back for corrections.' },
  completed: { label: 'Completed', tone: 'success', description: 'Printed and dispatched.' },
  cancelled: { label: 'Cancelled', tone: 'neutral', description: 'This lot was cancelled.' },
};

export const JOB_STATUS_META = {
  received: { label: 'Received', tone: 'info', step: 1 },
  data_verification: { label: 'Data Verification', tone: 'info', step: 2 },
  data_issue: { label: 'Data Issue', tone: 'danger', step: 2 },
  design_processing: { label: 'Design Processing', tone: 'brand', step: 3 },
  proof_ready: { label: 'Proof Ready', tone: 'brand', step: 4 },
  awaiting_client_approval: { label: 'Awaiting Approval', tone: 'warning', step: 5 },
  approved_for_printing: { label: 'Approved for Printing', tone: 'success', step: 6 },
  printing: { label: 'Printing', tone: 'accent', step: 7 },
  quality_check: { label: 'Quality Check', tone: 'accent', step: 8 },
  ready_for_dispatch: { label: 'Ready for Dispatch', tone: 'brand', step: 9 },
  dispatched: { label: 'Dispatched', tone: 'success', step: 10 },
  completed: { label: 'Completed', tone: 'success', step: 11 },
  cancelled: { label: 'Cancelled', tone: 'neutral', step: 0 },
};

export const JOB_STATUS_ORDER = [
  'received',
  'data_verification',
  'design_processing',
  'proof_ready',
  'awaiting_client_approval',
  'approved_for_printing',
  'printing',
  'quality_check',
  'ready_for_dispatch',
  'dispatched',
  'completed',
];

export const PROOF_STATUS_META = {
  pending: { label: 'Awaiting Approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  changes_requested: { label: 'Changes Requested', tone: 'danger' },
  superseded: { label: 'Superseded', tone: 'neutral' },
};

/** Organisation / user / subscription states. */
export const GENERIC_STATUS_META = {
  draft: { label: 'Draft', tone: 'neutral' },
  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'neutral' },
  suspended: { label: 'Suspended', tone: 'danger' },
  archived: { label: 'Archived', tone: 'neutral' },
  trial: { label: 'Trial', tone: 'info' },
  past_due: { label: 'Past Due', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'danger' },
  published: { label: 'Published', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

export function submissionMeta(status) {
  return SUBMISSION_STATUS_META[status] || { label: status, tone: 'neutral', description: '' };
}
export function jobMeta(status) {
  return JOB_STATUS_META[status] || { label: status, tone: 'neutral', step: 0 };
}
export function lotMeta(status) {
  return LOT_STATUS_META[status] || { label: status, tone: 'neutral', description: '' };
}

/** One-line explanation of what each production stage means. */
export const JOB_STAGE_HINTS = {
  received: 'Arrived from the client, not yet looked at.',
  data_verification: 'Checking the records are complete and printable.',
  data_issue: 'Sent back to the client - something is wrong with the data.',
  design_processing: 'Laying the data onto the card design.',
  proof_ready: 'A proof has been produced, ready to send.',
  awaiting_client_approval: 'Waiting for the client to approve the proof.',
  approved_for_printing: 'Proof signed off. Cleared to print.',
  printing: 'On the press.',
  quality_check: 'Checking the printed output before it goes out.',
  ready_for_dispatch: 'Packed and waiting to be collected.',
  dispatched: 'Handed to the courier.',
  completed: 'Delivered and closed.',
  cancelled: 'This job will not be produced.',
};
