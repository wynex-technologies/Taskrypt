import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Target, User } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Chip, ChipRow, OfflineNotice, Screen, SkeletonList, TextField, toast } from '@/components';
import { profileUpdateSchema, updateProfile } from '@/features/profile/profileService';
import { useProfile } from '@/hooks/queries';
import { useIsOnline } from '@/stores/networkStore';
import { useTheme } from '@/theme';
import type { Profile } from '@/types/domain';

const COLORS = ['#B9502B', '#5E8A6B', '#3F72AF', '#C98F22', '#7B5EA7', '#2F7F7A', '#C2333F'];
const GOALS = [1, 3, 5, 8, 10, 15];

function ProfileForm({ initial }: { initial: Profile | null }) {
  const theme = useTheme();
  const online = useIsOnline();
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.display_name ?? '');
  const [color, setColor] = useState(initial?.avatar_color ?? COLORS[0]!);
  const [goal, setGoal] = useState(initial?.daily_goal ?? 5);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const parsed = profileUpdateSchema.safeParse({ display_name: name, avatar_color: color, daily_goal: goal, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your details');
      return;
    }
    setBusy(true);
    try {
      await updateProfile(parsed.data);
      await qc.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Profile saved');
      router.back();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Profile" back keyboard>
      <View style={{ gap: theme.spacing.xl }}>
        {!online ? <OfflineNotice message="Profile changes need a connection." /> : null}
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Avatar preview">
            <AppText variant="hero" style={{ color: '#FFFFFF' }}>
              {(name.trim()[0] ?? '?').toUpperCase()}
            </AppText>
          </View>
        </View>
        <TextField label="Display name" icon={User} value={name} onChangeText={(t) => { setName(t); setError(null); }} maxLength={80} error={error ?? undefined} />
        <View style={{ gap: 8 }}>
          <AppText variant="label" color="textMuted">
            Avatar colour
          </AppText>
          <ChipRow>
            {COLORS.map((c) => (
              <Chip key={c} label=" " color={c} selected={c === color} onPress={() => setColor(c)} accessibilityLabel={`Colour ${c}`} />
            ))}
          </ChipRow>
        </View>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Target size={15} color={theme.colors.textMuted} />
            <AppText variant="label" color="textMuted">
              Daily goal — tasks to complete each day
            </AppText>
          </View>
          <ChipRow>
            {GOALS.map((g) => (
              <Chip key={g} label={String(g)} selected={g === goal} onPress={() => setGoal(g)} accessibilityLabel={`${g} tasks per day`} />
            ))}
          </ChipRow>
        </View>
        <Button label="Save" size="lg" fullWidth loading={busy} disabled={!online} onPress={save} />
      </View>
    </Screen>
  );
}

export default function EditProfile() {
  const profile = useProfile();
  if (profile.isLoading)
    return (
      <Screen title="Profile" back>
        <SkeletonList rows={2} />
      </Screen>
    );
  return <ProfileForm key={profile.data?.updated_at ?? 'none'} initial={profile.data ?? null} />;
}
