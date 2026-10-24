import { forwardRef } from 'react';
import { Pressable, type PressableProps, type ViewStyle, type StyleProp } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useTheme } from '@/theme';

const APressable = Animated.createAnimatedComponent(Pressable);

export type ScalePressableProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Scale when pressed. */
  pressedScale?: number;
};

/** Pressable with a subtle spring press-in, disabled under reduced motion. */
export const ScalePressable = forwardRef<React.ComponentRef<typeof Pressable>, ScalePressableProps>(function ScalePressable(
  { pressedScale = 0.97, style, onPressIn, onPressOut, ...rest },
  ref,
) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <APressable
      ref={ref}
      {...rest}
      onPressIn={(e) => {
        if (!theme.reduceMotion) scale.value = withSpring(pressedScale, theme.motion.spring.snappy);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, theme.motion.spring.snappy);
        onPressOut?.(e);
      }}
      style={[style, animated]}
    />
  );
});
