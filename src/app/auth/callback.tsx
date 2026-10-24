import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button } from '@/components';
import { Mascot } from '@/features/animation/Mascot';
import { completeDeepLink } from '@/features/auth/authService';
import { userMessageOf } from '@/lib/errors';
import { useTheme } from '@/theme';

/** Handles taskrypt://auth/callback?code=…&type=… links from Supabase e-mails (PKCE). */
export default function AuthCallback() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ code?: string; type?: string; error_description?: string }>();
  const validCode = typeof params.code === 'string' && /^[A-Za-z0-9-_.]{8,512}$/.test(params.code);
  const [asyncError, setError] = useState<string | null>(null);
  const error = params.error_description ?? (validCode ? asyncError : 'This link is invalid or has already been used.');

  useEffect(() => {
    if (!validCode || !params.code) return;
    completeDeepLink(params.code, typeof params.type === 'string' ? params.type : null)
      .then(() => router.replace('/'))
      .catch((e) => setError(userMessageOf(e)));
  }, [validCode, params.code, params.type]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, backgroundColor: theme.colors.background }}>
      <Mascot size={110} mood={error ? 'error' : 'loading'} />
      <AppText variant="heading" align="center">
        {error ? 'We could not open that link' : 'Signing you in…'}
      </AppText>
      {error ? (
        <>
          <AppText color="textMuted" align="center">
            {error}
          </AppText>
          <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} />
        </>
      ) : null}
    </View>
  );
}
