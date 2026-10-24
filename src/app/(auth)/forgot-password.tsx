import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Mail, Send } from 'lucide-react-native';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { AppText, Button, OfflineNotice, Screen } from '@/components';
import { FormField } from '@/components/FormField';
import { Mascot } from '@/features/animation/Mascot';
import { sendPasswordReset, verifyRecoveryCode } from '@/features/auth/authService';
import { useAuthStore } from '@/features/auth/authStore';
import { emailSchema, otpSchema } from '@/features/auth/schemas';
import { userMessageOf } from '@/lib/errors';
import { useIsOnline } from '@/stores/networkStore';
import { useTheme } from '@/theme';

const emailForm = z.object({ email: emailSchema });

export default function ForgotPassword() {
  const theme = useTheme();
  const online = useIsOnline();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const step1 = useForm<{ email: string }>({ resolver: zodResolver(emailForm), defaultValues: { email: useAuthStore.getState().pendingEmail ?? '' } });
  const step2 = useForm<{ code: string }>({ resolver: zodResolver(otpSchema), defaultValues: { code: '' } });

  const send = step1.handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await sendPasswordReset(email);
      setSentTo(email.trim().toLowerCase());
    } catch (e) {
      setError(userMessageOf(e));
    }
  });

  const verify = step2.handleSubmit(async ({ code }) => {
    if (!sentTo) return;
    setError(null);
    try {
      // On success the auth status becomes 'recovery' and the guard opens /reset-password.
      await verifyRecoveryCode(sentTo, code);
    } catch (e) {
      setError(userMessageOf(e));
    }
  });

  return (
    <Screen back keyboard>
      <View style={{ alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Mascot size={96} mood={error ? 'error' : 'loading'} />
        <AppText variant="title" align="center" accessibilityRole="header">
          {sentTo ? 'Enter your code' : 'Reset your password'}
        </AppText>
        <AppText color="textMuted" align="center">
          {sentTo ? `If an account exists for ${sentTo}, we sent it a reset code.` : 'We will e-mail you a code to set a new password.'}
        </AppText>
      </View>
      <View style={{ gap: theme.spacing.lg }}>
        {!online ? <OfflineNotice message="Password recovery needs an internet connection." /> : null}
        {!sentTo ? (
          <>
            <FormField control={step1.control} name="email" label="E-mail" icon={Mail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" onSubmitEditing={() => void send()} />
            <Button label="Send reset code" icon={Send} size="lg" fullWidth loading={step1.formState.isSubmitting} disabled={!online} onPress={send} />
          </>
        ) : (
          <>
            <FormField control={step2.control} name="code" label="Reset code" icon={KeyRound} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10} onSubmitEditing={() => void verify()} />
            <Button label="Continue" size="lg" fullWidth loading={step2.formState.isSubmitting} disabled={!online} onPress={verify} />
            <Button label="Use a different e-mail" variant="ghost" onPress={() => setSentTo(null)} />
          </>
        )}
        {error ? (
          <AppText variant="label" color="danger" accessibilityLiveRegion="assertive">
            {error}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}
