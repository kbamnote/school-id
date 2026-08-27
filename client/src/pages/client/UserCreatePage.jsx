import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Save, UserPlus } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card, { CardHeader, CardBody, CardFooter } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import CredentialsDialog from '../../components/CredentialsDialog.jsx';
import { categoriesApi, departmentsApi, usersApi } from '../../api/clientApi.js';
import { errorMessage, fieldErrors } from '../../api/client';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from '../../utils/rbac.js';

export default function UserCreatePage() {
  const navigate = useNavigate();
  const { user: me } = useAuth();

  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      role: ROLES.END_USER,
      orgCategory: '',
      department: '',
      externalId: '',
    },
  });

  const role = watch('role');
  const isEndUser = role === ROLES.END_USER;

  useEffect(() => {
    categoriesApi.list({ limit: 100, isActive: 'true' }).then((r) => setCategories(r.data)).catch(() => {});
    departmentsApi.list({ limit: 200 }).then((r) => setDepartments(r.data)).catch(() => {});
    usersApi.assignableRoles().then(setRoles).catch(() => setRoles([ROLES.END_USER]));
  }, []);

  const selectedCategory = categories.find((c) => c.id === watch('orgCategory'));

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const payload = {
        name: values.name.trim(),
        role: values.role,
        ...(values.email ? { email: values.email.trim() } : {}),
        ...(values.phone ? { phone: values.phone.trim() } : {}),
        ...(values.externalId ? { externalId: values.externalId.trim() } : {}),
        ...(values.orgCategory ? { orgCategory: values.orgCategory } : {}),
        ...(values.department ? { department: values.department } : {}),
      };
      const created = await usersApi.create(payload);
      setResult(created);
    } catch (err) {
      const fields = fieldErrors(err);
      Object.entries(fields).forEach(([f, m]) => setError(f, { message: m }));
      if (!Object.keys(fields).length) setFormError(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Add user"
        subtitle="Create one account. To add many at once, use the spreadsheet import."
        breadcrumbs={[
          { label: 'Dashboard', to: '/client' },
          { label: 'Users', to: '/client/users' },
          { label: 'Add' },
        ]}
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-3xl space-y-5">
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
          <CardHeader title="Account type" icon={UserPlus} />
          <CardBody className="space-y-4">
            <Select
              label="Role"
              required
              options={roles.map((r) => ({ value: r, label: ROLE_LABELS[r] || r }))}
              {...register('role')}
            />
            <p className="rounded-lg bg-ink-50 p-3 text-sm leading-relaxed text-ink-600">
              {ROLE_DESCRIPTIONS[role] || 'Select a role.'}
            </p>
            {!isEndUser && (
              <p className="text-xs leading-relaxed text-ink-500">
                Staff accounts sign in with an email address. End users sign in with a generated
                user ID instead.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Details" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Full name"
              placeholder="Ravi Kumar"
              required
              containerClassName="sm:col-span-2"
              error={errors.name?.message}
              {...register('name', { required: 'Enter the name' })}
            />
            <Input
              label="Email"
              type="email"
              required={!isEndUser}
              placeholder={isEndUser ? 'Optional' : 'staff@school.example'}
              hint={isEndUser ? 'Optional — end users sign in with their ID.' : undefined}
              error={errors.email?.message}
              {...register('email', {
                validate: (v) => isEndUser || v.trim().length > 0 || 'Staff accounts need an email',
              })}
            />
            <Input
              label="Phone"
              placeholder="Optional"
              error={errors.phone?.message}
              {...register('phone')}
            />

            {isEndUser && (
              <>
                <Select
                  label="Category"
                  required
                  placeholder={categories.length ? 'Select a category' : 'No categories yet'}
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  hint={
                    selectedCategory
                      ? `Their ID will be issued from the ${selectedCategory.idPrefix} series.`
                      : 'This decides the ID they are issued.'
                  }
                  error={errors.orgCategory?.message}
                  {...register('orgCategory', { required: 'Select a category' })}
                />
                <Select
                  label="Department"
                  placeholder="Optional"
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                  {...register('department')}
                />
                <Input
                  label="External ID"
                  placeholder="Admission no, employee code..."
                  hint="Your own reference for this person."
                  containerClassName="sm:col-span-2"
                  {...register('externalId')}
                />
              </>
            )}
          </CardBody>
          <CardFooter>
            <Link to="/client/users">
              <Button variant="secondary" type="button">
                Cancel
              </Button>
            </Link>
            <Button type="submit" icon={Save} loading={isSubmitting}>
              Create user
            </Button>
          </CardFooter>
        </Card>
      </form>

      <CredentialsDialog
        open={Boolean(result)}
        onClose={() => {
          setResult(null);
          reset();
        }}
        title="User created"
        organizationName={me.organization?.name}
        credentials={
          result
            ? [
                {
                  name: result.user.name,
                  loginId: result.credentials.loginId,
                  email: result.credentials.email,
                  temporaryPassword: result.credentials.temporaryPassword,
                },
              ]
            : []
        }
      />
    </>
  );
}
