const User = require('../models/User');
const Submission = require('../models/Submission');
const Form = require('../models/Form');
const PrintingLot = require('../models/PrintingLot');
const PrintJob = require('../models/PrintJob');
const Organization = require('../models/Organization');
const { ROLES } = require('../constants/roles');
const { SUBMISSION_STATUS, JOB_STATUS } = require('../constants/workflow');

/**
 * Every report is an aggregation.
 *
 * Nothing here loads documents into Node to be counted - a client with 50,000
 * students would make that approach fall over, and these are exactly the
 * screens someone opens when the data is largest.
 */

/** People broken down by category and by department. */
async function peopleBreakdown(organizationId) {
  const match = { organization: organizationId, role: ROLES.END_USER };

  const [byCategory, byDepartment, byStatus] = await Promise.all([
    User.aggregate([
      { $match: match },
      { $group: { _id: '$orgCategory', count: { $sum: 1 } } },
      {
        $lookup: {
          from: 'orgcategories',
          localField: '_id',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          id: '$_id',
          name: { $ifNull: ['$category.name', 'Uncategorised'] },
          color: '$category.color',
          count: 1,
        },
      },
      { $sort: { count: -1 } },
    ]),

    User.aggregate([
      { $match: { ...match, department: { $ne: null } } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
      { $unwind: { path: '$dept', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          id: '$_id',
          name: { $ifNull: ['$dept.name', 'Unassigned'] },
          kind: '$dept.kind',
          count: 1,
        },
      },
      { $sort: { count: -1 } },
      { $limit: 30 },
    ]),

    User.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  return {
    byCategory,
    byDepartment,
    byStatus: byStatus.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {}),
    total: byCategory.reduce((sum, r) => sum + r.count, 0),
  };
}

/**
 * Completion per form: assigned vs submitted vs approved.
 * The number a client actually chases before a print run.
 */
async function formCompletion(organizationId) {
  const forms = await Form.find({ organization: organizationId, status: { $ne: 'draft' } })
    .select('title status stats')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const rows = await Submission.aggregate([
    { $match: { organization: organizationId } },
    { $group: { _id: { form: '$form', status: '$status' }, count: { $sum: 1 } } },
  ]);

  const byForm = new Map();
  for (const row of rows) {
    const key = String(row._id.form);
    if (!byForm.has(key)) byForm.set(key, {});
    byForm.get(key)[row._id.status] = row.count;
  }

  const DONE = [
    SUBMISSION_STATUS.APPROVED,
    SUBMISSION_STATUS.IN_LOT,
    SUBMISSION_STATUS.SENT_FOR_PRINTING,
    SUBMISSION_STATUS.PRINTED,
    SUBMISSION_STATUS.COMPLETED,
  ];
  const PENDING = [
    SUBMISSION_STATUS.SUBMITTED,
    SUBMISSION_STATUS.RESUBMITTED,
    SUBMISSION_STATUS.UNDER_REVIEW,
  ];

  return forms.map((form) => {
    const counts = byForm.get(String(form._id)) || {};
    const sum = (list) => list.reduce((total, s) => total + (counts[s] || 0), 0);

    const assigned = form.stats?.assignedCount || 0;
    const drafts = counts[SUBMISSION_STATUS.DRAFT] || 0;
    const submitted = Object.entries(counts)
      .filter(([s]) => s !== SUBMISSION_STATUS.DRAFT)
      .reduce((total, [, c]) => total + c, 0);

    return {
      id: String(form._id),
      title: form.title,
      status: form.status,
      assigned,
      drafts,
      submitted,
      pendingReview: sum(PENDING),
      corrections: counts[SUBMISSION_STATUS.CORRECTION_REQUIRED] || 0,
      approved: sum(DONE),
      // Against the people asked, not against those who happened to reply.
      completionPercent: assigned > 0 ? Math.round((submitted / assigned) * 100) : 0,
      notStarted: Math.max(0, assigned - submitted - drafts),
    };
  });
}

/** Printing volume by month, for the last `months` months. */
async function printingVolume(filter, months = 12) {
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1));
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const rows = await PrintingLot.aggregate([
    { $match: { ...filter, submittedAt: { $gte: since, $ne: null } } },
    {
      $group: {
        _id: { year: { $year: '$submittedAt' }, month: { $month: '$submittedAt' } },
        lots: { $sum: 1 },
        cards: { $sum: '$recordCount' },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  // Fill the gaps so a chart does not skip quiet months.
  const map = new Map(rows.map((r) => [`${r._id.year}-${r._id.month}`, r]));
  const series = [];
  const cursor = new Date(since);
  for (let i = 0; i < months; i += 1) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    const hit = map.get(`${y}-${m}`);
    series.push({
      period: `${y}-${String(m).padStart(2, '0')}`,
      label: cursor.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      lots: hit?.lots || 0,
      cards: hit?.cards || 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return series;
}

/** Production jobs grouped by stage. */
async function jobsByStatus(filter = {}) {
  const rows = await PrintJob.aggregate([
    { $match: filter },
    { $group: { _id: '$status', jobs: { $sum: 1 }, cards: { $sum: '$quantity' } } },
    { $sort: { jobs: -1 } },
  ]);
  return rows.map((r) => ({ status: r._id, jobs: r.jobs, cards: r.cards }));
}

/** Client-wise volume - MR Print World's view of who sends the most work. */
async function clientVolume(limit = 20) {
  const rows = await PrintJob.aggregate([
    {
      $group: {
        _id: '$organization',
        jobs: { $sum: 1 },
        cards: { $sum: '$quantity' },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', JOB_STATUS.COMPLETED] }, 1, 0] },
        },
        lastJobAt: { $max: '$receivedAt' },
      },
    },
    { $sort: { cards: -1 } },
    { $limit: limit },
    { $lookup: { from: 'organizations', localField: '_id', foreignField: '_id', as: 'org' } },
    { $unwind: { path: '$org', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        id: '$_id',
        name: { $ifNull: ['$org.name', 'Unknown client'] },
        type: '$org.type',
        jobs: 1,
        cards: 1,
        completed: 1,
        lastJobAt: 1,
      },
    },
  ]);
  return rows;
}

/** Average days from lot submitted to job completed. */
async function turnaround(filter = {}) {
  const rows = await PrintJob.aggregate([
    { $match: { ...filter, status: JOB_STATUS.COMPLETED, completedAt: { $ne: null } } },
    {
      $project: {
        days: {
          $divide: [{ $subtract: ['$completedAt', '$receivedAt'] }, 1000 * 60 * 60 * 24],
        },
        quantity: 1,
      },
    },
    {
      $group: {
        _id: null,
        averageDays: { $avg: '$days' },
        fastestDays: { $min: '$days' },
        slowestDays: { $max: '$days' },
        jobs: { $sum: 1 },
        cards: { $sum: '$quantity' },
      },
    },
  ]);

  const r = rows[0];
  if (!r) return { jobs: 0, cards: 0, averageDays: null, fastestDays: null, slowestDays: null };

  return {
    jobs: r.jobs,
    cards: r.cards,
    averageDays: Math.round(r.averageDays * 10) / 10,
    fastestDays: Math.round(r.fastestDays * 10) / 10,
    slowestDays: Math.round(r.slowestDays * 10) / 10,
  };
}

module.exports = {
  peopleBreakdown,
  formCompletion,
  printingVolume,
  jobsByStatus,
  clientVolume,
  turnaround,
};
