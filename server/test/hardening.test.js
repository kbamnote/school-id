const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const harness = require('./helpers/harness');
const { seed, as } = require('./helpers/fixtures');

/**
 * Production hardening.
 *
 * Checks the protections that are easy to assume and hard to notice missing:
 * security headers, body limits, upload type enforcement, credential
 * handling, and that an unexpected error reveals nothing.
 */
describe('hardening', () => {
  let app;
  let fx;
  let owner;

  before(async () => {
    app = await harness.start();
    fx = await seed();
    owner = await as(app, fx.users.alphaOwner);
  });

  after(async () => {
    await harness.stop();
  });

  describe('http surface', () => {
    test('security headers are present', async () => {
      const response = await request(app).get('/api/');
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.ok(response.headers['x-frame-options'] || response.headers['content-security-policy']);
      assert.equal(response.headers['x-powered-by'], undefined, 'must not advertise Express');
    });

    test('an oversized JSON body is rejected', async () => {
      const huge = { note: 'x'.repeat(2 * 1024 * 1024) };
      const response = await owner.post('/api/forms').send(huge);
      assert.ok(
        [400, 413].includes(response.status),
        `expected a size rejection, got ${response.status}`
      );
    });

    test('an unknown route reveals nothing about the codebase', async () => {
      // Anonymous requests hit `authenticate` before route matching, so an
      // unknown path answers 401 rather than 404 - which is the safer of the
      // two, since it does not confirm whether the route exists.
      const response = await request(app).get('/api/definitely-not-a-route');
      assert.ok([401, 404].includes(response.status), `got ${response.status}`);

      const body = JSON.stringify(response.body);
      assert.ok(!/iCardTracking|node_modules/.test(body), 'no filesystem path in the response');
      assert.ok(!/at\s+\w+\s+\(/.test(body), 'no stack frames in the response');
    });
  });

  describe('credentials', () => {
    test('a password hash is never returned by any endpoint', async () => {
      const response = await owner.get('/api/users?limit=50');
      const body = JSON.stringify(response.body);

      // `mustChangePassword` and `passwordChangedAt` are legitimate metadata;
      // what must never appear is the hash itself or a bare `password` field.
      assert.ok(!/\$2[aby]\$/.test(body), 'no bcrypt hash may appear in a response');
      assert.ok(!/"password"\s*:/.test(body), 'no password field may appear in a listing');
    });

    test('the current user endpoint excludes the hash', async () => {
      const response = await owner.get('/api/auth/me');
      assert.equal(response.status, 200);
      assert.equal(response.body.data.user.password, undefined);
    });

    test('a wrong password is refused', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ loginId: 'owner@alpha.test', password: 'wrong-password' });
      assert.equal(response.status, 401);
    });

    test('sign-in failure does not reveal whether the account exists', async () => {
      const [noSuchUser, wrongPassword] = await Promise.all([
        request(app)
          .post('/api/auth/login')
          .send({ loginId: 'nobody@nowhere.test', password: 'whatever123' }),
        request(app)
          .post('/api/auth/login')
          .send({ loginId: 'owner@alpha.test', password: 'whatever123' }),
      ]);

      assert.equal(noSuchUser.status, wrongPassword.status);
      assert.equal(
        noSuchUser.body.message,
        wrongPassword.body.message,
        'the two cases must be indistinguishable'
      );
    });

    test('password reset never discloses whether the email is registered', async () => {
      const [known, unknown] = await Promise.all([
        request(app).post('/api/auth/forgot-password').send({ email: 'owner@alpha.test' }),
        request(app).post('/api/auth/forgot-password').send({ email: 'ghost@nowhere.test' }),
      ]);

      assert.equal(known.status, unknown.status);
      assert.equal(known.body.message, unknown.body.message);
    });

    test('the refresh cookie is httpOnly and path-scoped', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ loginId: 'owner@alpha.test', password: 'Passw0rd!23' });

      const cookies = response.headers['set-cookie'] || [];
      const refresh = cookies.find((c) => c.startsWith('mrpw_rt='));
      assert.ok(refresh, `a refresh cookie must be issued, got ${JSON.stringify(cookies)}`);
      assert.match(refresh, /HttpOnly/i, 'script must not be able to read the refresh token');
      assert.match(refresh, /SameSite/i);
      assert.match(refresh, /Path=\/api\/auth/i, 'the cookie must not ride on every request');
    });

    test('an access token is not placed in a cookie', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ loginId: 'owner@alpha.test', password: 'Passw0rd!23' });

      const cookies = (response.headers['set-cookie'] || []).join(';');
      const token = response.body.data.accessToken;
      assert.ok(token, 'the access token is returned in the body');
      assert.ok(!cookies.includes(token), 'the access token must stay out of cookies');
    });
  });

  describe('uploads', () => {
    test('a non-image is refused for an image field', async () => {
      const student = await as(app, fx.users.alphaStudent);
      const response = await student
        .post(`/api/portal/forms/${fx.forms.alphaForm._id}/upload/photograph`)
        .attach('file', Buffer.from('<html>not an image</html>'), {
          filename: 'evil.png',
          contentType: 'image/png',
        });

      // The declared mimetype is a lie; the magic-number check must catch it.
      assert.ok(
        [400, 415, 422].includes(response.status),
        `a disguised file must be rejected, got ${response.status}`
      );
    });
  });

  describe('input validation', () => {
    test('an unknown field in a request body is rejected, not stored', async () => {
      const response = await owner.post('/api/forms').send({
        title: 'Strict schema test',
        fields: [{ key: 'a', type: 'short_text', label: 'A' }],
        isSuperSecretAdmin: true,
      });

      if ([200, 201].includes(response.status)) {
        const Form = require('../src/models/Form');
        const created = await Form.findOne({ title: 'Strict schema test' }).lean();
        assert.equal(created.isSuperSecretAdmin, undefined, 'unknown keys must not persist');
      } else {
        assert.ok([400, 422].includes(response.status));
      }
    });

    test('a malformed object id is a clean 400, not a crash', async () => {
      const response = await owner.get('/api/forms/not-a-valid-id');
      assert.ok([400, 404].includes(response.status));
      assert.equal(response.body.success, false);
    });

    test('a mongo operator in a query value cannot alter the query', async () => {
      // express-mongo-sanitize strips $-prefixed keys.
      const response = await request(app)
        .post('/api/auth/login')
        .send({ loginId: { $ne: null }, password: { $ne: null } });

      assert.notEqual(response.status, 200, 'operator injection must never authenticate');
    });
  });
});
