import { z } from 'zod';

import { DEFAULT_COUNTRY, NEPAL_DISTRICT_NAMES, NEPAL_PROVINCES } from '../constants.js';
import { AccountStatus, OAuthProvider, UserRole } from '../enums.js';
import { emailSchema, passwordSchema, phoneSchema, urlSchema, uuidSchema } from './common.js';

/* -------------------------------------------------------------------------- */
/*  User (C1.1)                                                               */
/* -------------------------------------------------------------------------- */

export const userSchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  phone: phoneSchema.nullable(),
  fullName: z.string().min(2, 'Name must be at least 2 characters').max(120),
  avatarUrl: urlSchema.nullable(),
  role: z.nativeEnum(UserRole),
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  status: z.nativeEnum(AccountStatus),
  lastLoginAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type User = z.infer<typeof userSchema>;

/** Never leaks passwordHash - this is the shape returned by GET /auth/me. */
export const publicUserSchema = userSchema.omit({ updatedAt: true });
export type PublicUser = z.infer<typeof publicUserSchema>;

/* -------------------------------------------------------------------------- */
/*  Auth payloads (Phase 2 consumes these on both sides)                      */
/* -------------------------------------------------------------------------- */

export const registerSchema = z
  .object({
    fullName: z.string().min(2, 'Name must be at least 2 characters').max(120),
    email: emailSchema,
    phone: phoneSchema.optional(),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const phoneLoginSchema = z.object({ phone: phoneSchema });
export type PhoneLoginInput = z.infer<typeof phoneLoginSchema>;

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must be numeric'),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'New password must differ from the current one',
    path: ['newPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.nullable().optional(),
  avatarUrl: urlSchema.nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/* -------------------------------------------------------------------------- */
/*  OAuth account (C1.1)                                                      */
/* -------------------------------------------------------------------------- */

export const oauthAccountSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  provider: z.nativeEnum(OAuthProvider),
  providerId: z.string().min(1),
  email: emailSchema.nullable(),
  createdAt: z.coerce.date(),
});

export type OAuthAccount = z.infer<typeof oauthAccountSchema>;

/* -------------------------------------------------------------------------- */
/*  Address (C1.1) - Nepal uses district + province                           */
/* -------------------------------------------------------------------------- */

export const addressInputSchema = z.object({
  label: z.string().min(1, 'Label is required').max(40).default('Home'),
  fullName: z.string().min(2, 'Recipient name is required').max(120),
  phone: phoneSchema,
  street: z.string().min(3, 'Street address is required').max(200),
  city: z.string().min(2, 'City is required').max(80),
  district: z.enum(NEPAL_DISTRICT_NAMES, {
    errorMap: () => ({ message: 'Select a valid Nepal district' }),
  }),
  province: z.enum(NEPAL_PROVINCES, {
    errorMap: () => ({ message: 'Select a valid Nepal province' }),
  }),
  postalCode: z.string().max(16).optional().nullable(),
  country: z.string().min(2).max(60).default(DEFAULT_COUNTRY),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  isDefault: z.boolean().default(false),
});

export type AddressInput = z.infer<typeof addressInputSchema>;

export const addressSchema = addressInputSchema.extend({
  id: uuidSchema,
  userId: uuidSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Address = z.infer<typeof addressSchema>;
