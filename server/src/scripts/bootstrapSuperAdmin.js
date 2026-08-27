/**
 * Creates the first MR Print World Super Admin.
 *
 * Credentials come from the environment - never from source - and the script
 * refuses to overwrite an existing super admin, so it is safe to re-run.
 *
 *   npm run bootstrap
 */
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

const { env, validateEnv } = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const Plan = require('../models/Plan');
const { ROLES } = require('../constants/roles');
const { generatePassword } = require('../utils/strings');

const DEFAULT_PLANS = [
  {
    name: 'Starter',
    code: 'STARTER',
    description: 'For a single small institution getting started.',
    limits: { maxUsers: 500, maxForms: 3, maxAdmins: 2, maxCategories: 5, maxStorageMb: 2048, maxSubmissionsPerMonth: -1 },
    features: { bulkImport: true, cardDesigner: false, proofApproval: true, advancedReports: false, apiAccess: false },
    pricing: { amount: 0, currency: 'INR', interval: 'yearly' },
    sortOrder: 1,
    isDefault: true,
  },
  {
    name: 'Professional',
    code: 'PROFESSIONAL',
    description: 'For established schools, colleges and mid-size companies.',
    limits: { maxUsers: 5000, maxForms: 20, maxAdmins: 10, maxCategories: 25, maxStorageMb: 20480, maxSubmissionsPerMonth: -1 },
    features: { bulkImport: true, cardDesigner: true, proofApproval: true, advancedReports: true, apiAccess: false },
    pricing: { amount: 0, currency: 'INR', interval: 'yearly' },
    sortOrder: 2,
  },
  {
    name: 'Enterprise',
    code: 'ENTERPRISE',
    description: 'Unlimited usage with custom limits set by MR Print World.',
    limits: { maxUsers: -1, maxForms: -1, maxAdmins: -1, maxCategories: -1, maxStorageMb: -1, maxSubmissionsPerMonth: -1 },
    features: { bulkImport: true, cardDesigner: true, proofApproval: true, advancedReports: true, apiAccess: true },
    pricing: { amount: 0, currency: 'INR', interval: 'yearly' },
    sortOrder: 3,
  },
];

async function seedPlans() {
  for (const plan of DEFAULT_PLANS) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await Plan.findOne({ code: plan.code });
    if (existing) {
      console.log(`  · plan ${plan.code} already exists, left untouched`);
    } else {
      // eslint-disable-next-line no-await-in-loop
      await Plan.create(plan);
      console.log(`  ✓ plan ${plan.code} created`);
    }
  }
}

/** True when there is no attached terminal (CI, a pipe, an automated run). */
const INTERACTIVE = Boolean(stdin.isTTY && stdout.isTTY);

async function prompt(question, { silent = false } = {}) {
  if (!INTERACTIVE) {
    // Prompting without a TTY would hang forever. Fail loudly instead.
    throw new Error(
      `Cannot prompt for "${question.trim()}" - no interactive terminal. ` +
        'Set SUPER_ADMIN_EMAIL (and optionally SUPER_ADMIN_NAME / SUPER_ADMIN_PASSWORD) in the environment and re-run.'
    );
  }
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
  try {
    if (!silent) return (await rl.question(question)).trim();
    // Minimal masking so a password is not echoed into the terminal history.
    const answer = await new Promise((resolve) => {
      const onData = (char) => {
        if (['\n', '\r', '\u0004'].includes(char.toString())) stdin.pause();
      };
      stdin.on('data', onData);
      rl.question(question).then((v) => {
        stdin.off('data', onData);
        resolve(v.trim());
      });
      rl._writeToOutput = (str) => {
        if (str.includes(question)) rl.output.write(str);
        else rl.output.write('*');
      };
    });
    stdout.write('\n');
    return answer;
  } finally {
    rl.close();
  }
}

async function run() {
  validateEnv();
  await connectDB();

  console.log('\nMR PRINT WORLD - initial setup\n');

  console.log('Subscription plans:');
  await seedPlans();

  const existing = await User.findOne({ role: ROLES.SUPER_ADMIN }).lean();
  if (existing) {
    console.log(
      `\nA super admin already exists (${existing.email}). ` +
        'Refusing to create another - use the Super Admin portal to add platform staff.\n'
    );
    return;
  }

  let name = env.bootstrap.name;
  let email = env.bootstrap.email;
  let password = env.bootstrap.password;
  let generated = false;

  if (!email) email = await prompt('Super admin email: ');
  if (!name) name = (await prompt('Super admin name [MR Print World Admin]: ')) || 'MR Print World Admin';
  if (!password) {
    password = INTERACTIVE
      ? await prompt('Super admin password (blank = generate one): ', { silent: true })
      : '';
    if (!password) {
      password = generatePassword(14);
      generated = true;
    }
  }

  if (!email || !email.includes('@')) {
    throw new Error('A valid email address is required.');
  }
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    role: ROLES.SUPER_ADMIN,
    organization: null,
    status: 'active',
    // A generated password is temporary and must be replaced at first sign-in.
    mustChangePassword: generated,
  });

  console.log('\n  ✓ Super admin created');
  console.log(`    email : ${user.email}`);
  if (generated) {
    console.log(`    password: ${password}`);
    console.log('    (temporary - you will be asked to change it at first sign-in)');
  }
  console.log(
    '\nRemove SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD from your .env now.\n'
  );
}

run()
  .catch((err) => {
    console.error('\nBootstrap failed:', err.message, '\n');
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB();
    process.exit(process.exitCode || 0);
  });
