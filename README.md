# MR Print World — Print Data Platform

A multi-tenant SaaS for collecting, verifying and printing personalised card data.

End users fill a digital form → their organisation verifies and approves it →
approved records are grouped into a printing lot → the lot is sent to MR Print
World → a proof is signed off → the cards are printed and dispatched.

---

## Running it

```bash
npm run install:all
```

Copy `server/.env.example` to `server/.env` and fill it in, then:

```bash
npm run dev
```

That starts the API on `:5000` and the web app on `:5173` together.

**Create the first administrator** (idempotent — it refuses to create a second):

```bash
npm run bootstrap
```

Remove `SUPER_ADMIN_PASSWORD` from `.env` once that has run.

---

## The database name matters

`MONGO_URI` **must end in an explicit database name**. A URI without one
resolves to `test`, which on a shared Atlas cluster is very likely somebody
else's live data:

```
mongodb+srv://user:pass@cluster.mongodb.net/mrpw_printdata
                                           ^^^^^^^^^^^^^^ required
```

`npm run readiness` fails the build if this is missing.

---

## Tests

```bash
npm test
```

Runs against a throwaway in-memory MongoDB — it never touches a real database.
The suite covers the properties that must not regress:

| Area | What it pins down |
|---|---|
| `isolation.test.js` | One tenant can never read, edit or discover another's data |
| `authorization.test.js` | Role boundaries, and that personal photographs stay private |
| `workflow.test.js` | Approval rules, production locking, id allocation under concurrency |
| `cardRendering.test.js` | The live preview and the print renderer agree |
| `hardening.test.js` | Headers, credential handling, upload and injection defences |

---

## Before deploying

```bash
npm run readiness
```

Exits non-zero on anything unsafe, so it can gate a pipeline. It checks the
database name, that JWT secrets are real and distinct, storage and mail
configuration, rate limits, proxy trust, and that indexes build cleanly.

Set in production:

| Variable | Why |
|---|---|
| `NODE_ENV=production` | Sanitises error responses; makes cookies `Secure` |
| `TRUST_PROXY=true` | Behind a load balancer, or rate limiting sees one IP for everyone |
| `STORAGE_DRIVER=cloudinary` | Local uploads die with the container |
| `MAIL_DRIVER=smtp` | Otherwise password resets are only written to the log |

---

## How it is put together

```
server/
  src/
    config/       env validation, database connection
    constants/    roles, permissions, workflow state machines, field types
    controllers/  HTTP handlers
    middleware/   auth, tenant scoping, validation, uploads, rate limits
    models/       Mongoose schemas
    routes/       route tables, one per portal
    services/     business logic, storage and mail drivers, rendering, export
    scripts/      bootstrap, seed, readiness check
  test/
client/
  src/
    api/          one module per resource
    components/   shared UI
    context/      auth, toasts, notifications
    features/     form builder, card designer, portal
    layouts/      the three portal shells
    pages/        routed screens
    routes/       route table with permission guards
```

### Three rules worth knowing before changing anything

**Tenant scope comes from the token, never the request.** `req.tenantId` is
derived only from a verified JWT, `stripClientTenant` deletes any organisation
id a client tries to send, and `tenantScope(req)` force-injects the filter.
Cross-tenant reads return **404, not 403** — a 403 would confirm the record
exists.

**Roles and categories are different things.** `User.role` is a fixed security
enum. An organisation's categories (Student, Teacher, Driver) are tenant data
and carry *zero* authorisation meaning, so a client renaming a category can
never widen anyone's access.

**Approved data is frozen.** Submissions store a `formSnapshot` of the fields
as they stood at submission time, so editing a published form cannot
retroactively change records already approved for printing.

---

## The card designer

An organisation lays out its card once: upload the front (and optionally back)
artwork, then position each element and bind it to a form field.

Every coordinate and font size is stored as a **percentage** of the card, never
pixels. That is what lets one component render the 240px preview a student
watches while typing, the designer canvas, and the 638×1016 print file
identically.

`server/src/services/card.service.js` and
`client/src/features/cardDesigner/resolveValue.js` **mirror each other
exactly** — the student approves what the preview draws and receives what the
server renders. A test fails if the two drift apart. Change both together.

Print packages ship `cards/<LOGINID>-front.png` at full print resolution
alongside `data.csv`, `data.xlsx` and the raw photographs.
