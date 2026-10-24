import { zodResolver } from '@hookform/resolvers/zod';
import { Lock } from 'lucide-react-native';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

import { AppText, Button, Screen, toast } from '@/components';
import { FormField } from '@/components/FormField';
import { Mascot } from '@/features/animation/Mascot';
import { signOut, updatePassword } from '@/features/auth/authService';
import { resetSchema } from '@/features/auth/schemas';
import { userMessageOf } from '@/lib/errors';
import { useTheme } from '@/theme';

export default function ResetPassword() {
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<{ password: string; confirm: string }>({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirm: '' } });

  const submit = handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await updatePassword(password);
      toast.success('Password updated. Other devices were signed out.');
    } catch (e) {
      setError(userMessageOf(e));
    }
  });

  return (
    <Screen keyboard>
      <View style={{ alignItems: 'center', gap: 10, marginTop: 32, marginBottom: 24 }}>
        <Mascot size={100} mood="welcome" />
        <AppText variant="title" align="center" accessibilityRole="header">
          Choose a new password
        </AppText>
      </View>
      <View style={{ gap: theme.spacing.lg }}>
        <FormField control={control} name="password" label="New password" icon={Lock} secure autoComplete="new-password" textContentType="newPassword" helper="10+ characters with letters and numbers" />
        <FormField control={control} name="confirm" label="Confirm new password" icon={Lock} secure autoComplete="new-password" textContentType="newPassword" />
        {error ? (
          <AppText variant="label" color="danger">
            {error}
          </AppText>
        ) : null}
        <Button label="Save password" size="lg" fullWidth loading={formState.isSubmitting} onPress={submit} />
        <Button label="Cancel" variant="ghost" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}
