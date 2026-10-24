import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import type { CharacterDef, CharacterPalette } from './characters';
import type { MascotMood } from './mascotStore';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

/**
 * The companion rig — hand-drawn SVG animated with Reanimated on the UI thread.
 * Every character in characters.tsx plugs into the same rig, so moods and
 * reactions behave identically whichever companion the user picked. This is
 * the fallback renderer used until a production Rive file is supplied (see
 * mascotConfig.ts).
 */

type Palette = CharacterPalette;

type Props = { character: CharacterDef; mood: MascotMood; size: number; reduceMotion: boolean };

const VB_W = 200;
const VB_H = 220;

function Eyes({ mood, blink, look, palette }: { mood: MascotMood; blink: SharedValue<number>; look: SharedValue<number>; palette: Palette }) {
  const left = useAnimatedProps(() => ({ ry: 11 * blink.value, cx: 78 + look.value * 5 }));
  const right = useAnimatedProps(() => ({ ry: 11 * blink.value, cx: 122 + look.value * 5 }));
  const shineL = useAnimatedProps(() => ({ cx: 81 + look.value * 5, ry: 3.2 * blink.value }));
  const shineR = useAnimatedProps(() => ({ cx: 125 + look.value * 5, ry: 3.2 * blink.value }));

  const happy = mood === 'taskCompleted' || mood === 'goalAchieved' || mood === 'documentSaved' || mood === 'welcome';
  if (happy) {
    return (
      <G stroke={palette.ink} strokeWidth={6} strokeLinecap="round" fill="none">
        <Path d="M66 118 Q78 104 90 118" />
        <Path d="M110 118 Q122 104 134 118" />
      </G>
    );
  }
  if (mood === 'offline') {
    return (
      <G stroke={palette.ink} strokeWidth={5.5} strokeLinecap="round" fill="none">
        <Path d="M67 117 Q78 124 89 117" />
        <Path d="M111 117 Q122 124 133 117" />
      </G>
    );
  }
  return (
    <G>
      {mood === 'error' ? (
        <G stroke={palette.ink} strokeWidth={4} strokeLinecap="round">
          <Path d="M66 96 L88 101" />
          <Path d="M134 96 L112 101" />
        </G>
      ) : null}
      <AnimatedEllipse animatedProps={left} cy={116} rx={9} fill={palette.ink} />
      <AnimatedEllipse animatedProps={right} cy={116} rx={9} fill={palette.ink} />
      <AnimatedEllipse animatedProps={shineL} cy={111} rx={3.2} fill="#FFFFFF" />
      <AnimatedEllipse animatedProps={shineR} cy={111} rx={3.2} fill="#FFFFFF" />
    </G>
  );
}

function Mouth({ mood, palette }: { mood: MascotMood; palette: Palette }) {
  const ink = palette.mouth;
  switch (mood) {
    case 'goalAchieved':
    case 'taskCompleted':
      return <Path d="M84 136 Q100 160 116 136 Z" fill={ink} stroke={ink} strokeWidth={3} strokeLinejoin="round" />;
    case 'welcome':
    case 'documentSaved':
    case 'taskAdded':
      return <Path d="M86 137 Q100 152 114 137" stroke={ink} strokeWidth={5} strokeLinecap="round" fill="none" />;
    case 'error':
      return <Path d="M88 147 Q100 137 112 147" stroke={ink} strokeWidth={5} strokeLinecap="round" fill="none" />;
    case 'offline':
      return <Ellipse cx={100} cy={142} rx={5} ry={4} fill={ink} />;
    case 'loading':
    case 'empty':
      return <Path d="M91 141 L109 141" stroke={ink} strokeWidth={5} strokeLinecap="round" />;
    default:
      return <Path d="M89 138 Q100 147 111 138" stroke={ink} strokeWidth={5} strokeLinecap="round" fill="none" />;
  }
}

function Body({ character }: { character: CharacterDef }) {
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {character.body(character.palette)}
    </Svg>
  );
}

function Face({ mood, blink, look, character }: { mood: MascotMood; blink: SharedValue<number>; look: SharedValue<number>; character: CharacterDef }) {
  const palette = character.palette;
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`} style={StyleSheet.absoluteFill}>
      {character.cheeks ? (
        <G>
          <Ellipse cx={60} cy={136} rx={11} ry={7} fill={palette.cheek} opacity={mood === 'error' ? 0.25 : 0.55} />
          <Ellipse cx={140} cy={136} rx={11} ry={7} fill={palette.cheek} opacity={mood === 'error' ? 0.25 : 0.55} />
        </G>
      ) : null}
      {character.faceExtra?.(palette)}
      <Eyes mood={mood} blink={blink} look={look} palette={palette} />
      <Mouth mood={mood} palette={palette} />
    </Svg>
  );
}

function Top({ character }: { character: CharacterDef }) {
  const { w, h } = character.topBox;
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`}>
      {character.top(character.palette)}
    </Svg>
  );
}

