import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

export type BantayExpression = 'idle' | 'attention' | 'thinking' | 'celebration';
export type BantayVariant = 'bust' | 'full';
export type BantayEyes = 'open' | 'half' | 'closed' | 'happy';
export type BantayMouth = 'smile' | 'small' | 'open';

/**
 * Every moving part of Bantay. Sprite frames are rendered from sequences of these poses.
 * Angles are degrees; offsets are viewBox units of the bust drawing (100×100).
 */
export type BantayPose = {
  eyes: BantayEyes;
  /** Pupil direction, -1..1 (negative looks left / up). */
  lookX: number;
  lookY: number;
  /** Brow lift, -1..1 per side (viewer's left/right). */
  browLeft: number;
  browRight: number;
  /** Positive perks the ear up, negative lets it droop. */
  earLeft: number;
  earRight: number;
  /** Positive tilts the head toward the viewer's right. */
  headTilt: number;
  /** Extra vertical head offset (negative is up). */
  headY: number;
  /** Breathing phase, 0 (exhaled) .. 1 (inhaled). */
  breath: number;
  /** Lift: the full body leaves the ground; the bust rises by 60% of it. */
  hop: number;
  /** Full variant: positive squashes on landing, negative stretches on take-off. */
  squash: number;
  /** Full variant: tail swing; positive swings toward the viewer's right. */
  tail: number;
  /** Right paw: 0 resting, 1 raised to the chin. */
  pawRaise: number;
  mouth: BantayMouth;
};

/** Full-variant only: lets a scene swap Bantay's resting paws/tail for its own pose, drawn in the same 120×120 space. */
export type BantaySceneOverride = {
  hideFrontPaws?: boolean;
  hideTail?: boolean;
  layer?: React.ReactNode;
};

/** Mascot artwork colours. Fixed illustration colours, shared with scene props and the sprite/icon generator. */
export const bantayPalette = {
  coat: '#D4914C',
  coatShade: '#B67434',
  muzzle: '#FBF1E3',
  earInner: '#E8B49E',
  blush: '#E79A86',
  eye: '#2A1C12',
  highlight: '#FFFDF8',
  brow: '#8E5222',
  ink: '#3A2A1E',
  mouth: '#6B2418',
  tongue: '#DE7C78',
  cap: '#2F6B4F',
  capCross: '#FBF6EC',
  scrub: '#8A3B22',
  scrubShade: '#6E2E1A',
  stethoscope: '#3A332B',
  bell: '#D9D0C1',
} as const;

const p = bantayPalette;

const restPose: BantayPose = {
  eyes: 'open',
  lookX: 0,
  lookY: 0,
  browLeft: 0,
  browRight: 0,
  earLeft: 0,
  earRight: 0,
  headTilt: 0,
  headY: 0,
  breath: 0,
  hop: 0,
  squash: 0,
  tail: 0,
  pawRaise: 0,
  mouth: 'smile',
};

/** The resting pose of each expression; animations vary these. */
export const bantayPoses: Record<BantayExpression, BantayPose> = {
  idle: restPose,
  attention: { ...restPose, lookX: 0.7, browLeft: 0.8, browRight: 0.8, earLeft: 14, earRight: 14, headTilt: 8 },
  thinking: {
    ...restPose,
    lookX: -0.6,
    lookY: -1,
    browLeft: -0.3,
    browRight: 1,
    earLeft: 10,
    earRight: -6,
    headTilt: -7,
    pawRaise: 1,
    mouth: 'small',
  },
  celebration: { ...restPose, eyes: 'happy', browLeft: 1, browRight: 1, earLeft: 10, earRight: 10, tail: 10, mouth: 'open' },
};

export interface BantayMascotSvgProps {
  expression?: BantayExpression;
  /** Overrides on top of the expression's resting pose. */
  pose?: Partial<BantayPose>;
  scene?: BantaySceneOverride;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  variant?: BantayVariant;
}

const OUTLINE = 1.3;

