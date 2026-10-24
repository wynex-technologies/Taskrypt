import type { ReactElement } from 'react';
import { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * The companion roster. Every character shares one rig (see VectorMascot): a
 * 200×220 body, a swaying head piece, two shoulder-pivot arms and the shared
 * face (eyes at y≈116, mouth at y≈140). A character only supplies its art and
 * palette, so every mood and reaction works for all of them.
 */

export const CHARACTER_IDS = ['kora', 'mochi', 'bolt', 'pip', 'ember'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export const DEFAULT_CHARACTER: CharacterId = 'kora';

export type CharacterPalette = {
  body: string;
  bodyLight: string;
  bodyShade: string;
  belly: string;
  ink: string;
  mouth: string;
  cheek: string;
  arm: string;
  accent: string;
  accentDark: string;
};

/** Head piece placement in body viewBox units; the piece pivots at its bottom centre. */
export type TopBox = { x: number; y: number; w: number; h: number };

export type CharacterDef = {
  id: CharacterId;
  name: string;
  species: string;
  tagline: string;
  palette: CharacterPalette;
  /** Body art in the shared 200×220 viewBox. */
  body: (p: CharacterPalette) => ReactElement;
  /** Swaying head piece, drawn behind the body in a `0 0 w h` viewBox. */
  top: (p: CharacterPalette) => ReactElement;
  topBox: TopBox;
  /** Peak-to-peak sway of the head piece, in degrees. */
  topSway: number;
  cheeks: boolean;
  /** Face details drawn under the eyes and mouth (whiskers, nose…). */
  faceExtra?: (p: CharacterPalette) => ReactElement;
};

const DEFAULT_TOP: TopBox = { x: 62, y: 0, w: 80, h: 70 };

/** Seed / egg silhouette shared by Kora, Mochi and Pip. */
const EGG = 'M100 52 C146 52 170 92 170 136 C170 178 140 204 100 204 C60 204 30 178 30 136 C30 92 54 52 100 52 Z';
const EGG_BELLY = 'M100 152 C127 152 142 166 142 180 C142 196 123 202 100 202 C77 202 58 196 58 180 C58 166 73 152 100 152 Z';

function BodyGradient({ id, p }: { id: string; p: CharacterPalette }) {
  return (
    <Defs>
      <RadialGradient id={`${id}Body`} cx="40%" cy="35%" r="75%">
        <Stop offset="0%" stopColor={p.bodyLight} />
        <Stop offset="55%" stopColor={p.body} />
        <Stop offset="100%" stopColor={p.bodyShade} />
      </RadialGradient>
      <LinearGradient id={`${id}Belly`} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.95} />
        <Stop offset="100%" stopColor={p.belly} stopOpacity={0.9} />
      </LinearGradient>
    </Defs>
  );
}

function Highlight() {
  return <Ellipse cx={72} cy={82} rx={16} ry={9} fill="#FFFFFF" opacity={0.35} transform="rotate(-28 72 82)" />;
}

function Feet({ color }: { color: string }) {
  return (
    <G>
      <Ellipse cx={76} cy={205} rx={16} ry={7} fill={color} />
      <Ellipse cx={124} cy={205} rx={16} ry={7} fill={color} />
    </G>
  );
}

// ─── Kora · sprout seed ──────────────────────────────────────────────────────
const kora: CharacterDef = {
  id: 'kora',
  name: 'Kora',
  species: 'Sprout seed',
  tagline: 'Calm, warm and always growing.',
  palette: {
    body: '#F0A07F',
    bodyLight: '#FBC3A6',
    bodyShade: '#D9653B',
    belly: '#FFF3E8',
    ink: '#2B211B',
    mouth: '#2B211B',
    cheek: '#F07C69',
    arm: '#D9653B',
    accent: '#7FB08A',
    accentDark: '#4E7F5B',
  },
  body: (p) => (
    <G>
      <BodyGradient id="kora" p={p} />
      <Path d={EGG} fill="url(#koraBody)" />
      <Path d={EGG_BELLY} fill="url(#koraBelly)" />
      <Highlight />
      <Feet color={p.bodyShade} />
    </G>
  ),
  top: (p) => (
    <G>
      <Path d="M40 68 C40 52 40 40 42 30" stroke={p.accentDark} strokeWidth={5} strokeLinecap="round" fill="none" />
      <Path d="M42 34 C30 14 10 14 4 22 C14 36 30 40 42 34 Z" fill={p.accent} />
      <Path d="M42 30 C52 8 72 6 78 14 C70 30 54 36 42 30 Z" fill={p.accent} />
      <Path d="M42 34 C30 26 18 22 10 22" stroke={p.accentDark} strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.6} />
      <Path d="M42 30 C54 22 64 16 72 14" stroke={p.accentDark} strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.6} />
    </G>
  ),
  topBox: DEFAULT_TOP,
  topSway: 14,
  cheeks: true,
};