function Arm({ palette, side }: { palette: Palette; side: 'left' | 'right' }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 40 60">
      <Path
        d={side === 'left' ? 'M30 6 C14 12 6 30 8 48 C10 56 20 56 22 48 C24 36 28 24 36 14 Z' : 'M10 6 C26 12 34 30 32 48 C30 56 20 56 18 48 C16 36 12 24 4 14 Z'}
        fill={palette.arm}
      />
    </Svg>
  );
}

const CONFETTI_COLORS = ['#D9653B', '#5E8A6B', '#C98F22', '#3F72AF', '#7B5EA7', '#E7C06A'];

function Particle({ index, count, burst, size, big }: { index: number; count: number; burst: SharedValue<number>; size: number; big: boolean }) {
  const angle = (index / count) * Math.PI * 2 + (index % 2 ? 0.3 : -0.2);
  const dist = size * (big ? 0.62 : 0.45) * (0.75 + ((index * 37) % 10) / 30);
  const style = useAnimatedStyle(() => {
    const p = burst.value;
    return {
      opacity: interpolate(p, [0, 0.1, 0.8, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: Math.cos(angle) * dist * p },
        { translateY: Math.sin(angle) * dist * p - size * 0.1 * p + size * 0.25 * p * p },
        { rotate: `${p * 360 * (index % 2 ? 1 : -1)}deg` },
        { scale: interpolate(p, [0, 0.2, 1], [0.2, 1, 0.6]) },
      ],
    };
  });
  const w = size * 0.05;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: size / 2 - w / 2, top: size * 0.42, width: w, height: w * (index % 3 === 0 ? 1 : 1.8), borderRadius: index % 3 === 0 ? w : 2, backgroundColor: CONFETTI_COLORS[index % CONFETTI_COLORS.length] },
        style,
      ]}
    />
  );
}

function Accessory({ mood, size, pulse }: { mood: MascotMood; size: number; pulse: SharedValue<number> }) {
  const floatStyle = useAnimatedStyle(() => ({ opacity: 0.55 + pulse.value * 0.45, transform: [{ translateY: -pulse.value * size * 0.04 }] }));
  const s = size * 0.3;
  let content: React.ReactNode = null;
  let pos: { left?: number; right?: number; top: number } = { right: size * 0.02, top: size * 0.08 };
  switch (mood) {
    case 'offline':
      content = (
        <Svg width={s} height={s} viewBox="0 0 60 60">
          <Path d="M16 40 C8 40 6 30 13 27 C13 18 24 15 29 21 C33 13 47 15 47 26 C54 27 55 40 46 40 Z" fill="#E6E1DA" stroke="#A39A8F" strokeWidth={2.5} />
          <Path d="M14 48 L46 16" stroke="#C2333F" strokeWidth={4} strokeLinecap="round" />
        </Svg>
      );
      break;
    case 'error':
      pos = { right: size * 0.16, top: size * 0.3 };
      content = (
        <Svg width={s * 0.45} height={s * 0.6} viewBox="0 0 24 32">
          <Path d="M12 2 C16 12 22 16 22 22 C22 28 17 31 12 31 C7 31 2 28 2 22 C2 16 8 12 12 2 Z" fill="#8DB3E0" />
        </Svg>
      );
      break;
    case 'documentSaved':
      pos = { right: size * 0.0, top: size * 0.34 };
      content = (
        <Svg width={s} height={s} viewBox="0 0 60 60">
          <Rect x={12} y={6} width={34} height={44} rx={6} fill="#FFFFFF" stroke="#2B211B" strokeWidth={3} />
          <Path d="M20 18 H38 M20 26 H38 M20 34 H30" stroke="#A39A8F" strokeWidth={3} strokeLinecap="round" />
          <Circle cx={44} cy={44} r={12} fill="#5E8A6B" />
          <Path d="M38 44 L42.5 48.5 L50 40" stroke="#FFFFFF" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      );
      break;
    case 'taskAdded':
    case 'welcome':
      content = (
        <Svg width={s * 0.8} height={s * 0.8} viewBox="0 0 40 40">
          <Path d="M20 2 L23 15 L36 18 L23 22 L20 36 L17 22 L4 18 L17 15 Z" fill="#E7C06A" />
        </Svg>
      );
      break;
    case 'loading':
      content = (
        <Svg width={s * 0.7} height={s * 0.5} viewBox="0 0 42 20">
          <Circle cx={7} cy={10} r={5} fill="#A39A8F" />
          <Circle cx={21} cy={10} r={5} fill="#A39A8F" opacity={0.7} />
          <Circle cx={35} cy={10} r={5} fill="#A39A8F" opacity={0.4} />
        </Svg>
      );
      break;
    case 'empty':
      pos = { left: size * 0.02, top: size * 0.1 };
      content = (
        <Svg width={s * 0.7} height={s * 0.7} viewBox="0 0 40 40">
          <Circle cx={20} cy={20} r={17} fill="#FFFFFF" stroke="#5E8A6B" strokeWidth={3} />
          <Path d="M20 11 V29 M11 20 H29" stroke="#5E8A6B" strokeWidth={4} strokeLinecap="round" />
        </Svg>
      );
      break;
    default:
      return null;
  }
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', ...pos }, floatStyle]}>
      {content}
    </Animated.View>
  );
}