function Eye({ cx, cy, pose }: { cx: number; cy: number; pose: BantayPose }) {
  switch (pose.eyes) {
    case 'happy':
      return <Path d={`M ${cx - 5} ${cy + 1.5} Q ${cx} ${cy - 5} ${cx + 5} ${cy + 1.5}`} fill="none" stroke={p.eye} strokeLinecap="round" strokeWidth="2.6" />;
    case 'closed':
      return <Path d={`M ${cx - 4.6} ${cy + 0.5} Q ${cx} ${cy + 3.6} ${cx + 4.6} ${cy + 0.5}`} fill="none" stroke={p.eye} strokeLinecap="round" strokeWidth="2.4" />;
    case 'half': {
      const x = cx + pose.lookX * 1.2;
      return (
        <G>
          <Ellipse cx={x} cy={cy + 1.6} fill={p.eye} rx="4.4" ry="2.6" />
          <Path d={`M ${cx - 5} ${cy - 0.4} Q ${cx} ${cy - 1.6} ${cx + 5} ${cy - 0.4}`} fill="none" stroke={p.eye} strokeLinecap="round" strokeWidth="1.6" />
        </G>
      );
    }
    case 'open': {
      const x = cx + pose.lookX * 1.4;
      const y = cy + pose.lookY * 1.4;
      return (
        <G>
          <Ellipse cx={x} cy={y} fill={p.eye} rx="4.4" ry="5.2" />
          <Circle cx={x - 1.4 + pose.lookX * 0.6} cy={y - 1.9 + pose.lookY * 0.4} fill={p.highlight} r="1.8" />
          <Circle cx={x + 1.6} cy={y + 2} fill={p.highlight} r="0.8" />
        </G>
      );
    }
  }
}

function Mouth({ mouth }: { mouth: BantayMouth }) {
  if (mouth === 'open') {
    return (
      <G>
        <Path d="M 43.5 58.5 Q 50 70 56.5 58.5 Q 50 61 43.5 58.5 Z" fill={p.mouth} stroke={p.ink} strokeLinejoin="round" strokeWidth="1.1" />
        <Path d="M 46.5 63.5 Q 50 67.5 53.5 63.5 Q 50 61.5 46.5 63.5 Z" fill={p.tongue} />
      </G>
    );
  }
  if (mouth === 'small') {
    return <Path d="M 47 59.5 Q 50.5 61.5 53.5 59" fill="none" stroke={p.ink} strokeLinecap="round" strokeWidth="1.5" />;
  }
  return (
    <G>
      <Path d="M 45 58.5 Q 47.5 61.5 50 58.5" fill="none" stroke={p.ink} strokeLinecap="round" strokeWidth="1.5" />
      <Path d="M 50 58.5 Q 52.5 61.5 55 58.5" fill="none" stroke={p.ink} strokeLinecap="round" strokeWidth="1.5" />
    </G>
  );
}

/** Head in bust coordinates (centre 50,48). Tilts about the neck at (50,70). */
function Head({ pose }: { pose: BantayPose }) {
  return (
    <G transform={`rotate(${pose.headTilt} 50 70)`}>
      {/* Ears pivot at their base on the skull */}
      <G transform={`rotate(${pose.earLeft} 31 37)`}>
        <Path d="M 29 42 Q 12 34 19 20 Q 32 22 35 37 Z" fill={p.coat} stroke={p.ink} strokeLinejoin="round" strokeWidth={OUTLINE} />
        <Path d="M 27 39 Q 17 33 21 24 Q 29 26 31 36 Z" fill={p.earInner} />
      </G>
      <G transform={`rotate(${-pose.earRight} 69 37)`}>
        <Path d="M 71 42 Q 88 34 81 20 Q 68 22 65 37 Z" fill={p.coat} stroke={p.ink} strokeLinejoin="round" strokeWidth={OUTLINE} />
        <Path d="M 73 39 Q 83 33 79 24 Q 71 26 69 36 Z" fill={p.earInner} />
      </G>

      <Ellipse cx="50" cy="48" fill={p.coat} rx="27" ry="24" stroke={p.ink} strokeWidth={OUTLINE} />

      {/* Green caregiver cap: the only green in Alaga */}
      <Path d="M 35 30 Q 50 23 65 30 L 62 17.5 Q 50 13.5 38 17.5 Z" fill={p.cap} stroke={p.ink} strokeLinejoin="round" strokeWidth={OUTLINE} />
      <Rect fill={p.capCross} height="7" rx="0.8" width="2.4" x="48.8" y="17.6" />
      <Rect fill={p.capCross} height="2.4" rx="0.8" width="7" x="46.5" y="19.9" />

      <Ellipse cx="50" cy="58" fill={p.muzzle} rx="15" ry="11" />
      <Ellipse cx="31.5" cy="56" fill={p.blush} opacity="0.45" rx="4.4" ry="3" />
      <Ellipse cx="68.5" cy="56" fill={p.blush} opacity="0.45" rx="4.4" ry="3" />

      <Path d="M 35 38 Q 39 35 43 38" fill="none" stroke={p.brow} strokeLinecap="round" strokeWidth="1.8" transform={`translate(0 ${-pose.browLeft * 2})`} />
      <Path d="M 57 38 Q 61 35 65 38" fill="none" stroke={p.brow} strokeLinecap="round" strokeWidth="1.8" transform={`translate(0 ${-pose.browRight * 2})`} />
      <Eye cx={39} cy={46} pose={pose} />
      <Eye cx={61} cy={46} pose={pose} />

      <Path d="M 46 52 Q 50 50 54 52 Q 55 56 50 58 Q 45 56 46 52 Z" fill={p.eye} />
      <Circle cx="48.5" cy="52.6" fill={p.highlight} opacity="0.6" r="1.1" />
      <Mouth mouth={pose.mouth} />
    </G>
  );
}

