const Proof = require('../models/Proof');
const PrintJob = require('../models/PrintJob');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, paginated } = require('../utils/apiResponse');
const { parsePagination, mergeFilters, assertObjectId } = require('../utils/query');
const { tenantScope } = require('../middleware/tenant');
const uploadService = require('../services/upload.service');
const jobService = require('../services/job.service');
const audit = require('../services/audit.service');
const notifications = require('../services/notification.service');
const { PERMISSIONS } = require('../constants/permissions');
const { PROOF_STATUS, JOB_STATUS } = require('../constants/workflow');

/* ========================================================================== */
/* MR PRINT WORLD                                                             */
/* ========================================================================== */

/**
 * POST /api/super-admin/jobs/:id/proofs
 *
 * Uploads a new proof version and puts the job in front of the client.
 * Any earlier pending proof is superseded rather than deleted, so the history
 * of what was shown remains reconstructable.
 */
const upload = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'job id');

  const job = await PrintJob.findById(req.params.id);
  if (!job) throw ApiError.notFound('Job not found');
  if (!req.file) throw ApiError.badRequest('Attach the proof file to upload.');

  // Uploading a proof is only meaningful once the artwork exists.
  const allowed = [
    JOB_STATUS.DESIGN_PROCESSING,
    JOB_STATUS.PROOF_READY,
    JOB_STATUS.AWAITING_CLIENT_APPROVAL,
  ];
  if (!allowed.includes(job.status)) {
    throw ApiError.conflict(
      `A proof cannot be uploaded while the job is in "${job.status.replace(/_/g, ' ')}". Move it to design processing first.`,
      { code: 'PROOF_NOT_ALLOWED_YET', details: { status: job.status } }
    );
  }

  const version = await Proof.nextVersion(job._id);

  const { upload: uploadRecord, stored } = await uploadService.store(req.file, {
    organization: job.organization,
    kind: 'proof',
    uploadedBy: req.user._id,
    // A proof shows real people's data - never publicly served.
    isPublic: false,
    folder: `proofs/${job.organization}`,
  });

  // Older pending versions are superseded, not removed.
  await Proof.updateMany(
    { job: job._id, status: PROOF_STATUS.PENDING },
    { $set: { status: PROOF_STATUS.SUPERSEDED, supersededAt: new Date() } }
  );

  const proof = await Proof.create({
    organization: job.organization,
    job: job._id,
    jobNumber: job.jobNumber,
    lot: job.lot,
    version,
    file: {
      upload: uploadRecord._id,
      url: stored.url,
      publicId: stored.publicId,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      bytes: stored.bytes,
      width: stored.width,
      height: stored.height,
    },
    notes: req.body.notes || '',
    status: PROOF_STATUS.PENDING,
    uploadedBy: req.user._id,
  });

  job.proofVersion = version;
  // proof_ready is a transient step; the client needs it in front of them.
  if (job.status === JOB_STATUS.DESIGN_PROCESSING) {
    await jobService.changeStatus(job, JOB_STATUS.PROOF_READY, {
      actor: req.user,
      note: `Proof v${version} uploaded`,
    });
  }
  if (job.status === JOB_STATUS.PROOF_READY) {
    await jobService.changeStatus(job, JOB_STATUS.AWAITING_CLIENT_APPROVAL, {
      actor: req.user,
      note: `Proof v${version} sent to the client`,
    });
  }
  await job.save();

  await audit.record(req, {
    action: audit.ACTIONS.PROOF_UPLOADED,
    entityType: 'Proof',
    entity: proof._id,
    entityLabel: `${job.jobNumber} v${version}`,
    description: `Proof version ${version} uploaded for ${job.jobNumber} and sent to ${job.organizationName}`,
    organization: job.organization,
    severity: 'warning',
  });

  /*
   * A proof blocks the whole job until someone signs it off, so this emails
   * as well - it is the step most likely to sit unnoticed for days.
   */
  await notifications.notifyPermission(
    job.organization,
    PERMISSIONS.PROOFS_APPROVE,
    {
      type: notifications.TYPES.PROOF_READY,
      title: `Proof v${version} is ready for your approval`,
      body: `${job.jobNumber} is waiting on your sign-off before it can be printed.`,
      link: `/client/proofs/${proof._id}`,
      entityType: 'Proof',
      entity: proof._id,
      severity: 'warning',
    },
    { actor: req.user._id, actorName: req.user.name, email: true }
  );

  return created(res, { proof, job }, `Proof v${version} sent to the client`);
});

/** GET /api/super-admin/proofs - every proof awaiting a client decision. */
const platformList = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const filter = mergeFilters(
    req.query.status ? { status: req.query.status } : null,
    req.query.organization ? { organization: req.query.organization } : null
  );

  const [items, total] = await Promise.all([
    Proof.find(filter)
      .populate('organization', 'name slug')
      .populate('uploadedBy', 'name')
      .populate('decidedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Proof.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
});

/** GET /api/super-admin/jobs/:id/proofs - the version history for one job. */
const jobProofs = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'job id');
  const proofs = await Proof.find({ job: req.params.id })
    .populate('uploadedBy', 'name')
    .populate('decidedBy', 'name')
    .sort({ version: -1 });
  return ok(res, { proofs });
});

