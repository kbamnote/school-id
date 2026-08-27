import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import AuthLayout from './AuthLayout.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import api, { errorMessage } from '../../api/client';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState('');
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '' } });

  const onSubmit = async (values) => {
    setFormError('');
    try {
      await api.post('/auth/forgot-password', { email: values.email.trim() });
      // The API deliberately answers the same way for unknown addresses, so
      // this screen must not imply the address was found.
      setSent(true);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  if (sent) {
    return (
      <AuthLayout title="Check your email">
        <div className="rounded-card border border-ink-200 bg-white p-5 text-center shadow-panel">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-success-50 text-success-600">
            <MailCheck size={20} aria-hidden="true" />
          </span>
          <p className="mt-4 text-sm leading-relaxed text-ink-600">
            If <span className="font-medium text-ink-900">{getValues('email')}</span> is registered,
            a password reset link is on its way. The link expires in 30 minutes.
          </p>
        </div>
        <Link
          to="/login"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 transition hover:text-brand-700"
        >
          <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email address and we will send you a reset link."
      footer={
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 transition hover:text-brand-700"
        >
          <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && (
          <p
            role="alert"
            className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700"
          >
            {formError}
          </p>
        )}
        <Input
          label="Email address"
          type="email"
          icon={Mail}
          placeholder="you@example.com"
          autoComplete="email"
          autoFocus
          required
          hint="End users without an email should ask their administrator to reset it."
          error={errors.email?.message}
          {...register('email', { required: 'Enter your email address' })}
        />
        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
