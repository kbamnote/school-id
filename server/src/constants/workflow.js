/**
 * Workflow state machines.
 *
 * Transitions are declared as data, not scattered `if` statements, so an
 * illegal jump (e.g. Submitted -> Printed, skipping approval) is impossible
 * to express rather than merely discouraged.
 */

/* ----------------------------- SUBMISSION -------------------------------- */
const SUBMISSION_STATUS = {
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

const SUBMISSION_TRANSITIONS = {
  [SUBMISSION_STATUS.NOT_STARTED]: [SUBMISSION_STATUS.DRAFT, SUBMISSION_STATUS.SUBMITTED],
  [SUBMISSION_STATUS.DRAFT]: [SUBMISSION_STATUS.DRAFT, SUBMISSION_STATUS.SUBMITTED],
  [SUBMISSION_STATUS.SUBMITTED]: [
    SUBMISSION_STATUS.UNDER_REVIEW,
    SUBMISSION_STATUS.CORRECTION_REQUIRED,
    SUBMISSION_STATUS.APPROVED,
    SUBMISSION_STATUS.REJECTED,
  ],
  [SUBMISSION_STATUS.UNDER_REVIEW]: [
    SUBMISSION_STATUS.CORRECTION_REQUIRED,
    SUBMISSION_STATUS.APPROVED,
    SUBMISSION_STATUS.REJECTED,
  ],
  [SUBMISSION_STATUS.CORRECTION_REQUIRED]: [
    SUBMISSION_STATUS.RESUBMITTED,
    SUBMISSION_STATUS.REJECTED,
  ],
  [SUBMISSION_STATUS.RESUBMITTED]: [
    SUBMISSION_STATUS.UNDER_REVIEW,
    SUBMISSION_STATUS.CORRECTION_REQUIRED,
    SUBMISSION_STATUS.APPROVED,
    SUBMISSION_STATUS.REJECTED,
  ],
  // Approved records can be pulled back for correction right up until they
  // enter a lot - after that the lot has to release them first.
  [SUBMISSION_STATUS.APPROVED]: [
    SUBMISSION_STATUS.IN_LOT,
    SUBMISSION_STATUS.CORRECTION_REQUIRED,
  ],
  [SUBMISSION_STATUS.IN_LOT]: [
    SUBMISSION_STATUS.SENT_FOR_PRINTING,
    SUBMISSION_STATUS.APPROVED, // removed from lot
    SUBMISSION_STATUS.CORRECTION_REQUIRED, // data issue raised by production
  ],
  [SUBMISSION_STATUS.SENT_FOR_PRINTING]: [
    SUBMISSION_STATUS.PRINTED,
    SUBMISSION_STATUS.CORRECTION_REQUIRED, // production found a data problem
  ],
  [SUBMISSION_STATUS.PRINTED]: [SUBMISSION_STATUS.COMPLETED],
  [SUBMISSION_STATUS.COMPLETED]: [],
  [SUBMISSION_STATUS.REJECTED]: [SUBMISSION_STATUS.CORRECTION_REQUIRED],
};

/** Only these may be pulled into a printing lot. */
const LOT_ELIGIBLE_SUBMISSION_STATUSES = [SUBMISSION_STATUS.APPROVED];

/** Once a submission reaches one of these, the end user can no longer edit it. */
const SUBMISSION_LOCKED_STATUSES = [
  SUBMISSION_STATUS.APPROVED,
  SUBMISSION_STATUS.IN_LOT,
  SUBMISSION_STATUS.SENT_FOR_PRINTING,
  SUBMISSION_STATUS.PRINTED,
  SUBMISSION_STATUS.COMPLETED,
];

/* -------------------------------- LOT ------------------------------------ */
const LOT_STATUS = {
  DRAFT: 'draft',
  READY: 'ready',
  SUBMITTED: 'submitted', // handed to MR Print World
  IN_PRODUCTION: 'in_production',
  RETURNED: 'returned', // data issue sent back to the client
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const LOT_TRANSITIONS = {
  /**
   * A draft may be sent directly.
   *
   * `ready` is an optional bookkeeping signal for teams that want a separate
   * sign-off step; it is not a safety gate. The real gates are the pre-flight
   * validation and the confirmation dialog, both of which run either way -
   * so requiring two clicks would add friction without adding protection.
   */
  [LOT_STATUS.DRAFT]: [LOT_STATUS.READY, LOT_STATUS.SUBMITTED, LOT_STATUS.CANCELLED],
  [LOT_STATUS.READY]: [LOT_STATUS.SUBMITTED, LOT_STATUS.DRAFT, LOT_STATUS.CANCELLED],
  [LOT_STATUS.SUBMITTED]: [LOT_STATUS.IN_PRODUCTION, LOT_STATUS.RETURNED, LOT_STATUS.CANCELLED],
  [LOT_STATUS.IN_PRODUCTION]: [LOT_STATUS.RETURNED, LOT_STATUS.COMPLETED, LOT_STATUS.CANCELLED],
  [LOT_STATUS.RETURNED]: [LOT_STATUS.SUBMITTED, LOT_STATUS.CANCELLED],
  [LOT_STATUS.COMPLETED]: [],
  [LOT_STATUS.CANCELLED]: [],
};

/* ------------------------------ PRINT JOB -------------------------------- */
const JOB_STATUS = {
  RECEIVED: 'received',
  DATA_VERIFICATION: 'data_verification',
  DATA_ISSUE: 'data_issue',
  DESIGN_PROCESSING: 'design_processing',
  PROOF_READY: 'proof_ready',
  AWAITING_CLIENT_APPROVAL: 'awaiting_client_approval',
  APPROVED_FOR_PRINTING: 'approved_for_printing',
  PRINTING: 'printing',
  QUALITY_CHECK: 'quality_check',
  READY_FOR_DISPATCH: 'ready_for_dispatch',
  DISPATCHED: 'dispatched',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

/** Display order for kanban columns and progress bars. */
const JOB_STATUS_ORDER = [
  JOB_STATUS.RECEIVED,
  JOB_STATUS.DATA_VERIFICATION,
  JOB_STATUS.DATA_ISSUE,
  JOB_STATUS.DESIGN_PROCESSING,
  JOB_STATUS.PROOF_READY,
  JOB_STATUS.AWAITING_CLIENT_APPROVAL,
  JOB_STATUS.APPROVED_FOR_PRINTING,
  JOB_STATUS.PRINTING,
  JOB_STATUS.QUALITY_CHECK,
  JOB_STATUS.READY_FOR_DISPATCH,
  JOB_STATUS.DISPATCHED,
  JOB_STATUS.COMPLETED,
];

const JOB_TRANSITIONS = {
  [JOB_STATUS.RECEIVED]: [JOB_STATUS.DATA_VERIFICATION, JOB_STATUS.CANCELLED],
  [JOB_STATUS.DATA_VERIFICATION]: [
    JOB_STATUS.DATA_ISSUE,
    JOB_STATUS.DESIGN_PROCESSING,
    JOB_STATUS.CANCELLED,
  ],
  // A returned job re-enters verification once the client has fixed the data.
  [JOB_STATUS.DATA_ISSUE]: [JOB_STATUS.DATA_VERIFICATION, JOB_STATUS.CANCELLED],
  [JOB_STATUS.DESIGN_PROCESSING]: [
    JOB_STATUS.PROOF_READY,
    JOB_STATUS.DATA_ISSUE,
    JOB_STATUS.CANCELLED,
  ],
  [JOB_STATUS.PROOF_READY]: [JOB_STATUS.AWAITING_CLIENT_APPROVAL, JOB_STATUS.CANCELLED],
  [JOB_STATUS.AWAITING_CLIENT_APPROVAL]: [
    JOB_STATUS.APPROVED_FOR_PRINTING,
    JOB_STATUS.DESIGN_PROCESSING, // client requested changes -> new proof version
    JOB_STATUS.CANCELLED,
  ],
  [JOB_STATUS.APPROVED_FOR_PRINTING]: [JOB_STATUS.PRINTING, JOB_STATUS.CANCELLED],
  [JOB_STATUS.PRINTING]: [JOB_STATUS.QUALITY_CHECK, JOB_STATUS.CANCELLED],
  [JOB_STATUS.QUALITY_CHECK]: [
    JOB_STATUS.READY_FOR_DISPATCH,
    JOB_STATUS.PRINTING, // reprint after a failed QC
    JOB_STATUS.CANCELLED,
  ],
  [JOB_STATUS.READY_FOR_DISPATCH]: [JOB_STATUS.DISPATCHED, JOB_STATUS.CANCELLED],
  [JOB_STATUS.DISPATCHED]: [JOB_STATUS.COMPLETED],
  [JOB_STATUS.COMPLETED]: [],
  [JOB_STATUS.CANCELLED]: [],
};

/* -------------------------------- PROOF ---------------------------------- */
const PROOF_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes_requested',
  SUPERSEDED: 'superseded',
};

/* ------------------------------ ORGANISATION ----------------------------- */
const ORG_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
};

const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
};

/** Generic guard shared by every state machine above. */
function canTransition(map, from, to) {
  return Boolean(map[from]?.includes(to));
}

module.exports = {
  SUBMISSION_STATUS,
  SUBMISSION_TRANSITIONS,
  SUBMISSION_LOCKED_STATUSES,
  LOT_ELIGIBLE_SUBMISSION_STATUSES,
  LOT_STATUS,
  LOT_TRANSITIONS,
  JOB_STATUS,
  JOB_STATUS_ORDER,
  JOB_TRANSITIONS,
  PROOF_STATUS,
  ORG_STATUS,
  USER_STATUS,
  canTransition,
};