/* ========================================================================== */
/* CLIENT                                                                     */
/* ========================================================================== */

/** GET /api/proofs - the client's own proofs, newest first. */
const clientList = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const filter = mergeFilters(
    tenantScope(req),
    req.query.status ? { status: req.query.status } : null
  );

  const [items, total] = await Promise.all([
    Proof.find(filter)
      .populate('decidedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Proof.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
});

/** GET /api/proofs/:id - one proof, with its earlier versions for comparison. */
const clientGet = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'proof id');

  const proof = await Proof.findOne({ _id: req.params.id, ...tenantScope(req) })
    .populate('decidedBy', 'name');
  if (!proof) throw ApiError.notFound('Proof not found');

  const [job, history] = await Promise.all([
    PrintJob.findById(proof.job).select('jobNumber lotNumber formTitle quantity status'),
    Proof.find({ job: proof.job, _id: { $ne: proof._id } })
      .select('version status notes decidedByName decidedAt file.url createdAt')
      .sort({ version: -1 }),
  ]);

  return ok(res, { proof, job, history });
});

/**
 * POST /api/proofs/:id/decision
 *
 * The client's sign-off, or a request for changes.
 *
 * Approval is what authorises spending materials, so it is recorded against a
 * specific version with a name and a timestamp - never against "the proof".
 */
const decide = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'proof id');
  const { decision, comment } = req.body;

  const proof = await Proof.findOne({ _id: req.params.id, ...tenantScope(req) });
  if (!proof) throw ApiError.notFound('Proof not found');

  if (proof.status !== PROOF_STATUS.PENDING) {
    throw ApiError.conflict(
      proof.status === PROOF_STATUS.SUPERSEDED
        ? 'A newer version of this proof has been sent. Please review that one instead.'
        : `This proof was already ${proof.status.replace(/_/g, ' ')} on ${proof.decidedAt?.toLocaleDateString('en-IN')}.`,
      { code: 'PROOF_ALREADY_DECIDED', details: { status: proof.status } }
    );
  }

  const job = await PrintJob.findById(proof.job);
  if (!job) throw ApiError.notFound('The job behind this proof no longer exists');

  if (decision === 'changes_requested' && !comment?.trim()) {
    throw ApiError.badRequest('Say what needs changing so MR Print World can act on it.', {
      code: 'COMMENT_REQUIRED',
    });
  }

  proof.status =
    decision === 'approve' ? PROOF_STATUS.APPROVED : PROOF_STATUS.CHANGES_REQUESTED;
  proof.decidedBy = req.user._id;
  proof.decidedByName = req.user.name;
  proof.decidedAt = new Date();
  proof.decisionComment = comment || '';
  await proof.save();

  if (decision === 'approve') {
    job.approvedProof = proof._id;
    await jobService.changeStatus(job, JOB_STATUS.APPROVED_FOR_PRINTING, {
      actor: req.user,
      note: `Proof v${proof.version} approved by ${req.user.name}`,
    });
  } else {
    // Back to design so a new version can be produced.
    await jobService.changeStatus(job, JOB_STATUS.DESIGN_PROCESSING, {
      actor: req.user,
      note: `Changes requested on proof v${proof.version}: ${comment}`,
    });
  }

  await audit.record(req, {
    action:
      decision === 'approve'
        ? audit.ACTIONS.PROOF_APPROVED
        : audit.ACTIONS.PROOF_CHANGES_REQUESTED,
    entityType: 'Proof',
    entity: proof._id,
    entityLabel: `${proof.jobNumber} v${proof.version}`,
    description:
      decision === 'approve'
        ? `${req.user.name} approved proof v${proof.version} for ${proof.jobNumber} - cleared for printing`
        : `${req.user.name} requested changes on proof v${proof.version}: ${comment}`,
    organization: proof.organization,
    severity: 'critical',
  });

  await notifications.notifyPlatform(
    PERMISSIONS.PROOFS_UPLOAD,
    {
      type:
        decision === 'approve'
          ? notifications.TYPES.PROOF_APPROVED
          : notifications.TYPES.PROOF_CHANGES_REQUESTED,
      title:
        decision === 'approve'
          ? `${proof.jobNumber} proof approved - cleared to print`
          : `${proof.jobNumber} proof needs changes`,
      body:
        decision === 'approve'
          ? `${req.user.name} signed off proof v${proof.version}.`
          : comment,
      link: `/super-admin/jobs/${proof.job}`,
      entityType: 'Proof',
      entity: proof._id,
      severity: decision === 'approve' ? 'success' : 'warning',
    },
    { actor: req.user._id, actorName: req.user.name }
  );

  return ok(
    res,
    { proof, job },
    decision === 'approve'
      ? `Proof v${proof.version} approved. MR Print World can now print.`
      : 'Change request sent to MR Print World.'
  );
});

module.exports = {
  upload,
  platformList,
  jobProofs,
  clientList,
  clientGet,
  decide,
};
