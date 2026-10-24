import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { KeyRound, MailCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

import { AppText, Button, Card, Screen, toast } from '@/components';
import { FormField } from '@/components/FormField';
import { Mascot } from '@/features/animation/Mascot';
import { resendVerification, verifyEmailCode } from '@/features/auth/authService';
import { useAuthStore } from '@/features/auth/authStore';
import { otpSchema } from '@/features/auth/schemas';
import { userMessageOf } from '@/lib/errors';
import { useTheme } from '@/theme';

const RESEND_SECONDS = 60;

export default function VerifyEmail() {
  const theme = useTheme();
  const email = useAuthStore((s) => s.pendingEmail);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const { control, handleSubmit, formState } = useForm<{ code: string }>({ resolver: zodResolver(otpSchema), defaultValues: { code: '' } });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (!email) router.replace('/sign-in');
  }, [email]);

  const submit = handleSubmit(async ({ code }) => {
    if (!email) return;
    setError(null);
    try {
      await verifyEmailCode(email, code);
    } catch (e) {
      setError(userMessageOf(e));
    }
  });

  const resend = async () => {
    if (!email) return;
    try {
      await resendVerification(email);
      setCooldown(RESEND_SECONDS);
      toast.success('A new code is on its way.');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Screen back keyboard>
      <View style={{ alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Mascot size={100} mood={error ? 'error' : 'documentSaved'} />
        <AppText variant="title" align="center" accessibilityRole="header">
          Check your inbox
        </AppText>
        <AppText color="textMuted" align="center">
          We sent a verification code to{'\n'}
          <AppText variant="bodyStrong">{email}</AppText>
        </AppText>
      </View>
      <View style={{ gap: theme.spacing.lg }}>
        <FormField control={control} name="code" label="Verification code" icon={KeyRound} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10} onSubmitEditing={() => void submit()} />
        {error ? (
          <AppText variant="label" color="danger" accessibilityLiveRegion="assertive">
            {error}
          </AppText>
        ) : null}
        <Button label="Verify e-mail" icon={MailCheck} size="lg" fullWidth loading={formState.isSubmitting} onPress={submit} />
        <Button label={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'} variant="ghost" disabled={cooldown > 0} onPress={resend} />
        <Card tone="sunken">
          <AppText variant="caption" color="textMuted">
            You can also tap the link in the e-mail on this phone. Codes expire after one hour. Check your spam folder if nothing arrives.
          </AppText>
        </Card>
      </View>
    </Screen>
  );
}
