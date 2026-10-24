import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

const ACircle = Animated.createAnimatedComponent(Circle);

export function ProgressRing({ value, size = 92, stroke = 9, color, label, sublabel }: { value: number; size?: number; stroke?: number; color?: string; label?: string; sublabel?: string }) {
  const theme = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = useSharedValue(0);
  const clamped = Math.max(0, Math.min(1, value));
  useEffect(() => {
    p.value = theme.reduceMotion ? clamped : withTiming(clamped, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [clamped, p, theme.reduceMotion]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - p.value) }));
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }} accessibilityLabel={label}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.colors.surfaceSunken} strokeWidth={stroke} fill="none" />
        <ACircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? theme.colors.primary}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          animatedProps={props}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        {label ? <AppText variant="heading">{label}</AppText> : null}
        {sublabel ? (
          <AppText variant="caption" color="textMuted">
            {sublabel}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

export function ProgressBar({ value, color, height = 8, label }: { value: number; color?: string; height?: number; label?: string }) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, value));
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = theme.reduceMotion ? clamped : withTiming(clamped, { duration: 300 });
  }, [clamped, w, theme.reduceMotion]);
  const s = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{ height, borderRadius: height / 2, backgroundColor: theme.colors.surfaceSunken, overflow: 'hidden' }}
    >
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color ?? theme.colors.primary }, s]} />
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
