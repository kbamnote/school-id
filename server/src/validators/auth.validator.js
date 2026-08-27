const { z } = require('zod');
const { email, password } = require('./common');

const loginSchema = z.object({
  loginId: z.string().trim().min(1, 'Enter your email or user ID').max(160),
  password: z.string().min(1, 'Enter your password').max(128),
  // Only needed when the same user ID exists in more than one organisation.
  organizationSlug: z.string().trim().toLowerCase().max(60).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: password,
});

const forgotPasswordSchema = z.object({ email });

const resetPasswordSchema = z.object({
  token: z.string().trim().min(20, 'Invalid reset token'),
  password,
});

module.exports = {
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
