import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { Lock, Mail, User } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Switch, View } from 'react-native';

import { AppText, Button, Credit, OfflineNotice, ProgressBar, Screen } from '@/components';
import { FormField } from '@/components/FormField';
import { Mascot } from '@/features/animation/Mascot';
import { signUp } from '@/features/auth/authService';
import { passwordStrength, signUpSchema, type SignUpValues } from '@/features/auth/schemas';
import { userMessageOf } from '@/lib/errors';
import { useIsOnline } from '@/stores/networkStore';
import { useTheme } from '@/theme';

const STRENGTH = ['Too weak', 'Weak', 'Okay', 'Strong', 'Very strong'];

export default function SignUp() {
  const theme = useTheme();
  const online = useIsOnline();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: '', email: '', password: '', confirm: '', acceptPrivacy: false as unknown as true },
  });
  const pw = useWatch({ control, name: 'password' }) ?? '';
  const strength = passwordStrength(pw);

  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      const { needsVerification } = await signUp({ email: v.email, password: v.password, displayName: v.displayName });
      if (needsVerification) router.replace('/verify-email');
    } catch (e) {
      setError(userMessageOf(e));
    }
  });

  return (
    <Screen keyboard>
      <View style={{ alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 24 }}>
        <Mascot size={92} mood={error ? 'error' : 'welcome'} />
        <AppText variant="hero" align="center" accessibilityRole="header">
          Create your space
        </AppText>
        <AppText color="textMuted" align="center">
          Free, private and yours.
        </AppText>
      </View>
      <View style={{ gap: theme.spacing.lg }}>
        {!online ? <OfflineNotice message="Creating an account needs an internet connection." /> : null}
        <FormField control={control} name="displayName" label="Your name" icon={User} autoComplete="name" textContentType="name" />
        <FormField control={control} name="email" label="E-mail" icon={Mail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
        <View style={{ gap: 8 }}>
          <FormField control={control} name="password" label="Password" icon={Lock} secure autoComplete="new-password" textContentType="newPassword" helper="10+ characters with letters and numbers" />
          {pw ? (
            <View style={{ gap: 4 }}>
              <ProgressBar value={(strength + 1) / 5} height={6} color={strength >= 3 ? theme.colors.success : strength >= 2 ? theme.colors.warning : theme.colors.danger} label="Password strength" />
              <AppText variant="caption" color="textMuted">
                {STRENGTH[strength]}
              </AppText>
            </View>
          ) : null}
        </View>
        <FormField control={control} name="confirm" label="Confirm password" icon={Lock} secure autoComplete="new-password" textContentType="newPassword" />
        <Controller
          control={control}
          name="acceptPrivacy"
          render={({ field, fieldState }) => (
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Switch value={!!field.value} onValueChange={field.onChange} accessibilityLabel="I agree to the privacy policy" trackColor={{ true: theme.colors.primary, false: theme.colors.border }} />
                <AppText style={{ flex: 1 }}>
                  I agree to the{' '}
                  <AppText color="primary" variant="bodyStrong" onPress={() => router.push('/privacy')} accessibilityRole="link">
                    privacy policy
                  </AppText>
                </AppText>
              </View>
              {fieldState.error ? (
                <AppText variant="caption" color="danger">
                  {fieldState.error.message}
                </AppText>
              ) : null}
            </View>
          )}
        />
        {error ? (
          <AppText variant="label" color="danger" accessibilityLiveRegion="assertive">
            {error}
          </AppText>
        ) : null}
        <Button label="Create account" size="lg" fullWidth loading={formState.isSubmitting} disabled={!online} onPress={submit} testID="sign-up-submit" />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 24 }}>
        <AppText color="textMuted">Already have an account?</AppText>
        <Link href="/sign-in" replace accessibilityRole="link">
          <AppText variant="bodyStrong" color="primary">
            Sign in
          </AppText>
        </Link>
      </View>
      <Credit style={{ marginTop: 32 }} />
    </Screen>
  );
}
