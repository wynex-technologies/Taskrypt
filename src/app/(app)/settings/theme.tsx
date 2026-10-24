import * as Haptics from 'expo-haptics';
import { Check, Moon, Palette, Smartphone, Sparkles, Sun, Vibrate, Wind } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { AppText, Card, RowGroup, Screen, Segmented, SwitchRow } from '@/components';
import { Mascot, useCompanion } from '@/features/animation/Mascot';
import { usePreferencesStore, type MotionPreference, type ThemePreference } from '@/stores/preferencesStore';
import { ACCENT_IDS, ACCENTS, CHARACTER_ACCENT, useTheme, type AccentId } from '@/theme';

export default function ThemeSettings() {
  const theme = useTheme();
  const prefs = usePreferencesStore();
  const companion = useCompanion();
  const matching = prefs.accentPreference === 'companion';

  const chooseAccent = (id: AccentId) => {
    if (prefs.hapticsEnabled) Haptics.selectionAsync().catch(() => undefined);
    prefs.set('accentPreference', id);
  };

  return (
    <Screen title="Appearance" back>
      <View style={{ gap: theme.spacing.xl }}>
        <Card elevated tone="raised" style={{ alignItems: 'center', gap: 8 }}>
          <Mascot size={96} mood="welcome" />
          <AppText variant="label" color="textMuted">
            {theme.scheme === 'dark' ? 'Dark' : 'Light'} theme · {ACCENTS[theme.accent].label} · {theme.reduceMotion ? 'reduced motion' : 'full motion'}
          </AppText>
        </Card>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {theme.scheme === 'dark' ? <Moon size={15} color={theme.colors.textMuted} /> : <Sun size={15} color={theme.colors.textMuted} />}
            <AppText variant="label" color="textMuted">
              Theme
            </AppText>
          </View>
          <Segmented<ThemePreference>
            accessibilityLabel="Theme"
            value={prefs.themePreference}
            onChange={(v) => prefs.set('themePreference', v)}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </View>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Palette size={15} color={theme.colors.textMuted} />
            <AppText variant="label" color="textMuted">
              App colour
            </AppText>
          </View>
          <RowGroup>
            <SwitchRow
              icon={Sparkles}
              title="Match my companion"
              subtitle={`Use ${companion.name}'s colours (${ACCENTS[CHARACTER_ACCENT[companion.id]].label})`}
              value={matching}
              onValueChange={(v) => prefs.set('accentPreference', v ? 'companion' : theme.accent)}
            />
          </RowGroup>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }} accessibilityRole="radiogroup" accessibilityLabel="App colour">
            {ACCENT_IDS.map((id) => {
              const a = ACCENTS[id];
              const active = !matching && theme.accent === id;
              const swatch = theme.scheme === 'dark' ? a.dark : a.light;
              return (
                <Pressable
                  key={id}
                  onPress={() => chooseAccent(id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={a.label}
                  testID={`accent-${id}`}
                  style={{ alignItems: 'center', gap: 6, width: 64 }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: swatch,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: active ? 3 : 0,
                      borderColor: theme.colors.text,
                    }}
                  >
                    {active ? <Check size={18} color={theme.colors.onPrimary} strokeWidth={3} /> : null}
                  </View>
                  <AppText variant="caption" color={active ? 'text' : 'textMuted'} numberOfLines={1}>
                    {a.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <AppText variant="caption" color="textSubtle">
            {matching ? `Colours change when you pick a different companion.` : 'Picking a colour turns off companion matching.'}
          </AppText>
        </View>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Wind size={15} color={theme.colors.textMuted} />
            <AppText variant="label" color="textMuted">
              Motion
            </AppText>
          </View>
          <Segmented<MotionPreference>
            accessibilityLabel="Motion"
            value={prefs.motionPreference}
            onChange={(v) => prefs.set('motionPreference', v)}
            options={[
              { value: 'system', label: 'System' },
              { value: 'full', label: 'Full' },
              { value: 'reduced', label: 'Reduced' },
            ]}
          />
          <AppText variant="caption" color="textSubtle">
            System follows your device&apos;s Reduce Motion setting. Reduced keeps your companion calm and removes transitions.
          </AppText>
        </View>
        <RowGroup>
          <SwitchRow icon={Vibrate} title="Haptic feedback" subtitle="Gentle taps when you add and complete tasks" value={prefs.hapticsEnabled} onValueChange={(v) => prefs.set('hapticsEnabled', v)} />
        </RowGroup>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Smartphone size={14} color={theme.colors.textSubtle} />
          <AppText variant="caption" color="textSubtle">
            Text size follows your device accessibility settings.
          </AppText>
        </View>
      </View>
    </Screen>
  );
}
