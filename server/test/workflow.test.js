const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/harness');
const { seed, as } = require('./helpers/fixtures');

/**
 * Workflow and data integrity.
 *
 * Each case here is a rule from the specification or a defect found during
 * development: re-approving creating a second approval, a resubmitted record
 * keeping a stale approval stamp, ids being lost in serialisation, and the
 * counter handing out duplicates under concurrency.
 */
describe('workflow', () => {
  let app;
  let fx;
  let owner;
  let student;

  before(async () => {
    app = await harness.start();
    fx = await seed();
    owner = await as(app, fx.users.alphaOwner);
    student = await as(app, fx.users.alphaStudent);
  });

  after(async () => {
    await harness.stop();
  });

  let seq = 0;

  /**
   * Creates a fresh end user and submits the form as them.
   *
   * A person has exactly one submission per form, and approving it locks it -
   * so tests that share one student would interfere with each other. Each case
   * gets its own.
   */
  async function submitForm(values = { full_name: 'Alpha Student', blood_group: 'O+' }) {
    const User = require('../src/models/User');
    seq += 1;

    const person = await User.create({
      name: `Workflow Student ${seq}`,
      loginId: `WFL0000${seq}`,
      password: 'Passw0rd!23',
      role: 'END_USER',
      organization: fx.orgs.alpha._id,
      status: 'active',
      mustChangePassword: false,
    });

    const agent = await as(app, person);
    const response = await agent
      .post(`/api/portal/forms/${fx.forms.alphaForm._id}/submit`)
      .send({ data: values, declarationAccepted: true });

    assert.ok(
      [200, 201].includes(response.status),
      `submit failed: ${JSON.stringify(response.body)}`
    );
    return { id: response.body.data.submissionId, agent, person };
  }

  describe('approval', () => {
    test('re-approving does not create a second approval', async () => {
      const { id } = await submitForm();

      const first = await owner.post(`/api/submissions/${id}/approve`).send({});
      assert.equal(first.status, 200);

      const Submission = require('../src/models/Submission');
      const afterFirst = await Submission.findById(id);
      const stamp = afterFirst.approvedAt;
      const approvals = afterFirst.reviews.filter((r) => r.action === 'approved').length;

      const second = await owner.post(`/api/submissions/${id}/approve`).send({});
      assert.ok([200, 409].includes(second.status));

      const afterSecond = await Submission.findById(id);
      assert.equal(
        afterSecond.reviews.filter((r) => r.action === 'approved').length,
        approvals,
        'a double click must not record two approvals'
      );
      assert.equal(
        String(afterSecond.approvedAt),
        String(stamp),
        'the approval time must not be rewritten'
      );
    });

    test('a correction clears a previous approval stamp', async () => {
      const { id } = await submitForm();
      await owner.post(`/api/submissions/${id}/approve`).send({});

      const Submission = require('../src/models/Submission');
      assert.ok((await Submission.findById(id)).approvedAt, 'precondition: it was approved');

      await owner
        .post(`/api/submissions/${id}/request-correction`)
        .send({ note: 'Please redo the photograph.' });

      const after = await Submission.findById(id);
      assert.equal(after.status, 'correction_required');
      assert.equal(
        after.approvedAt,
        null,
        'a record sent back is not approved - a stale stamp would claim it was signed off'
      );
    });

    test('an incomplete record cannot be approved', async () => {
      // full_name is required; approving around validation would push a broken
      // record into production.
      const Submission = require('../src/models/Submission');
      const { id } = await submitForm();
      await Submission.findByIdAndUpdate(id, { $set: { 'data.full_name': '' } });

      const response = await owner.post(`/api/submissions/${id}/approve`).send({});
      assert.equal(response.status, 422);
    });
  });

  describe('printing lots', () => {
    test('only approved records may enter a lot', async () => {
      const { id } = await submitForm();
      // Deliberately not approved.
      const response = await owner.post('/api/lots').send({
        form: String(fx.forms.alphaForm._id),
        submissions: [id],
      });
      assert.ok(
        [400, 409, 422].includes(response.status),
        `expected a rejection, got ${response.status}`
      );
    });

    test('a lot locks its records against further editing', async () => {
      const { id, agent } = await submitForm();
      await owner.post(`/api/submissions/${id}/approve`).send({});

      const lot = await owner.post('/api/lots').send({
        form: String(fx.forms.alphaForm._id),
        submissions: [id],
      });
      assert.ok([200, 201].includes(lot.status), JSON.stringify(lot.body));

      const sent = await owner.post(`/api/lots/${lot.body.data.lot.id}/submit`).send({});
      assert.equal(sent.status, 200, JSON.stringify(sent.body));

      // Rule 5: after submission to production the data is locked.
      const edit = await agent
        .put(`/api/portal/forms/${fx.forms.alphaForm._id}/draft`)
        .send({ data: { full_name: 'Changed After Printing' } });

      assert.ok(
        [400, 403, 409].includes(edit.status),
        `a locked record must not be editable, got ${edit.status}`
      );
    });
  });

  describe('serialisation', () => {
    test('documents expose id and never _id', async () => {
      const response = await owner.get('/api/forms?limit=1');
      const form = response.body.data[0];
      assert.equal(typeof form.id, 'string');
      assert.ok(!('_id' in form));
      assert.ok(!('__v' in form));
    });

    test('subdocuments keep their own string id', async () => {
      // The global serialize plugin used to overwrite these with undefined,
      // because `_id: false` subdocuments have no _id to map from.
      const CardDesign = require('../src/models/CardDesign');
      const design = await CardDesign.create({
        organization: fx.orgs.alpha._id,
        form: fx.forms.alphaForm._id,
        name: 'Test layout',
        elements: [
          {
            id: 'el_keepme',
            type: 'static',
            text: 'Hello',
            x: 5,
            y: 5,
            width: 40,
            height: 8,
          },
        ],
      });

      const json = design.toJSON();
      assert.equal(json.elements[0].id, 'el_keepme');
    });
  });

  describe('identifier counters', () => {
    test('concurrent allocations are unique and contiguous', async () => {
      const Counter = require('../src/models/Counter');
      const results = await Promise.all(
        Array.from({ length: 25 }, () => Counter.next('test-sequence'))
      );

      const unique = new Set(results.map(Number));
      assert.equal(unique.size, 25, 'every concurrent caller must get a distinct number');
      assert.equal(Math.min(...results.map(Number)), 1);
      assert.equal(Math.max(...results.map(Number)), 25);
    });
  });
});
