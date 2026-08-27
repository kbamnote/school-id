const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/harness');
const { seed, as } = require('./helpers/fixtures');

/**
 * Multi-tenant isolation.
 *
 * These are the properties that must never regress. Each one corresponds to a
 * real failure mode: a client reading another client's data, a client
 * discovering that another client's record exists, or a request smuggling an
 * organisation id past the tenant guard.
 */
describe('tenant isolation', () => {
  let app;
  let fx;
  let alpha;
  let beta;
  let platform;

  before(async () => {
    app = await harness.start();
    fx = await seed();
    alpha = await as(app, fx.users.alphaOwner);
    beta = await as(app, fx.users.betaOwner);
    platform = await as(app, fx.users.superAdmin);
  });

  after(async () => {
    await harness.stop();
  });

  test('a client cannot read another tenant\'s form', async () => {
    const response = await beta.get(`/api/forms/${fx.forms.alphaForm._id}`);
    assert.equal(response.status, 404);
  });

  test('cross-tenant reads answer 404, never 403', async () => {
    // A 403 would confirm the record exists, which is itself a disclosure:
    // it tells Beta that this id is a real Alpha form.
    const response = await beta.get(`/api/forms/${fx.forms.alphaForm._id}`);
    assert.equal(response.status, 404, 'must not distinguish "forbidden" from "absent"');
    assert.ok(!JSON.stringify(response.body).includes('Alpha'));
  });

  test('a client cannot edit another tenant\'s form', async () => {
    const response = await beta
      .patch(`/api/forms/${fx.forms.alphaForm._id}`)
      .send({ title: 'Hijacked' });
    assert.equal(response.status, 404);

    const Form = require('../src/models/Form');
    const untouched = await Form.findById(fx.forms.alphaForm._id);
    assert.equal(untouched.title, 'Alpha ID Card');
  });

  test('a listing returns only the caller\'s own tenant', async () => {
    const response = await alpha.get('/api/forms?limit=100');
    assert.equal(response.status, 200);
    assert.ok(response.body.data.length > 0);
    for (const form of response.body.data) {
      assert.notEqual(form.title, 'Beta Staff Card');
    }
  });

  test('an organization id in the body cannot move a record to another tenant', async () => {
    // stripClientTenant must delete this before any handler sees it.
    const response = await alpha.post('/api/forms').send({
      title: 'Smuggled',
      organization: String(fx.orgs.beta._id),
      fields: [{ key: 'a', type: 'short_text', label: 'A' }],
    });

    assert.ok([200, 201].includes(response.status), `unexpected ${response.status}`);

    const Form = require('../src/models/Form');
    const created = await Form.findOne({ title: 'Smuggled' });
    assert.equal(
      String(created.organization),
      String(fx.orgs.alpha._id),
      'the tenant must come from the token, never the payload'
    );
  });

  test('an organization query parameter cannot widen a client audit read', async () => {
    const response = await beta.get(
      `/api/audit?organization=${fx.orgs.alpha._id}&limit=100`
    );
    assert.equal(response.status, 200);
    for (const entry of response.body.data) {
      assert.notEqual(String(entry.organization), String(fx.orgs.alpha._id));
    }
  });

  test('platform staff can read across tenants', async () => {
    const response = await platform.get('/api/super-admin/organizations?limit=100');
    assert.equal(response.status, 200);
    const names = response.body.data.map((c) => c.name);
    assert.ok(names.includes('Alpha School'));
    assert.ok(names.includes('Beta Corp'));
  });

  test('a client cannot reach the platform API at all', async () => {
    const response = await alpha.get('/api/super-admin/organizations');
    assert.equal(response.status, 403);
  });
});
