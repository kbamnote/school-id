import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ShieldCheck } from 'lucide-react';
import AuthLayout from './AuthLayout.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import api, { errorMessage, fieldErrors } from '../../api/client';
import { useToast } from '../../context/ToastContext.jsx';

const RULES = [
  { test: (v) => v.length >= 8, label: 'At least 8 characters' },
  { test: (v) => /[a-z]/.test(v), label: 'One lowercase letter' },
  { test: (v) => /[A-Z]/.test(v), label: 'One uppercase letter' },
  { test: (v) => /[0-9]/.test(v), label: 'One number' },
];

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const toast = useToast();
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { password: '', confirmPassword: '' } });

  const password = watch('password') || '';

  const onSubmit = async (values) => {
    setFormError('');
    try {
      await api.post('/auth/reset-password', { token, password: values.password });
      toast.success('Password reset. You can sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      const fields = fieldErrors(err);
      Object.entries(fields).forEach(([field, message]) => setError(field, { message }));
      if (!Object.keys(fields).length) setFormError(errorMessage(err));
    }
  };

  // A missing token means the link was mistyped or truncated by an email client.
  if (!token) {
    return (
      <AuthLayout
        title="Invalid reset link"
        subtitle="This link is missing its security token. Please request a new one."
      >
        <Link
          to="/forgot-password"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 transition hover:text-brand-700"
        >
          <ArrowLeft size={15} aria-hidden="true" /> Request a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Enter a new password for your account.">
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
          label="New password"
          type="password"
          icon={ShieldCheck}
          autoComplete="new-password"
          autoFocus
          required
          error={errors.password?.message}
          {...register('password', { required: 'Choose a new password' })}
        />

        <ul className="grid grid-cols-2 gap-1.5" aria-label="Password requirements">
          {RULES.map((rule) => {
            const passed = rule.test(password);
            return (
              <li
                key={rule.label}
                className={
                  passed
                    ? 'flex items-center gap-1.5 text-xs font-medium text-success-600'
                    : 'flex items-center gap-1.5 text-xs text-ink-400'
                }
              >
                <span
                  className={
                    passed ? 'size-1.5 rounded-full bg-success-500' : 'size-1.5 rounded-full bg-ink-300'
                  }
                  aria-hidden="true"
                />
                {rule.label}
              </li>
            );
          })}
        </ul>

        <Input
          label="Confirm new password"
          type="password"
          icon={ShieldCheck}
          autoComplete="new-password"
          required
          error={errors.confirmPassword?.message}
          {...register('confirmPassword', {
            required: 'Re-enter your new password',
            validate: (v) => v === password || 'Passwords do not match',
          })}
        />

        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          Reset password
        </Button>
      </form>
    </AuthLayout>
  );
}
