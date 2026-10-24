import { Check } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { HIT_TARGET, useTheme } from '@/theme';

import { ScalePressable } from './Pressable';

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  color?: string;
  label: string;
  size?: number;
  testID?: string;
};

/** Round completion toggle with a springy fill and check pop. */
export function Checkbox({ checked, onChange, color, label, size = 26, testID }: Props) {
  const theme = useTheme();
  const tint = color ?? theme.colors.primary;
  const p = useSharedValue(checked ? 1 : 0);
  const pop = useSharedValue(1);

  useEffect(() => {
    if (theme.reduceMotion) {
      p.value = checked ? 1 : 0;
      return;
    }
    p.value = withTiming(checked ? 1 : 0, { duration: 180 });
    if (checked) pop.value = withSequence(withTiming(1.25, { duration: 110 }), withSpring(1, theme.motion.spring.bouncy));
  }, [checked, theme.reduceMotion, p, pop, theme.motion.spring.bouncy]);

  const box = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], ['transparent', tint]),
    borderColor: interpolateColor(p.value, [0, 1], [theme.colors.borderStrong, tint]),
    transform: [{ scale: pop.value }],
  }));
  const mark = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: 0.4 + p.value * 0.6 }] }));

  return (
    <ScalePressable
      testID={testID}
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      hitSlop={(HIT_TARGET - size) / 2}
      pressedScale={0.88}
    >
      <Animated.View style={[styles.box, { width: size, height: size, borderRadius: size / 2 }, box]}>
        <Animated.View style={mark}>
          <Check size={size * 0.62} color={theme.colors.onPrimary} strokeWidth={3.2} />
        </Animated.View>
      </Animated.View>
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
