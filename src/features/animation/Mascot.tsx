import { memo, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { usePreferencesStore } from '@/stores/preferencesStore';
import { useTheme } from '@/theme';

import { getCharacter, type CharacterDef, type CharacterId } from './characters';
import { RIVE_ARTBOARD, RIVE_ENABLED, RIVE_MOOD_VALUES, RIVE_SOURCE, RIVE_STATE_MACHINE } from './mascotConfig';
import { currentMood, MOOD_MESSAGES, useMascotStore, type MascotMood } from './mascotStore';
import { VectorMascot } from './VectorMascot';

type RiveRefLike = { setInputState: (sm: string, input: string, v: number | boolean) => void; fireState: (sm: string, input: string) => void };

/** Rive renderer — only loaded when a real character file is configured. */
function RiveMascot({ mood, size, reduceMotion }: { mood: MascotMood; size: number; reduceMotion: boolean }) {
  // Required lazily so Expo Go / tests never touch the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Rive = require('rive-react-native').default as React.ComponentType<Record<string, unknown>>;
  const ref = useRef<RiveRefLike | null>(null);
  useEffect(() => {
    ref.current?.setInputState(RIVE_STATE_MACHINE, 'mood', RIVE_MOOD_VALUES[mood]);
    ref.current?.setInputState(RIVE_STATE_MACHINE, 'reducedMotion', reduceMotion);
    ref.current?.fireState(RIVE_STATE_MACHINE, 'react');
  }, [mood, reduceMotion]);
  return <Rive ref={ref} source={RIVE_SOURCE} artboardName={RIVE_ARTBOARD} stateMachineName={RIVE_STATE_MACHINE} style={{ width: size, height: size * 1.1 }} autoplay />;
}

/** The companion the user picked in Settings → Companion. */
export function useCompanion(): CharacterDef {
  return getCharacter(usePreferencesStore((s) => s.mascotCharacter));
}

type Props = {
  size?: number;
  /** Render a specific character (e.g. in the picker); otherwise the user's choice. */
  character?: CharacterId;
  /** Force a mood (e.g. on the splash screen); otherwise follows app events. */
  mood?: MascotMood;
  /** Ambient mood this screen reports while mounted (empty, loading, offline…). */
  ambient?: MascotMood;
  showMessage?: boolean;
  message?: string;
  style?: ViewStyle;
};

export const Mascot = memo(function Mascot({ size = 120, character: characterId, mood: forced, ambient, showMessage = false, message, style }: Props) {
  const theme = useTheme();
  const companion = useCompanion();
  const character = characterId ? getCharacter(characterId) : companion;
  const storeMood = useMascotStore(currentMood);
  const setAmbient = useMascotStore((s) => s.setAmbient);

  useEffect(() => {
    if (!ambient) return;
    setAmbient(ambient);
    return () => setAmbient('idle');
  }, [ambient, setAmbient]);

  const mood = forced ?? storeMood;
  const text = message ?? MOOD_MESSAGES[mood];
  const label = `${character.name}, your Taskrypt companion${text ? `: ${text}` : ''}`;

  return (
    <View style={[styles.wrap, style]} accessible accessibilityRole="image" accessibilityLabel={label}>
      {RIVE_ENABLED && RIVE_SOURCE != null && character.id === 'kora' ? (
        <RiveMascot mood={mood} size={size} reduceMotion={theme.reduceMotion} />
      ) : (
        <VectorMascot character={character} mood={mood} size={size} reduceMotion={theme.reduceMotion} />
      )}
      {showMessage && text ? (
        <Animated.View
          key={text}
          entering={theme.reduceMotion ? undefined : FadeIn.duration(220)}
          exiting={theme.reduceMotion ? undefined : FadeOut.duration(160)}
          style={[styles.bubble, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }, theme.shadow(1)]}
        >
          <Text style={[theme.typography.label, { color: theme.colors.text, textAlign: 'center' }]}>{text}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  bubble: { marginTop: 10, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, maxWidth: 280 },
});
