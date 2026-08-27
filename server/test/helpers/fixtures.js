const request = require('supertest');

/**
 * Builds two complete, unrelated tenants plus MR Print World's own staff.
 *
 * Two tenants rather than one is deliberate: almost every security property
 * worth testing here is "A cannot see B", and that is untestable with a
 * single organisation. Records are created through the models rather than the
 * API so a broken endpoint cannot quietly break the fixture too.
 */
async function seed() {
  const Organization = require('../../src/models/Organization');
  const User = require('../../src/models/User');
  const Form = require('../../src/models/Form');
  const { ROLES } = require('../../src/constants/roles');

  const makeOrg = (name, slug) =>
    Organization.create({ name, slug, type: 'school', status: 'active' });

  const [alpha, beta] = await Promise.all([
    makeOrg('Alpha School', 'alpha-school'),
    makeOrg('Beta Corp', 'beta-corp'),
  ]);

  const makeUser = (over) =>
    User.create({
      password: 'Passw0rd!23',
      status: 'active',
      mustChangePassword: false,
      ...over,
    });

  const [superAdmin, alphaOwner, alphaReviewer, alphaStaff, alphaStudent, betaOwner, betaStudent] =
    await Promise.all([
      makeUser({ name: 'Platform Admin', email: 'admin@mrpw.test', role: ROLES.SUPER_ADMIN }),
      makeUser({
        name: 'Alpha Owner',
        email: 'owner@alpha.test',
        role: ROLES.CLIENT_OWNER,
        organization: alpha._id,
      }),
      makeUser({
        name: 'Alpha Reviewer',
        email: 'reviewer@alpha.test',
        role: ROLES.CLIENT_REVIEWER,
        organization: alpha._id,
      }),
      makeUser({
        name: 'Alpha Staff',
        email: 'staff@alpha.test',
        role: ROLES.CLIENT_STAFF,
        organization: alpha._id,
      }),
      makeUser({
        name: 'Alpha Student',
        loginId: 'ALP00001',
        role: ROLES.END_USER,
        organization: alpha._id,
      }),
      makeUser({
        name: 'Beta Owner',
        email: 'owner@beta.test',
        role: ROLES.CLIENT_OWNER,
        organization: beta._id,
      }),
      makeUser({
        name: 'Beta Student',
        loginId: 'BET00001',
        role: ROLES.END_USER,
        organization: beta._id,
      }),
    ]);

  const alphaForm = await Form.create({
    organization: alpha._id,
    title: 'Alpha ID Card',
    slug: 'alpha-id-card',
    status: 'published',
    publishedAt: new Date(),
    createdBy: alphaOwner._id,
    fields: [
      { key: 'full_name', type: 'short_text', label: 'Full Name', required: true, order: 0 },
      { key: 'blood_group', type: 'short_text', label: 'Blood Group', required: false, order: 1 },
      { key: 'photograph', type: 'photo', label: 'Photograph', required: false, order: 2 },
    ],
  });

  const betaForm = await Form.create({
    organization: beta._id,
    title: 'Beta Staff Card',
    slug: 'beta-staff-card',
    status: 'published',
    publishedAt: new Date(),
    createdBy: betaOwner._id,
    fields: [{ key: 'full_name', type: 'short_text', label: 'Full Name', required: true, order: 0 }],
  });

  /*
   * Assigned to the whole organisation, which is what makes the form reachable
   * from the portal at all - an unassigned form is "not found" to an end user,
   * by design.
   */
  const FormAssignment = require('../../src/models/FormAssignment');
  await FormAssignment.create({
    organization: alpha._id,
    form: alphaForm._id,
    scope: 'organization',
    isActive: true,
    assignedBy: alphaOwner._id,
  });

  return {
    orgs: { alpha, beta },
    users: {
      superAdmin,
      alphaOwner,
      alphaReviewer,
      alphaStaff,
      alphaStudent,
      betaOwner,
      betaStudent,
    },
    forms: { alphaForm, betaForm },
  };
}

/** Signs in and returns the access token. */
async function tokenFor(app, user) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ loginId: user.email || user.loginId, password: 'Passw0rd!23' });

  if (!response.body?.data?.accessToken) {
    throw new Error(
      `Could not sign in ${user.email || user.loginId}: ${JSON.stringify(response.body)}`
    );
  }
  return response.body.data.accessToken;
}

/** `as(app, user)` -> a supertest agent that carries that user's token. */
async function as(app, user) {
  const token = await tokenFor(app, user);
  const wrap = (method) => (url) => request(app)[method](url).set('Authorization', `Bearer ${token}`);
  return {
    token,
    get: wrap('get'),
    post: wrap('post'),
    patch: wrap('patch'),
    put: wrap('put'),
    delete: wrap('delete'),
  };
}

module.exports = { seed, tokenFor, as };
