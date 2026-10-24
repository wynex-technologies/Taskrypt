/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Synchronous stand-in for react-native-reanimated in Jest. Animations resolve to
 * their final value immediately so tests assert on end states and accessibility,
 * not on frames.
 */
import { forwardRef, type ComponentType } from 'react';
import { View, Text, ScrollView, Image } from 'react-native';

const final = (v: any): any => v;

export const useSharedValue = (v: any) => ({ value: v, get: () => v, set: () => undefined });
export const useAnimatedStyle = (fn: () => any) => fn();
export const useAnimatedProps = (fn: () => any) => fn();
export const useDerivedValue = (fn: () => any) => ({ value: fn() });
export const useReducedMotion = () => false;
export const withTiming = final;
export const withSpring = final;
export const withDelay = (_: number, v: any) => v;
export const withRepeat = final;
export const withSequence = (...v: any[]) => v[v.length - 1];
export const cancelAnimation = () => undefined;
export const runOnJS = (fn: any) => fn;
export const interpolate = (x: number, input: number[], output: number[]) => {
  if (x <= input[0]!) return output[0];
  for (let i = 1; i < input.length; i++) {
    if (x <= input[i]!) {
      const t = (x - input[i - 1]!) / (input[i]! - input[i - 1]!);
      return output[i - 1]! + t * (output[i]! - output[i - 1]!);
    }
  }
  return output[output.length - 1];
};
export const interpolateColor = (_x: number, _i: number[], out: string[]) => out[out.length - 1];

const easingFn = (t: number) => t;
export const Easing = new Proxy(
  {},
  { get: () => (...args: any[]) => (typeof args[0] === 'function' ? args[0] : easingFn) },
) as any;

/** Chainable layout-animation builders (FadeIn.duration(200).delay(50)…). */
const builder: any = new Proxy(function () {}, { get: (_t, p) => (p === 'build' ? () => ({}) : () => builder), apply: () => builder });
export const FadeIn = builder;
export const FadeOut = builder;
export const FadeInUp = builder;
export const FadeInDown = builder;
export const FadeOutDown = builder;
export const LinearTransition = builder;

function strip<P extends Record<string, any>>(props: P) {
  const { entering: _e, exiting: _x, layout: _l, animatedProps, ...rest } = props as any;
  return { ...rest, ...(animatedProps ?? {}) };
}

export function createAnimatedComponent<T extends ComponentType<any>>(C: T): T {
  return forwardRef<any, any>(function Animated(props, ref) {
    return <C ref={ref} {...strip(props)} />;
  }) as unknown as T;
}

const Animated = {
  View: createAnimatedComponent(View),
  Text: createAnimatedComponent(Text),
  ScrollView: createAnimatedComponent(ScrollView),
  Image: createAnimatedComponent(Image),
  createAnimatedComponent,
};

export default Animated;