// ─── Mochi · cloud kitten ────────────────────────────────────────────────────
const mochi: CharacterDef = {
  id: 'mochi',
  name: 'Mochi',
  species: 'Cloud kitten',
  tagline: 'Curious, cosy and quietly proud of you.',
  palette: {
    body: '#B4BCD3',
    bodyLight: '#E6EAF4',
    bodyShade: '#7D87A6',
    belly: '#FFF6EE',
    ink: '#2A2738',
    mouth: '#2A2738',
    cheek: '#F4A3B4',
    arm: '#8B94B2',
    accent: '#F6AFC0',
    accentDark: '#7D87A6',
  },
  body: (p) => (
    <G>
      <BodyGradient id="mochi" p={p} />
      {/* Tail curls up behind the right side. */}
      <Path d="M150 190 C178 192 192 172 186 150 C182 136 168 134 166 146 C176 150 178 170 160 176 Z" fill={p.bodyShade} />
      <Path d={EGG} fill="url(#mochiBody)" />
      <Path d={EGG_BELLY} fill="url(#mochiBelly)" />
      {/* Forehead stripes */}
      <G stroke={p.bodyShade} strokeWidth={4} strokeLinecap="round" opacity={0.7}>
        <Path d="M100 60 L100 74" />
        <Path d="M88 62 L90 73" />
        <Path d="M112 62 L110 73" />
      </G>
      <Highlight />
      <Feet color={p.bodyShade} />
    </G>
  ),
  top: (p) => (
    <G>
      <Path d="M26 70 C26 46 28 22 32 10 C34 4 39 4 42 8 C52 22 62 36 74 52 Z" fill={p.bodyShade} />
      <Path d="M114 70 C114 46 112 22 108 10 C106 4 101 4 98 8 C88 22 78 36 66 52 Z" fill={p.bodyShade} />
      <Path d="M34 58 C34 42 35 28 37 20 C44 30 52 40 60 50 Z" fill={p.accent} />
      <Path d="M106 58 C106 42 105 28 103 20 C96 30 88 40 80 50 Z" fill={p.accent} />
    </G>
  ),
  topBox: { x: 30, y: 20, w: 140, h: 70 },
  topSway: 5,
  cheeks: true,
  faceExtra: (p) => (
    <G>
      <Path d="M94 126 L106 126 L100 132 Z" fill={p.accent} stroke={p.accent} strokeWidth={3} strokeLinejoin="round" />
      <G stroke={p.ink} strokeWidth={2.2} strokeLinecap="round" opacity={0.55}>
        <Path d="M40 124 L62 128" />
        <Path d="M40 136 L62 134" />
        <Path d="M160 124 L138 128" />
        <Path d="M160 136 L138 134" />
      </G>
    </G>
  ),
};

// ─── Bolt · pocket robot ─────────────────────────────────────────────────────
const bolt: CharacterDef = {
  id: 'bolt',
  name: 'Bolt',
  species: 'Pocket robot',
  tagline: 'Precise, upbeat and powered by checkmarks.',
  palette: {
    body: '#C5D3E2',
    bodyLight: '#F2F7FB',
    bodyShade: '#8399B1',
    belly: '#1F2B3A',
    ink: '#6FF2DA',
    mouth: '#6FF2DA',
    cheek: '#FF8FA3',
    arm: '#8399B1',
    accent: '#FFC94D',
    accentDark: '#5C6F84',
  },
  body: (p) => (
    <G>
      <BodyGradient id="bolt" p={p} />
      {/* Ear bolts */}
      <Rect x={22} y={114} width={16} height={28} rx={6} fill={p.accentDark} />
      <Rect x={162} y={114} width={16} height={28} rx={6} fill={p.accentDark} />
      <Rect x={34} y={58} width={132} height={144} rx={40} fill="url(#boltBody)" />
      {/* Visor */}
      <Rect x={50} y={86} width={100} height={74} rx={26} fill={p.belly} />
      <Rect x={60} y={92} width={34} height={8} rx={4} fill="#FFFFFF" opacity={0.14} />
      {/* Chest lights */}
      <Rect x={76} y={170} width={48} height={18} rx={9} fill={p.bodyShade} opacity={0.55} />
      <Circle cx={88} cy={179} r={4} fill={p.ink} />
      <Circle cx={100} cy={179} r={4} fill={p.accent} />
      <Circle cx={112} cy={179} r={4} fill={p.cheek} />
      <Ellipse cx={66} cy={74} rx={14} ry={7} fill="#FFFFFF" opacity={0.4} transform="rotate(-20 66 74)" />
      <Rect x={60} y={198} width={30} height={12} rx={6} fill={p.accentDark} />
      <Rect x={110} y={198} width={30} height={12} rx={6} fill={p.accentDark} />
    </G>
  ),
  top: (p) => (
    <G>
      <Path d="M40 70 L40 26" stroke={p.accentDark} strokeWidth={5} strokeLinecap="round" />
      <Circle cx={40} cy={18} r={14} fill={p.accent} opacity={0.3} />
      <Circle cx={40} cy={18} r={9} fill={p.accent} />
      <Circle cx={37} cy={15} r={3} fill="#FFFFFF" opacity={0.8} />
    </G>
  ),
  topBox: DEFAULT_TOP,
  topSway: 22,
  cheeks: false,
};

