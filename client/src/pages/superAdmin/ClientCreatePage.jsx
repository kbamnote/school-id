import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Building2,
  Check,
  Copy,
  MapPin,
  Save,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardHeader, CardBody, CardFooter } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { clientsApi, plansApi } from '../../api/superAdmin.js';
import { errorMessage, fieldErrors } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';
import { formatLimit } from '../../utils/format.js';

const TYPE_OPTIONS = [
  { value: 'school', label: 'School' },
  { value: 'college', label: 'College' },
  { value: 'university', label: 'University' },
  { value: 'company', label: 'Company' },
  { value: 'government', label: 'Government body' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'ngo', label: 'NGO / Trust' },
  { value: 'other', label: 'Other' },
];

/**
 * Shown once, immediately after creation.
 *
 * The temporary password exists in plain text at exactly this moment and never
 * again - it is stored only as a bcrypt hash. If the operator closes this
 * without copying it, the password has to be reset rather than retrieved.
 */
function CredentialsDialog({ result, onClose }) {
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  const text = `MR Print World - Print Data Platform
Organisation: ${result.organization.name}
Sign-in URL: ${window.location.origin}/login
Email: ${result.admin.email}
Temporary password: ${result.temporaryPassword}

You will be asked to set your own password when you first sign in.`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Client created"
      description="Hand these credentials to the administrator now."
      size="md"
      closeOnOverlay={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Add another client
          </Button>
          <Button onClick={() => navigate(`/super-admin/clients/${result.organization.id}`)}>
            Open client
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-2.5 rounded-lg border border-warning-200 bg-warning-50 p-3">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-warning-600" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-warning-800">
          This password is shown <strong>once</strong>. It is stored only as a hash and cannot be
          retrieved later — if it is lost, you will need to reset it.
        </p>
      </div>

      <dl className="mt-4 divide-y divide-ink-200 rounded-lg border border-ink-200">
        {[
          ['Organisation', result.organization.name],
          ['Administrator', result.admin.name],
          ['Email', result.admin.email],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-3.5 py-2.5">
            <dt className="text-xs font-medium tracking-wide text-ink-500 uppercase">{label}</dt>
            <dd className="truncate text-sm font-medium text-ink-900">{value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 bg-ink-50 px-3.5 py-2.5">
          <dt className="text-xs font-medium tracking-wide text-ink-500 uppercase">
            Temporary password
          </dt>
          <dd className="font-mono text-sm font-semibold tracking-wide text-brand-700 select-all">
            {result.temporaryPassword}
          </dd>
        </div>
      </dl>

      <Button
        variant="secondary"
        icon={copied ? Check : Copy}
        onClick={copy}
        fullWidth
        className="mt-4"
      >
        {copied ? 'Copied to clipboard' : 'Copy sign-in details'}
      </Button>
    </Modal>
  );
}

export default function ClientCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [plans, setPlans] = useState([]);
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      name: '',
      type: 'school',
      gstNumber: '',
      internalNotes: '',
      planId: '',
      contact: { personName: '', designation: '', email: '', phone: '' },
      address: { line1: '', city: '', state: '', pincode: '' },
      admin: { name: '', email: '', phone: '' },
    },
  });

  useEffect(() => {
    plansApi
      .list()
      .then((list) => {
        setPlans(list);
        const fallback = list.find((p) => p.isDefault) || list[0];
        if (fallback) reset((prev) => ({ ...prev, planId: fallback.id }));
      })
      .catch(() => setPlans([]));
  }, [reset]);

  const selectedPlan = plans.find((p) => p.id === watch('planId'));

  const onSubmit = async (values) => {
    setFormError('');
    try {
      // Strip empty optional blocks so the API validator does not see "".
      const payload = {
        name: values.name.trim(),
        type: values.type,
        ...(values.gstNumber ? { gstNumber: values.gstNumber.trim() } : {}),
        ...(values.internalNotes ? { internalNotes: values.internalNotes.trim() } : {}),
        ...(values.planId ? { planId: values.planId } : {}),
        contact: values.contact,
        address: values.address,
        ...(values.admin.email
          ? {
              admin: {
                name: values.admin.name.trim(),
                email: values.admin.email.trim(),
                ...(values.admin.phone ? { phone: values.admin.phone.trim() } : {}),
              },
            }
          : {}),
      };

      const created = await clientsApi.create(payload);

      if (created.admin && created.temporaryPassword) {
        setResult(created);
      } else {
        toast.success(`${created.organization.name} created.`);
        navigate(`/super-admin/clients/${created.organization.id}`);
      }
    } catch (err) {
      const fields = fieldErrors(err);
      Object.entries(fields).forEach(([field, message]) => setError(field, { message }));
      if (!Object.keys(fields).length) setFormError(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="New client"
        subtitle="Create an organisation and its first administrator."
        breadcrumbs={[
          { label: 'MR Print World', to: '/super-admin' },
          { label: 'Clients', to: '/super-admin/clients' },
          { label: 'New' },
        ]}
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-4xl space-y-5">
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-card border border-danger-200 bg-danger-50 p-4"
          >
            <AlertCircle size={17} className="mt-0.5 shrink-0 text-danger-600" aria-hidden="true" />
            <p className="text-sm text-danger-700">{formError}</p>
          </div>
        )}

        <Card>
          <CardHeader title="Organisation details" icon={Building2} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Organisation name"
              placeholder="ABC Public School"
              required
              containerClassName="sm:col-span-2"
              hint="A URL code is generated from this automatically."
              error={errors.name?.message}
              {...register('name', { required: 'Enter the organisation name' })}
            />
            <Select label="Type" options={TYPE_OPTIONS} required {...register('type')} />
            <Input
              label="GST number"
              placeholder="Optional"
              error={errors.gstNumber?.message}
              {...register('gstNumber')}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Primary contact" icon={UserCog} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input label="Contact person" placeholder="Sunita Verma" {...register('contact.personName')} />
            <Input label="Designation" placeholder="Principal" {...register('contact.designation')} />
            <Input
              label="Email"
              type="email"
              placeholder="office@school.example"
              error={errors.contact?.email?.message}
              {...register('contact.email')}
            />
            <Input
              label="Phone"
              placeholder="9876543210"
              error={errors.contact?.phone?.message}
              {...register('contact.phone')}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Address" icon={MapPin} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Address"
              placeholder="12 Station Road"
              containerClassName="sm:col-span-2"
              {...register('address.line1')}
            />
            <Input label="City" placeholder="Lucknow" {...register('address.city')} />
            <Input label="State" placeholder="Uttar Pradesh" {...register('address.state')} />
            <Input
              label="PIN code"
              placeholder="226001"
              inputMode="numeric"
              error={errors.address?.pincode?.message}
              {...register('address.pincode')}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Subscription plan" icon={ShieldCheck} />
          <CardBody className="space-y-4">
            <Select
              label="Plan"
              required
              options={plans.map((p) => ({ value: p.id, label: p.name }))}
              placeholder={plans.length ? undefined : 'Loading plans...'}
              error={errors.planId?.message}
              {...register('planId', { required: 'Choose a plan' })}
            />
            {selectedPlan && (
              <dl className="grid grid-cols-2 gap-3 rounded-lg bg-ink-50 p-3.5 sm:grid-cols-4">
                {[
                  ['Users', selectedPlan.limits.maxUsers],
                  ['Forms', selectedPlan.limits.maxForms],
                  ['Admins', selectedPlan.limits.maxAdmins],
                  ['Categories', selectedPlan.limits.maxCategories],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[0.6875rem] tracking-wide text-ink-500 uppercase">{label}</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-ink-900 tabular">
                      {formatLimit(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="First administrator"
            subtitle="Optional now, but this account is what lets the client sign in."
            icon={UserCog}
          />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Full name"
              placeholder="Sunita Verma"
              error={errors.admin?.name?.message}
              {...register('admin.name', {
                validate: (v, values) =>
                  !values.admin.email || v.trim().length > 0 || 'Enter the administrator name',
              })}
            />
            <Input
              label="Email"
              type="email"
              placeholder="admin@school.example"
              hint="They sign in with this address."
              error={errors.admin?.email?.message}
              {...register('admin.email')}
            />
            <Input label="Phone" placeholder="Optional" {...register('admin.phone')} />
            <div className="flex items-end">
              <p className="text-xs leading-relaxed text-ink-500">
                A secure temporary password is generated automatically and shown once after
                creation. They must change it at first sign-in.
              </p>
            </div>
          </CardBody>
          <CardFooter>
            <Link to="/super-admin/clients">
              <Button variant="secondary" type="button">
                Cancel
              </Button>
            </Link>
            <Button type="submit" icon={Save} loading={isSubmitting}>
              Create client
            </Button>
          </CardFooter>
        </Card>
      </form>

      {result && (
        <CredentialsDialog
          result={result}
          onClose={() => {
            setResult(null);
            reset();
          }}
        />
      )}
    </>
  );
}
