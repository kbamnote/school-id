import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Building2, MapPin, Save, StickyNote, UserCog } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardHeader, CardBody, CardFooter } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import { clientsApi } from '../../api/superAdmin.js';
import { errorMessage, fieldErrors } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';

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

export default function ClientEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { organization: org } = await clientsApi.get(id);
      // Reset with the fetched values so `isDirty` correctly reports whether
      // the operator has actually changed anything.
      reset({
        name: org.name,
        type: org.type,
        gstNumber: org.gstNumber || '',
        internalNotes: org.internalNotes || '',
        contact: {
          personName: org.contact?.personName || '',
          designation: org.contact?.designation || '',
          email: org.contact?.email || '',
          phone: org.contact?.phone || '',
        },
        address: {
          line1: org.address?.line1 || '',
          line2: org.address?.line2 || '',
          city: org.address?.city || '',
          state: org.address?.state || '',
          pincode: org.address?.pincode || '',
        },
      });
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id, reset]);

  useEffect(() => {
    load();
  }, [load]);

  const onSubmit = async (values) => {
    setFormError('');
    try {
      await clientsApi.update(id, values);
      toast.success('Client updated.');
      navigate(`/super-admin/clients/${id}`);
    } catch (err) {
      const fields = fieldErrors(err);
      Object.entries(fields).forEach(([field, message]) => setError(field, { message }));
      if (!Object.keys(fields).length) setFormError(errorMessage(err));
    }
  };

  if (loading) return <PageLoader label="Loading client..." />;
  if (loadError) return <ErrorState message={loadError} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Edit client"
        breadcrumbs={[
          { label: 'MR Print World', to: '/super-admin' },
          { label: 'Clients', to: '/super-admin/clients' },
          { label: 'Edit' },
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
              required
              containerClassName="sm:col-span-2"
              error={errors.name?.message}
              {...register('name', { required: 'Enter the organisation name' })}
            />
            <Select label="Type" options={TYPE_OPTIONS} {...register('type')} />
            <Input label="GST number" error={errors.gstNumber?.message} {...register('gstNumber')} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Primary contact" icon={UserCog} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input label="Contact person" {...register('contact.personName')} />
            <Input label="Designation" {...register('contact.designation')} />
            <Input
              label="Email"
              type="email"
              error={errors.contact?.email?.message}
              {...register('contact.email')}
            />
            <Input
              label="Phone"
              error={errors.contact?.phone?.message}
              {...register('contact.phone')}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Address" icon={MapPin} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input label="Address line 1" containerClassName="sm:col-span-2" {...register('address.line1')} />
            <Input label="Address line 2" containerClassName="sm:col-span-2" {...register('address.line2')} />
            <Input label="City" {...register('address.city')} />
            <Input label="State" {...register('address.state')} />
            <Input
              label="PIN code"
              inputMode="numeric"
              error={errors.address?.pincode?.message}
              {...register('address.pincode')}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Internal notes"
            subtitle="Only MR Print World can see this. The client never does."
            icon={StickyNote}
          />
          <CardBody>
            <textarea
              rows={4}
              placeholder="Anything your team should know about this client..."
              className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-900 transition placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
              {...register('internalNotes')}
            />
          </CardBody>
          <CardFooter>
            <Link to={`/super-admin/clients/${id}`}>
              <Button variant="secondary" type="button">
                Cancel
              </Button>
            </Link>
            <Button type="submit" icon={Save} loading={isSubmitting} disabled={!isDirty}>
              Save changes
            </Button>
          </CardFooter>
        </Card>
      </form>
    </>
  );
}
