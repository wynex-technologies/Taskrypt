import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { Lock, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

import { AppText, Button, Credit, OfflineNotice, Screen } from '@/components';
import { FormField } from '@/components/FormField';
import { Mascot } from '@/features/animation/Mascot';
import { signIn } from '@/features/auth/authService';
import { useAuthStore } from '@/features/auth/authStore';
import { signInSchema, type SignInValues } from '@/features/auth/schemas';
import { toAppError } from '@/lib/errors';
import { useIsOnline } from '@/stores/networkStore';
import { useTheme } from '@/theme';

export default function SignIn() {
  const theme = useTheme();
  const online = useIsOnline();
  const notice = useAuthStore((s) => s.notice);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState, getValues } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: useAuthStore.getState().pendingEmail ?? '', password: '' },
  });

  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      const { needsVerification } = await signIn(v.email, v.password);
      if (needsVerification) router.push('/verify-email');
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'email_not_verified') {
        router.push('/verify-email');
        return;
      }
      setError(err.userMessage);
    }
  });

  return (
    <Screen keyboard>
      <View style={{ alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 28 }}>
        <Mascot size={104} mood={error ? 'error' : online ? 'welcome' : 'offline'} />
        <AppText variant="hero" align="center" accessibilityRole="header">
          Welcome back
        </AppText>
        <AppText color="textMuted" align="center">
          Sign in to pick up where you left off.
        </AppText>
      </View>

      <View style={{ gap: theme.spacing.lg }}>
        {notice ? (
          <AppText variant="label" color="info" align="center">
            {notice}
          </AppText>
        ) : null}
        {!online ? <OfflineNotice message="Signing in needs an internet connection. If you were signed in before, reconnect to continue." /> : null}
        <FormField control={control} name="email" label="E-mail" icon={Mail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" />
        <FormField control={control} name="password" label="Password" icon={Lock} secure autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={() => void submit()} />
        {error ? (
          <AppText variant="label" color="danger" accessibilityLiveRegion="assertive">
            {error}
          </AppText>
        ) : null}
        <Button label="Sign in" size="lg" fullWidth loading={formState.isSubmitting} disabled={!online} onPress={submit} testID="sign-in-submit" />
        <Button
          label="Forgot password?"
          variant="ghost"
          onPress={() => {
            useAuthStore.getState().setState({ pendingEmail: getValues('email') || null });
            router.push('/forgot-password');
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 24 }}>
        <AppText color="textMuted">New to Taskrypt?</AppText>
        <Link href="/sign-up" replace accessibilityRole="link">
          <AppText variant="bodyStrong" color="primary">
            Create an account
          </AppText>
        </Link>
      </View>
      <Credit style={{ marginTop: 32 }} />
    </Screen>
  );
}
