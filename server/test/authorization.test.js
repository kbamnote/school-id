const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const harness = require('./helpers/harness');
const { seed, as } = require('./helpers/fixtures');

/**
 * Role and file authorisation.
 *
 * Two of these cover bugs that actually shipped during development and were
 * caught late: an end user reading organisation-wide dashboard counts, and a
 * classmate fetching another student's photograph by URL. Both passed the
 * tenant check and needed a second gate.
 */
describe('authorization', () => {
  let app;
  let fx;
  let owner;
  let reviewer;
  let staff;
  let student;
  let otherStudent;

  before(async () => {
    app = await harness.start();
    fx = await seed();

    const User = require('../src/models/User');
    const second = await User.create({
      name: 'Alpha Classmate',
      loginId: 'ALP00002',
      password: 'Passw0rd!23',
      role: 'END_USER',
      organization: fx.orgs.alpha._id,
      status: 'active',
      mustChangePassword: false,
    });
    fx.users.classmate = second;

    [owner, reviewer, staff, student, otherStudent] = await Promise.all([
      as(app, fx.users.alphaOwner),
      as(app, fx.users.alphaReviewer),
      as(app, fx.users.alphaStaff),
      as(app, fx.users.alphaStudent),
      as(app, second),
    ]);
  });

  after(async () => {
    await harness.stop();
  });

  describe('role boundaries', () => {
    test('an end user cannot read the organisation dashboard', async () => {
      // This shipped unguarded once: a student could read org-wide counts and
      // the recent audit feed. Being inside the tenant is not enough.
      const response = await student.get('/api/dashboard');
      assert.equal(response.status, 403);
    });

    test('an end user cannot list the organisation\'s people', async () => {
      const response = await student.get('/api/users');
      assert.equal(response.status, 403);
    });

    test('read-only staff cannot approve submissions', async () => {
      const response = await staff.post('/api/submissions/000000000000000000000001/approve').send({});
      assert.equal(response.status, 403);
    });

    test('a reviewer can approve but cannot send work to production', async () => {
      const canReview = await reviewer.get('/api/submissions?limit=1');
      assert.equal(canReview.status, 200);

      const cannotSend = await reviewer.post('/api/lots').send({
        form: String(fx.forms.alphaForm._id),
        submissions: ['000000000000000000000001'],
      });
      assert.equal(cannotSend.status, 403, 'a reviewer must not be able to create a printing lot');
    });

    test('an owner can do both', async () => {
      const response = await owner.get('/api/dashboard');
      assert.equal(response.status, 200);
    });
  });

  describe('personal files', () => {
    let photoUrl;

    before(async () => {
      const buffer = await sharp({
        create: { width: 600, height: 800, channels: 3, background: '#888' },
      })
        .jpeg()
        .toBuffer();

      const response = await student
        .post(`/api/portal/forms/${fx.forms.alphaForm._id}/upload/photograph`)
        .attach('file', buffer, 'me.jpg');

      assert.ok(
        [200, 201].includes(response.status),
        `upload failed: ${response.status} ${JSON.stringify(response.body)}`
      );
      photoUrl = response.body.data.file.url;
    });

    test('the owner of a photograph can fetch it', async () => {
      const response = await student.get(photoUrl);
      assert.equal(response.status, 200);
      assert.match(response.headers['content-type'], /image/);
    });

    test('a classmate in the same tenant cannot fetch it', async () => {
      // The classmate passes every tenant check - this is exactly the leak
      // that PERSONAL_KINDS exists to close.
      const response = await otherStudent.get(photoUrl);
      assert.equal(response.status, 404);
    });

    test('staff who review submissions can fetch it', async () => {
      const response = await reviewer.get(photoUrl);
      assert.equal(response.status, 200);
    });

    test('an anonymous request cannot fetch it', async () => {
      const request = require('supertest');
      const response = await request(app).get(photoUrl);
      assert.equal(response.status, 401);
    });

    test('a stored file is never served as an inline document', async () => {
      const response = await student.get(photoUrl);
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
    });
  });

  describe('notifications', () => {
    test('are scoped to the recipient, not the tenant', async () => {
      const Notification = require('../src/models/Notification');
      const mine = await Notification.create({
        recipient: fx.users.alphaStudent._id,
        organization: fx.orgs.alpha._id,
        type: 'test.private',
        title: 'Only for the student',
      });

      const own = await student.get('/api/notifications');
      assert.ok(own.body.data.some((n) => n.id === String(mine._id)));

      // Same organisation, different person.
      const classmateView = await otherStudent.get('/api/notifications');
      assert.ok(
        !classmateView.body.data.some((n) => n.id === String(mine._id)),
        'a colleague must not see another person\'s notifications'
      );

      const steal = await otherStudent.post(`/api/notifications/${mine._id}/read`);
      assert.equal(steal.status, 404);
    });
  });
});
