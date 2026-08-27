import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardHeader, CardBody, CardFooter } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import CredentialsDialog from '../../components/CredentialsDialog.jsx';
import { usersApi } from '../../api/clientApi.js';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatBytes } from '../../utils/format.js';

const STEPS = ['Upload file', 'Map columns', 'Review', 'Done'];

function Stepper({ current }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2">
      {STEPS.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'todo';
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={clsx(
                'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium',
                state === 'active' && 'bg-brand-600 text-white',
                state === 'done' && 'bg-success-50 text-success-700',
                state === 'todo' && 'bg-white text-ink-500 ring-1 ring-ink-200'
              )}
            >
              <span
                className={clsx(
                  'grid size-4 place-items-center rounded-full text-[0.625rem] font-semibold',
                  state === 'active' && 'bg-white/25',
                  state === 'done' && 'bg-success-500 text-white',
                  state === 'todo' && 'bg-ink-200 text-ink-600'
                )}
              >
                {state === 'done' ? '✓' : i + 1}
              </span>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="text-ink-300" aria-hidden="true">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

export default function UserImportPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const fileInput = useRef(null);

  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [committing, setCommitting] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [dragging, setDragging] = useState(false);

  const runParse = useCallback(
    async (theFile, theMapping) => {
      setParsing(true);
      try {
        const res = await usersApi.parseImport(theFile, theMapping);
        setParsed(res);
        setMapping(res.mapping);
        setStep(theMapping ? 2 : 1);
      } catch (err) {
        toast.error(errorMessage(err));
        setFile(null);
      } finally {
        setParsing(false);
      }
    },
    [toast]
  );

  const onFile = (selected) => {
    if (!selected) return;
    setFile(selected);
    runParse(selected, null);
  };

  const commit = async () => {
    setCommitting(true);
    try {
      const valid = parsed.rows.filter((r) => r.valid);
      const res = await usersApi.commitImport(valid);
      setCredentials(res.credentials);
      setStep(3);
      toast.success(`${res.count} user${res.count === 1 ? '' : 's'} imported.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCommitting(false);
    }
  };

  const summary = parsed?.summary;

  return (
    <>
      <PageHeader
        title="Import users"
        subtitle="Create hundreds of accounts from a spreadsheet. Nothing is saved until you confirm."
        breadcrumbs={[
          { label: 'Dashboard', to: '/client' },
          { label: 'Users', to: '/client/users' },
          { label: 'Import' },
        ]}
        actions={
          <Button variant="secondary" icon={Download} onClick={() => usersApi.downloadTemplate()}>
            Download template
          </Button>
        }
      />

      <div className="max-w-5xl">
        <Stepper current={step} />

        {/* ---------------------------- step 1 ---------------------------- */}
        {step === 0 && (
          <Card>
            <CardHeader title="Choose a file" icon={FileSpreadsheet} />
            <CardBody>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  onFile(e.dataTransfer.files?.[0]);
                }}
                className={clsx(
                  'flex flex-col items-center justify-center rounded-card border-2 border-dashed px-6 py-12 text-center transition',
                  dragging ? 'border-brand-400 bg-brand-50' : 'border-ink-300 bg-ink-50/50'
                )}
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-white text-brand-600 shadow-panel">
                  <Upload size={22} aria-hidden="true" />
                </span>
                <p className="mt-4 text-sm font-medium text-ink-900">
                  Drop a CSV or Excel file here
                </p>
                <p className="mt-1 text-sm text-ink-500">or</p>
                <Button
                  variant="secondary"
                  className="mt-3"
                  loading={parsing}
                  onClick={() => fileInput.current?.click()}
                >
                  Browse files
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                <p className="mt-4 text-xs text-ink-400">CSV or XLSX, up to 12 MB and 5,000 rows</p>
              </div>

              <div className="mt-5 rounded-lg bg-info-50 p-3.5">
                <p className="text-sm font-medium text-info-800">Expected columns</p>
                <p className="mt-1 text-sm leading-relaxed text-info-700">
                  Name and Category are required. Email, Phone, Department and External ID are
                  optional. Common header names are recognised automatically — “Full Name”,
                  “Mobile”, “Admission No” and so on all map correctly.
                </p>
              </div>
            </CardBody>
          </Card>
        )}

        {/* ---------------------------- step 2 ---------------------------- */}
        {step === 1 && parsed && (
          <Card>
            <CardHeader
              title="Match your columns"
              subtitle={`${file?.name} · ${formatBytes(file?.size)} · ${parsed.rows.length} rows`}
              icon={FileSpreadsheet}
            />
            <CardBody>
              <p className="mb-4 text-sm leading-relaxed text-ink-600">
                We matched these automatically. Change any that are wrong, or set a column to
                “Ignore” to skip it.
              </p>
              <div className="space-y-3">
                {parsed.headers.map((header) => (
                  <div key={header} className="flex flex-wrap items-center gap-3">
                    <span className="min-w-[10rem] truncate rounded-lg bg-ink-100 px-3 py-2 font-mono text-xs text-ink-700">
                      {header}
                    </span>
                    <span className="text-ink-400" aria-hidden="true">→</span>
                    <Select
                      containerClassName="w-56"
                      placeholder="Ignore this column"
                      options={parsed.availableColumns.map((c) => ({
                        value: c.key,
                        label: c.required ? `${c.label} (required)` : c.label,
                      }))}
                      value={mapping[header] || ''}
                      onChange={(e) =>
                        setMapping((prev) => {
                          const next = { ...prev };
                          if (e.target.value) next[header] = e.target.value;
                          else delete next[header];
                          return next;
                        })
                      }
                      aria-label={`Map column ${header}`}
                    />
                  </div>
                ))}
              </div>
            </CardBody>
            <CardFooter>
              <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(0)}>
                Back
              </Button>
              <Button loading={parsing} onClick={() => runParse(file, mapping)}>
                Validate rows
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* ---------------------------- step 3 ---------------------------- */}
        {step === 2 && parsed && (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Will be imported', value: summary.valid, tone: 'success', icon: CheckCircle2 },
                { label: 'Will be skipped', value: summary.invalid, tone: 'danger', icon: XCircle },
                { label: 'With warnings', value: summary.warnings, tone: 'warning', icon: AlertTriangle },
              ].map((s) => (
                <div key={s.label} className="rounded-card border border-ink-200 bg-white p-4">
                  <div className="flex items-center gap-2.5">
                    <s.icon
                      size={17}
                      className={clsx(
                        s.tone === 'success' && 'text-success-600',
                        s.tone === 'danger' && 'text-danger-600',
                        s.tone === 'warning' && 'text-warning-600'
                      )}
                      aria-hidden="true"
                    />
                    <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">
                      {s.label}
                    </p>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-ink-900 tabular">{s.value}</p>
                </div>
              ))}
            </div>

            <Card>
              <CardHeader
                title="Review"
                subtitle="Rows with errors are skipped. Everything else is created when you confirm."
              />
              <div className="max-h-[26rem] overflow-auto">
                <table className="w-full min-w-[46rem] text-left text-sm">
                  <thead className="sticky top-0 bg-ink-50">
                    <tr className="border-b border-ink-200">
                      {['Row', 'Name', 'Email', 'Category', 'Department', 'Status'].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-xs font-semibold tracking-wide text-ink-500 uppercase"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200">
                    {parsed.rows.map((row) => (
                      <tr key={row.rowNumber} className={row.valid ? undefined : 'bg-danger-50/40'}>
                        <td className="px-4 py-2.5 text-xs text-ink-500 tabular">{row.rowNumber}</td>
                        <td className="px-4 py-2.5 font-medium text-ink-900">
                          {row.data.name || <span className="text-ink-400">(blank)</span>}
                        </td>
                        <td className="px-4 py-2.5 text-ink-600">{row.data.email || '—'}</td>
                        <td className="px-4 py-2.5 text-ink-600">{row.data.categoryName || '—'}</td>
                        <td className="px-4 py-2.5 text-ink-600">
                          {row.data.departmentName || (
                            <span className="text-ink-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {row.valid ? (
                            row.warnings.length ? (
                              <span title={row.warnings.join('; ')}>
                                <Badge tone="warning" size="sm">
                                  {row.warnings[0]}
                                </Badge>
                              </span>
                            ) : (
                              <Badge tone="success" size="sm">
                                Ready
                              </Badge>
                            )
                          ) : (
                            <span title={row.errors.join('; ')}>
                              <Badge tone="danger" size="sm">
                                {row.errors[0]}
                              </Badge>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <CardFooter>
                <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(1)}>
                  Back to mapping
                </Button>
                <Button
                  loading={committing}
                  disabled={summary.valid === 0}
                  onClick={commit}
                >
                  Import {summary.valid} user{summary.valid === 1 ? '' : 's'}
                </Button>
              </CardFooter>
            </Card>
          </>
        )}

        {/* ---------------------------- step 4 ---------------------------- */}
        {step === 3 && (
          <Card>
            <CardBody className="flex flex-col items-center py-12 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-success-50 text-success-600">
                <CheckCircle2 size={26} aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-lg font-semibold text-ink-900">
                {credentials?.length} user{credentials?.length === 1 ? '' : 's'} imported
              </h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-500">
                Each one has a generated user ID and a temporary password. Make sure you saved the
                credentials — they cannot be shown again.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={() => setCredentials([...(credentials || [])])}>
                  Show credentials again
                </Button>
                <Button onClick={() => navigate('/client/users')}>Go to users</Button>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <CredentialsDialog
        open={Boolean(credentials?.length) && step === 3}
        onClose={() => setCredentials(null)}
        title={`${credentials?.length} account${credentials?.length === 1 ? '' : 's'} created`}
        organizationName={me.organization?.name}
        credentials={credentials || []}
      />
    </>
  );
}
