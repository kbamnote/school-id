import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Building2, KeyRound, LogIn, User } from 'lucide-react';
import AuthLayout from './AuthLayout.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { errorMessage, fieldErrors } from '../../api/client';
import { portalFor } from '../../utils/rbac.js';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState('');
  /**
   * Only shown once the server reports the same user ID in several
   * organisations - asking everyone for it up front would be noise.
   */
  const [needsOrg, setNeedsOrg] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { loginId: '', password: '', organizationSlug: '' } });

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const payload = {
        loginId: values.loginId.trim(),
        password: values.password,
        ...(needsOrg && values.organizationSlug
          ? { organizationSlug: values.organizationSlug.trim().toLowerCase() }
          : {}),
      };

      const user = await login(payload);

      if (user.mustChangePassword) {
        navigate('/change-password', { replace: true });
        return;
      }
      // Return them to wherever they were headed before the guard intervened.
      const target = location.state?.from?.pathname || portalFor(user.role);
      navigate(target, { replace: true });
    } catch (err) {
      if (err?.response?.data?.code === 'ORGANIZATION_REQUIRED') {
        setNeedsOrg(true);
      }
      const fields = fieldErrors(err);
      Object.entries(fields).forEach(([field, message]) => setError(field, { message }));
      if (!Object.keys(fields).length) setFormError(errorMessage(err));
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use the email or user ID issued to you by your organisation."
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-danger-200 bg-danger-50 p-3"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger-600" aria-hidden="true" />
            <p className="text-sm text-danger-700">{formError}</p>
          </div>
        )}

        <Input
          label="Email or User ID"
          placeholder="you@example.com or STU00001"
          icon={User}
          autoComplete="username"
          autoFocus
          required
          error={errors.loginId?.message}
          {...register('loginId', { required: 'Enter your email or user ID' })}
        />

        <Input
          label="Password"
          type="password"
          placeholder="Enter your password"
          icon={KeyRound}
          autoComplete="current-password"
          required
          error={errors.password?.message}
          {...register('password', { required: 'Enter your password' })}
        />

        {needsOrg && (
          <Input
            label="Organisation code"
            placeholder="abc-public-school"
            icon={Building2}
            hint="This user ID exists in more than one organisation. Enter yours to continue."
            error={errors.organizationSlug?.message}
            {...register('organizationSlug')}
          />
        )}

        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-brand-600 transition hover:text-brand-700"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" fullWidth size="lg" icon={LogIn} loading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
