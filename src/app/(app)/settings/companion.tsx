import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Card, Chip, ChipRow, Screen } from '@/components';
import { CHARACTER_IDS, getCharacter, type CharacterId } from '@/features/animation/characters';
import { Mascot } from '@/features/animation/Mascot';
import { MOOD_MESSAGES, TRANSIENT_MOODS, type MascotMood } from '@/features/animation/mascotStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useTheme } from '@/theme';

const PREVIEW_MOODS: { mood: MascotMood; label: string }[] = [
  { mood: 'welcome', label: 'Wave' },
  { mood: 'taskCompleted', label: 'Task done' },
  { mood: 'goalAchieved', label: 'Goal reached' },
  { mood: 'documentSaved', label: 'Saved' },
  { mood: 'error', label: 'Oops' },
  { mood: 'offline', label: 'Offline' },
];

export default function CompanionSettings() {
  const theme = useTheme();
  const selected = usePreferencesStore((s) => s.mascotCharacter);
  const setPref = usePreferencesStore((s) => s.set);
  const hapticsEnabled = usePreferencesStore((s) => s.hapticsEnabled);
  const matchColours = usePreferencesStore((s) => s.accentPreference === 'companion');
  const [preview, setPreview] = useState<{ mood: MascotMood; id: number }>({ mood: 'welcome', id: 0 });
  const current = getCharacter(selected);

  // Play the preview once, then settle back to idle.
  useEffect(() => {
    const ms = TRANSIENT_MOODS[preview.mood];
    if (!ms) return;
    const t = setTimeout(() => setPreview((p) => (p.id === preview.id ? { mood: 'idle', id: p.id } : p)), ms);
    return () => clearTimeout(t);
  }, [preview]);

  const play = (mood: MascotMood) => setPreview((p) => ({ mood, id: p.id + 1 }));

  const choose = (id: CharacterId) => {
    if (hapticsEnabled) Haptics.selectionAsync().catch(() => undefined);
    setPref('mascotCharacter', id);
    play('welcome');
  };

  return (
    <Screen title="Companion" subtitle="Pick who cheers you on" back>
      <View style={{ gap: theme.spacing.xl }}>
        <Card elevated tone="raised" style={{ alignItems: 'center', gap: 6 }}>
          <Mascot key={`${current.id}-${preview.id}`} size={132} mood={preview.mood} showMessage message={preview.mood === 'idle' ? current.tagline : MOOD_MESSAGES[preview.mood]} />
          <AppText variant="heading">{current.name}</AppText>
          <AppText variant="caption" color="textMuted">
            {current.species}
          </AppText>
        </Card>

        <View style={{ gap: 8 }}>
          <AppText variant="label" color="textMuted">
            Try a reaction
          </AppText>
          <ChipRow>
            {PREVIEW_MOODS.map((m) => (
              <Chip key={m.mood} label={m.label} selected={preview.mood === m.mood} onPress={() => play(m.mood)} />
            ))}
          </ChipRow>
        </View>

        <View style={{ gap: 10 }}>
          <AppText variant="label" color="textMuted">
            Characters
          </AppText>
          <AppText variant="caption" color="textSubtle">
            {matchColours ? 'The app’s colours follow your companion.' : 'App colour is set manually in Appearance.'}
          </AppText>
          {CHARACTER_IDS.map((id) => {
            const c = getCharacter(id);
            const active = id === current.id;
            return (
              <Card
                key={id}
                onPress={() => choose(id)}
                accessibilityLabel={`${c.name}, ${c.species}${active ? ', selected' : ''}`}
                testID={`companion-${id}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  paddingVertical: theme.spacing.md,
                  borderWidth: active ? 2 : undefined,
                  borderColor: active ? theme.colors.primary : undefined,
                  backgroundColor: active ? theme.colors.primarySoft : undefined,
                }}
              >
                <Mascot character={id} size={64} mood="idle" />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="heading">{c.name}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {c.species} · {c.tagline}
                  </AppText>
                </View>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: active ? 0 : 2,
                    borderColor: theme.colors.border,
                    backgroundColor: active ? theme.colors.primary : 'transparent',
                  }}
                >
                  {active ? <Check size={16} color={theme.colors.onPrimary} strokeWidth={3} /> : null}
                </View>
              </Card>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}