export const VectorMascot = memo(function VectorMascot({ character, mood, size, reduceMotion }: Props) {
  const palette = character.palette;
  const sway = character.topSway;
  const box = character.topBox;
  const float = useSharedValue(0);
  const breathe = useSharedValue(0);
  const blink = useSharedValue(1);
  const look = useSharedValue(0);
  const leaf = useSharedValue(0);
  const armL = useSharedValue(0);
  const armR = useSharedValue(0);
  const hop = useSharedValue(0);
  const tilt = useSharedValue(0);
  const burst = useSharedValue(0);
  const pulse = useSharedValue(0);

  // Ambient loops: breathing, floating, blinking, leaf sway.
  useEffect(() => {
    if (reduceMotion) {
      [float, breathe, leaf, pulse].forEach((v) => {
        cancelAnimation(v);
        v.value = 0;
      });
      blink.value = 1;
      return;
    }
    const ease = Easing.inOut(Easing.sin);
    float.value = withRepeat(withTiming(1, { duration: 2200, easing: ease }), -1, true);
    breathe.value = withRepeat(withTiming(1, { duration: 1700, easing: ease }), -1, true);
    leaf.value = withRepeat(withTiming(1, { duration: 2600, easing: ease }), -1, true);
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: ease }), -1, true);
    blink.value = withRepeat(
      withSequence(withDelay(2800, withTiming(0.1, { duration: 80 })), withTiming(1, { duration: 120 }), withDelay(1400, withTiming(0.1, { duration: 70 })), withTiming(1, { duration: 110 })),
      -1,
      false,
    );
    return () => [float, breathe, leaf, pulse, blink].forEach((v) => cancelAnimation(v));
  }, [reduceMotion, float, breathe, leaf, pulse, blink]);

  // Mood-specific choreography.
  useEffect(() => {
    [armL, armR, hop, tilt, burst, look].forEach((v) => cancelAnimation(v));
    armL.value = withTiming(0, { duration: 200 });
    armR.value = withTiming(0, { duration: 200 });
    hop.value = withTiming(0, { duration: 200 });
    tilt.value = withTiming(0, { duration: 200 });
    look.value = withTiming(0, { duration: 200 });
    burst.value = 0;
    if (reduceMotion) {
      // Static poses only; arms stay at rest so no held pose looks stuck.
      if (mood === 'error') tilt.value = 6;
      return;
    }
    switch (mood) {
      case 'welcome':
        armR.value = withSequence(withTiming(-110, { duration: 260 }), withRepeat(withSequence(withTiming(-70, { duration: 180 }), withTiming(-110, { duration: 180 })), 4, false), withTiming(0, { duration: 260 }));
        hop.value = withSequence(withTiming(1, { duration: 220 }), withSpring(0, { damping: 8 }));
        break;
      case 'taskAdded':
        tilt.value = withSequence(withTiming(-8, { duration: 160 }), withTiming(8, { duration: 160 }), withSpring(0));
        armL.value = withSequence(withTiming(40, { duration: 180 }), withSpring(0));
        break;
      case 'taskCompleted':
        hop.value = withSequence(withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 7, stiffness: 160 }));
        armL.value = withSequence(withTiming(110, { duration: 200 }), withDelay(500, withSpring(0)));
        armR.value = withSequence(withTiming(-110, { duration: 200 }), withDelay(500, withSpring(0)));
        burst.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
        break;
      case 'goalAchieved':
        hop.value = withRepeat(withSequence(withTiming(1.4, { duration: 240, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 9 })), 3, false);
        tilt.value = withSequence(withTiming(360, { duration: 900, easing: Easing.inOut(Easing.cubic) }), withTiming(0, { duration: 0 }));
        armL.value = withRepeat(withSequence(withTiming(130, { duration: 200 }), withTiming(90, { duration: 200 })), 5, true);
        armR.value = withRepeat(withSequence(withTiming(-130, { duration: 200 }), withTiming(-90, { duration: 200 })), 5, true);
        burst.value = withRepeat(withSequence(withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 0 })), 3, false);
        break;
      case 'empty':
        // A brief wave toward the add button, then back to rest.
        armR.value = withSequence(withTiming(-60, { duration: 260 }), withDelay(900, withSpring(0)));
        look.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withDelay(600, withTiming(-1, { duration: 700 }))), -1, true);
        break;
      case 'loading':
        look.value = withRepeat(withSequence(withTiming(1, { duration: 500 }), withTiming(-1, { duration: 500 })), -1, true);
        tilt.value = withRepeat(withSequence(withTiming(-4, { duration: 500 }), withTiming(4, { duration: 500 })), -1, true);
        break;
      case 'error':
        tilt.value = withSequence(withTiming(-6, { duration: 70 }), withRepeat(withTiming(6, { duration: 90 }), 4, true), withTiming(5, { duration: 160 }));
        armL.value = withSpring(-15);
        armR.value = withSpring(15);
        break;
      case 'offline':
        tilt.value = withSpring(-7, { damping: 20 });
        armL.value = withSpring(-10);
        break;
      case 'documentSaved':
        armR.value = withSequence(withTiming(-50, { duration: 220 }), withDelay(700, withSpring(0)));
        hop.value = withSequence(withTiming(0.6, { duration: 180 }), withSpring(0, { damping: 8 }));
        break;
      default:
        break;
    }
  }, [mood, reduceMotion, armL, armR, hop, tilt, burst, look]);

  const bodyStyle = useAnimatedStyle(() => {
    const y = -float.value * size * 0.035 - hop.value * size * 0.12;
    const squash = 1 + breathe.value * 0.025;
    return {
      transform: [{ translateY: y }, { rotate: `${tilt.value}deg` }, { scaleY: squash }, { scaleX: 2 - squash }],
    };
  });
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: 0.18 - hop.value * 0.06,
    transform: [{ scaleX: 1 - float.value * 0.08 - hop.value * 0.18 }],
  }));
  const leafStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${(leaf.value - 0.5) * sway}deg` }] }));
  const armLStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${armL.value}deg` }] }));
  const armRStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${armR.value}deg` }] }));

  const w = size;
  const h = size * (VB_H / VB_W);
  const unit = w / VB_W;
  const big = mood === 'goalAchieved';
  const particles = mood === 'taskCompleted' || mood === 'goalAchieved' ? (big ? 16 : 10) : 0;

  return (
    <View style={{ width: w, height: h + unit * 18 }} pointerEvents="none">
      <Animated.View
        style={[
          { position: 'absolute', left: w * 0.24, right: w * 0.24, bottom: 0, height: unit * 14, borderRadius: 999, backgroundColor: '#3B2A1E' },
          shadowStyle,
        ]}
      />
      <Animated.View style={[{ width: w, height: h, transformOrigin: 'bottom' }, bodyStyle]}>
        {/* Arms sit behind the body; they rotate around the shoulder. */}
        <Animated.View style={[{ position: 'absolute', left: unit * 14, top: unit * 112, width: unit * 40, height: unit * 60, transformOrigin: '80% 10%' }, armLStyle]}>
          <Arm palette={palette} side="left" />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', right: unit * 14, top: unit * 112, width: unit * 40, height: unit * 60, transformOrigin: '20% 10%' }, armRStyle]}>
          <Arm palette={palette} side="right" />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', left: unit * box.x, top: unit * box.y, width: unit * box.w, height: unit * box.h, transformOrigin: '50% 100%' }, leafStyle]}>
          <Top character={character} />
        </Animated.View>
        <Body character={character} />
        <Face mood={mood} blink={blink} look={look} character={character} />
      </Animated.View>
      <Accessory mood={mood} size={w} pulse={pulse} />
      {Array.from({ length: particles }, (_, i) => (
        <Particle key={`${mood}-${i}`} index={i} count={particles} burst={burst} size={w} big={big} />
      ))}
    </View>
  );
});