// ─── Pip · little penguin ────────────────────────────────────────────────────
const pip: CharacterDef = {
  id: 'pip',
  name: 'Pip',
  species: 'Little penguin',
  tagline: 'Steady, loyal and cool under pressure.',
  palette: {
    body: '#3A4763',
    bodyLight: '#62708E',
    bodyShade: '#1F2738',
    belly: '#FFFFFF',
    ink: '#1F2738',
    mouth: '#F2A33A',
    cheek: '#F79C9C',
    arm: '#2A3449',
    accent: '#F2A33A',
    accentDark: '#1F2738',
  },
  body: (p) => (
    <G>
      <BodyGradient id="pip" p={p} />
      <Path d={EGG} fill="url(#pipBody)" />
      {/* White face and tummy */}
      <Path
        d="M100 98 C112 82 142 84 147 110 C153 138 151 172 138 190 C126 204 74 204 62 190 C49 172 47 138 53 110 C58 84 88 82 100 98 Z"
        fill={p.belly}
      />
      <Ellipse cx={72} cy={78} rx={14} ry={7} fill="#FFFFFF" opacity={0.25} transform="rotate(-28 72 78)" />
      <Feet color={p.accent} />
    </G>
  ),
  top: (p) => (
    <G>
      <Path d="M40 70 C38 50 36 34 30 22 C40 26 44 40 44 52 Z" fill={p.bodyShade} />
      <Path d="M42 70 C42 46 44 26 50 10 C56 30 52 50 48 64 Z" fill={p.bodyShade} />
      <Path d="M44 70 C48 52 54 40 64 32 C62 46 56 58 50 66 Z" fill={p.bodyShade} />
    </G>
  ),
  topBox: DEFAULT_TOP,
  topSway: 10,
  cheeks: true,
};

// ─── Ember · tiny flame spirit ───────────────────────────────────────────────
const ember: CharacterDef = {
  id: 'ember',
  name: 'Ember',
  species: 'Flame spirit',
  tagline: 'Bright, bold and fired up for your goals.',
  palette: {
    body: '#FF9F45',
    bodyLight: '#FFE08A',
    bodyShade: '#E8552B',
    belly: '#FFE7A8',
    ink: '#3A1D12',
    mouth: '#3A1D12',
    cheek: '#FF5F57',
    arm: '#F07A3A',
    accent: '#FFD45C',
    accentDark: '#FF8A3D',
  },
  body: (p) => (
    <G>
      <BodyGradient id="ember" p={p} />
      <Path
        d="M100 34 C108 56 128 64 146 84 C162 104 172 122 172 146 C172 182 142 206 100 206 C58 206 28 182 28 146 C28 118 44 98 60 84 C62 96 68 104 76 106 C72 84 84 58 100 34 Z"
        fill="url(#emberBody)"
      />
      <Path d="M100 154 C116 166 134 172 134 186 C134 199 118 204 100 204 C82 204 66 199 66 186 C66 172 84 166 100 154 Z" fill="url(#emberBelly)" />
      <Ellipse cx={74} cy={124} rx={10} ry={6} fill="#FFFFFF" opacity={0.3} transform="rotate(-40 74 124)" />
    </G>
  ),
  top: (p) => (
    <G>
      <Path d="M40 70 C24 60 22 42 32 28 C34 38 38 42 41 36 C44 24 40 14 46 2 C60 18 64 38 58 52 C54 62 48 68 40 70 Z" fill={p.accentDark} />
      <Path d="M41 66 C32 58 32 48 37 40 C40 46 44 44 46 38 C52 46 52 58 47 64 Z" fill={p.accent} />
    </G>
  ),
  topBox: DEFAULT_TOP,
  topSway: 18,
  cheeks: true,
};

export const CHARACTERS: Record<CharacterId, CharacterDef> = { kora, mochi, bolt, pip, ember };

/** Resolves a stored id, falling back to Kora for unknown or retired ids. */
export function getCharacter(id: string | null | undefined): CharacterDef {
  return (id && (CHARACTERS as Record<string, CharacterDef>)[id]) || CHARACTERS[DEFAULT_CHARACTER];
}
