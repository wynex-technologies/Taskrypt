import { Card, Screen, AppText } from '@/components';
import { Mascot } from '@/features/animation/Mascot';

/**
 * Shown only when the build has no Supabase credentials. Taskrypt never falls
 * back to fake data: configure the backend, then rebuild.
 */
export default function Setup() {
  return (
    <Screen title="Connect a backend" subtitle="Taskrypt needs a Supabase project before anyone can sign in.">
      <Mascot size={110} mood="loading" style={{ marginVertical: 16 }} />
      <Card style={{ gap: 10 }}>
        <AppText variant="subheading">1. Create the database</AppText>
        <AppText color="textMuted">Run the SQL in supabase/migrations against your project (supabase db push).</AppText>
        <AppText variant="subheading">2. Add public keys</AppText>
        <AppText color="textMuted">Copy .env.example to .env and set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.</AppText>
        <AppText variant="subheading">3. Rebuild</AppText>
        <AppText color="textMuted">Restart Metro with a cleared cache: npx expo start -c</AppText>
        <AppText variant="caption" color="textSubtle">
          Never put the service-role key in the app. See README → Security.
        </AppText>
      </Card>
    </Screen>
  );
}
