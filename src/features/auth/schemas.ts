import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your e-mail')
  .max(320)
  .pipe(z.email('Enter a valid e-mail address'));

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});

export const signUpSchema = z
  .object({
    displayName: z.string().trim().min(1, 'Tell us what to call you').max(80),
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
    acceptPrivacy: z.literal(true, { error: 'Please accept the privacy policy' }),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export const otpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6,10}$/, 'Enter the code from the e-mail'),
});

export const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;

/** 0–4 strength meter for UI feedback (server policy still decides). */
export function passwordStrength(pw: string): number {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}
