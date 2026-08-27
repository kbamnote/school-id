import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, KeyRound, ShieldCheck } from 'lucide-react';
import AuthLayout from './AuthLayout.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorMessage, fieldErrors } from '../../api/client';
import { portalFor } from '../../utils/rbac.js';

/** Password rules, mirrored from the server validator so feedback is live. */
const RULES = [
  { test: (v) => v.length >= 8, label: 'At least 8 characters' },
  { test: (v) => /[a-z]/.test(v), label: 'One lowercase letter' },
  { test: (v) => /[A-Z]/.test(v), label: 'One uppercase letter' },
  { test: (v) => /[0-9]/.test(v), label: 'One number' },
];

export default function ChangePasswordPage() {
  const { user, changePassword, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } });

  const newPassword = watch('newPassword') || '';
  const forced = Boolean(user?.mustChangePassword);

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const updated = await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success('Your password has been updated.');
      navigate(portalFor(updated.role), { replace: true });
    } catch (err) {
      const fields = fieldErrors(err);
      Object.entries(fields).forEach(([field, message]) => setError(field, { message }));
      if (!Object.keys(fields).length) setFormError(errorMessage(err));
    }
  };

  return (
    <AuthLayout
      title={forced ? 'Set a new password' : 'Change password'}
      subtitle={
        forced
          ? 'You are signed in with a temporary password. Choose a new one to continue.'
          : 'Choose a new password for your account.'
      }
      footer={
        <button
          type="button"
          onClick={logout}
          className="text-sm font-medium text-ink-500 transition hover:text-ink-700"
        >
          Sign out instead
        </button>
      }
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
          label={forced ? 'Temporary password' : 'Current password'}
          type="password"
          icon={KeyRound}
          autoComplete="current-password"
          autoFocus
          required
          error={errors.currentPassword?.message}
          {...register('currentPassword', { required: 'Enter your current password' })}
        />

        <Input
          label="New password"
          type="password"
          icon={ShieldCheck}
          autoComplete="new-password"
          required
          error={errors.newPassword?.message}
          {...register('newPassword', { required: 'Choose a new password' })}
        />

        {/* Live rule feedback beats submitting and being told what was wrong. */}
        <ul className="grid grid-cols-2 gap-1.5" aria-label="Password requirements">
          {RULES.map((rule) => {
            const passed = rule.test(newPassword);
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
                    passed
                      ? 'size-1.5 rounded-full bg-success-500'
                      : 'size-1.5 rounded-full bg-ink-300'
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
            validate: (v) => v === newPassword || 'Passwords do not match',
          })}
        />

        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