/** A raised forearm from `from` to the paw at `to`. */
function RaisedPaw({ from, to }: { from: [number, number]; to: [number, number] }) {
  const d = `M ${from[0]} ${from[1]} L ${to[0]} ${to[1]}`;
  return (
    <G>
      <Path d={d} fill="none" stroke={p.ink} strokeLinecap="round" strokeWidth="11.6" />
      <Path d={d} fill="none" stroke={p.coat} strokeLinecap="round" strokeWidth="9" />
      <Ellipse cx={to[0]} cy={to[1]} fill={p.muzzle} rx="5.6" ry="4.4" stroke={p.ink} strokeWidth={OUTLINE} />
      <Path d={`M ${to[0] - 1.8} ${to[1] - 3.6} V ${to[1] - 1.4} M ${to[0] + 1.8} ${to[1] - 3.6} V ${to[1] - 1.4}`} stroke={p.coatShade} strokeLinecap="round" strokeWidth="0.9" />
    </G>
  );
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function Bust({ pose }: { pose: BantayPose }) {
  const b = pose.breath;
  const paw: [number, number] = [mix(70, 58, pose.pawRaise), mix(116, 74, pose.pawRaise)];
  return (
    <G transform={`translate(0 ${-pose.hop * 0.6})`}>
      {/* Shoulders run past the bottom edge so breathing never reveals a gap */}
      <G transform={`translate(50 116) scale(${1 + b * 0.012} ${1 + b * 0.03}) translate(-50 -116)`}>
        <Rect fill={p.coat} height="16" width="22" x="39" y="62" />
        <Path d="M 10 118 Q 12 80 30 72 Q 40 78 50 79 Q 60 78 70 72 Q 88 80 90 118 Z" fill={p.scrub} stroke={p.ink} strokeLinejoin="round" strokeWidth={OUTLINE} />
        <Path d="M 40 74.5 L 50 88 L 60 74.5 Q 50 80 40 74.5 Z" fill={p.coat} stroke={p.ink} strokeLinejoin="round" strokeWidth={OUTLINE} />
        <Path d="M 29 78 Q 50 101 71 78" fill="none" stroke={p.stethoscope} strokeLinecap="round" strokeWidth="2.4" />
        <Circle cx="50" cy="93" fill={p.bell} r="4" stroke={p.ink} strokeWidth="1.1" />
      </G>
      <G transform={`translate(0 ${pose.headY - b * 1.2})`}>
        <Head pose={pose} />
      </G>
      {pose.pawRaise > 0 ? <RaisedPaw from={[74, 122]} to={paw} /> : null}
    </G>
  );
}

function Full({ pose, scene }: { pose: BantayPose; scene?: BantaySceneOverride }) {
  const b = pose.breath;
  const sy = 1 - pose.squash * 0.06;
  const sx = 1 + pose.squash * 0.045;
  const raised = pose.pawRaise > 0;
  const paw: [number, number] = [mix(71, 65, pose.pawRaise), mix(104, 62, pose.pawRaise)];
  return (
    <G transform={`translate(0 ${-pose.hop}) translate(60 112) scale(${sx} ${sy}) translate(-60 -112)`}>
      {!scene?.hideTail && (
        <G transform={`rotate(${pose.tail} 81 90)`}>
          <Path d="M 82 92 Q 106 86 102 64 Q 96 59 93 69 Q 90 84 78 90 Z" fill={p.coat} stroke={p.ink} strokeLinejoin="round" strokeWidth={OUTLINE} />
        </G>
      )}

      <Ellipse cx="36" cy="108" fill={p.coatShade} rx="8.5" ry="4.6" stroke={p.ink} strokeWidth={OUTLINE} />
      <Ellipse cx="84" cy="108" fill={p.coatShade} rx="8.5" ry="4.6" stroke={p.ink} strokeWidth={OUTLINE} />

      <G transform={`translate(60 104) scale(${1 + b * 0.012} ${1 + b * 0.025}) translate(-60 -104)`}>
        <Rect fill={p.coat} height="14" width="20" x="50" y="56" />
        <Path d="M 38 68 Q 30 76 34 102 L 86 102 Q 90 76 82 68 Q 60 74 38 68 Z" fill={p.scrub} stroke={p.ink} strokeLinejoin="round" strokeWidth={OUTLINE} />
        <Path d="M 51 68.5 L 60 80 L 69 68.5 Q 60 72 51 68.5 Z" fill={p.coat} stroke={p.ink} strokeLinejoin="round" strokeWidth={OUTLINE} />
        <Rect fill={p.scrubShade} height="11" rx="2" width="10" x="70" y="84" />
        <Path d="M 45 70 Q 58 92 74 76" fill="none" stroke={p.stethoscope} strokeLinecap="round" strokeWidth="2.2" />
        <Circle cx="74" cy="76" fill={p.bell} r="3.4" stroke={p.ink} strokeWidth="1" />
      </G>

      {!scene?.hideFrontPaws && (
        <G>
          <Path d="M 44 90 L 46 107 Q 50 110 54 107 L 53 90 Z" fill={p.coat} stroke={p.ink} strokeLinejoin="round" strokeWidth={OUTLINE} />
          <Ellipse cx="50" cy="107" fill={p.muzzle} rx="4.6" ry="3" stroke={p.ink} strokeWidth="1" />
          {!raised && (
            <>
              <Path d="M 67 90 L 66 107 Q 70 110 74 107 L 76 90 Z" fill={p.coat} stroke={p.ink} strokeLinejoin="round" strokeWidth={OUTLINE} />
              <Ellipse cx="70" cy="107" fill={p.muzzle} rx="4.6" ry="3" stroke={p.ink} strokeWidth="1" />
            </>
          )}
        </G>
      )}

      <G transform={`translate(60 ${42 + pose.headY - b * 1.1}) scale(0.89) translate(-50 -48)`}>
        <Head pose={pose} />
      </G>

      {raised && !scene?.hideFrontPaws ? <RaisedPaw from={[73, 80]} to={paw} /> : null}
      {scene?.layer}
    </G>
  );
}

/**
 * Bantay, the Alaga caregiver dog: brown Aspin coat, narra scrubs, green caregiver cap.
 * The single source drawing for the in-app sprites, the app icon and the setup scenes.
 */
export function BantayMascotSvg({
  expression = 'idle',
  pose,
  scene,
  size = 64,
  style,
  testID = 'bantay-mascot-svg',
  variant = 'bust',
}: BantayMascotSvgProps) {
  const resolved: BantayPose = { ...bantayPoses[expression], ...pose };
  return (
    <View accessibilityRole="image" style={[{ height: size, width: size }, style]} testID={testID}>
      <Svg height={size} viewBox={variant === 'bust' ? '0 0 100 100' : '0 0 120 120'} width={size}>
        {variant === 'bust' ? <Bust pose={resolved} /> : <Full pose={resolved} scene={scene} />}
      </Svg>
    </View>
  );
}
