import React, { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { colors, durations, springs } from '../../theme/tokens';
import { BantayMascotSvg, type BantayExpression } from './BantayMascotSvg';

export type SetupBantayPose =
  | 'letter'
  | 'self'
  | 'family'
  | 'professional'
  | 'waiting'
  | 'writing'
  | 'sending'
  | 'stamp';

type Props = {
  pose: SetupBantayPose;
  size?: number;
  compact?: boolean;
  reactionKey?: number;
  accessibilityLabel: string;
};

const coat = '#D9944D';
const coatDark = '#C77C36';
const muzzle = '#FDF5EB';
const eye = '#2D1C10';
const outline = colors.primary;
const mint = colors.primaryTint;
const ochre = colors.sun;
const ease = Easing.bezier(0.23, 1, 0.32, 1);

const faces: Record<SetupBantayPose, BantayExpression> = {
  letter: 'idle', self: 'idle', family: 'idle', professional: 'idle',
  waiting: 'thinking', writing: 'idle', sending: 'idle', stamp: 'celebration',
};

/** Pose arms drawn in the canonical 120×120 Bantay space; paws sit over the separate prop layers. */
const PoseArms = memo(function PoseArms({ pose }: { pose: SetupBantayPose }) {
  const family = pose === 'family';
  const salute = pose === 'professional';
  const chest = pose === 'self';
  return (
    <G>
      <Path
        d={family ? 'M40 74 Q33 67 39 62 L46 68 Q44 74 48 80 Z' : chest ? 'M41 73 Q43 83 56 81 L57 86 Q37 91 35 76 Z' : 'M40 74 Q38 86 47 94 L52 89 Q47 81 48 74 Z'}
        fill={coat}
      />
      <Ellipse cx={family ? 41 : chest ? 56 : 49} cy={family ? 64 : chest ? 82 : 91} rx="5" ry="4" fill={muzzle} />
      <Path
        d={salute ? 'M79 73 Q88 61 77 25 L71 30 Q80 60 69 76 Z' : family ? 'M80 74 Q87 67 81 62 L74 68 Q76 74 72 80 Z' : 'M80 74 Q85 86 75 94 L69 89 Q76 80 72 74 Z'}
        fill={coat}
      />
      <Ellipse cx={salute ? 76 : family ? 79 : 72} cy={salute ? 27 : family ? 64 : 91} rx="5" ry="4" fill={muzzle} />
    </G>
  );
});

/** The canonical Bantay drawing, with this scene's arms instead of the resting paws. `waiting` keeps its resting paws and swaps in the animated tail. */
const Dog = memo(function Dog({ pose, size }: { pose: SetupBantayPose; size: number }) {
  const waiting = pose === 'waiting';
  return (
    <BantayMascotSvg
      variant="full"
      size={size}
      expression={faces[pose]}
      pose={{ hideFrontPaws: !waiting, hideTail: waiting, layer: waiting ? undefined : <PoseArms pose={pose} /> }}
    />
  );
});

const Prop = memo(function Prop({ pose }: { pose: SetupBantayPose }) {
  switch (pose) {
    case 'letter':
      return <Svg width="100%" height="100%" viewBox="0 0 36 27"><Rect x="2" y="4" width="32" height="21" rx="3" fill={colors.white} stroke={outline} strokeWidth="1.5" /><Path d="M3 7 L18 18 L33 7" fill="none" stroke={colors.secondary} strokeWidth="1.5" /></Svg>;
    case 'self':
      return <Svg width="100%" height="100%" viewBox="0 0 40 23"><Rect x="1" y="2" width="38" height="19" rx="4" fill={mint} stroke={outline} strokeWidth="1.5" />{[0, 1, 2, 3, 4, 5, 6].map((i) => <G key={i}><Path d={`M${6 + i * 5} 3 V20`} stroke={colors.primaryBorder} strokeWidth="1" /><Circle cx={8 + i * 5} cy="11" r="1" fill={ochre} /></G>)}</Svg>;
    case 'family':
      return <Svg width="100%" height="100%" viewBox="0 0 37 39"><Path d="M3 16 L18 2 L34 16 V35 H3 Z" fill={mint} stroke={outline} strokeWidth="2" strokeLinejoin="round" /><Path d="M18 30 C12 25 8 22 10 18 C12 15 16 16 18 19 C21 15 26 15 28 19 C30 23 25 27 18 30 Z" fill={ochre} /></Svg>;
    case 'professional':
      return <Svg width="100%" height="100%" viewBox="0 0 30 42"><Rect x="3" y="3" width="24" height="37" rx="3" fill={mint} stroke={outline} strokeWidth="2" /><Rect x="10" y="1" width="10" height="4" rx="2" fill={colors.secondary} /><Path d="M8 13 H22 M8 19 H22 M8 25 H18" stroke={colors.secondary} strokeWidth="1.5" strokeLinecap="round" /></Svg>;
    case 'waiting':
      return <Svg width="100%" height="100%" viewBox="0 0 39 48"><Path d="M4 19 Q4 4 19 4 Q35 4 35 19 V32 H4 Z" fill={mint} stroke={outline} strokeWidth="2" /><Path d="M9 16 H30 M19 33 V46 M10 46 H28" stroke={outline} strokeWidth="2" strokeLinecap="round" /><Path d="M34 21 H38 V12" fill="none" stroke={ochre} strokeWidth="2.5" strokeLinecap="round" /></Svg>;
    case 'writing':
      return <Svg width="100%" height="100%" viewBox="0 0 38 30"><Rect x="3" y="2" width="32" height="26" rx="2" fill={colors.white} stroke={outline} strokeWidth="1.6" /><Path d="M10 2 V28 M14 10 H28 M14 16 H27 M14 22 H23" fill="none" stroke={colors.primaryBorder} strokeWidth="1.4" /></Svg>;
    case 'stamp':
      return <Svg width="100%" height="100%" viewBox="0 0 39 48"><Rect x="3" y="2" width="32" height="44" rx="2" fill={colors.white} stroke={outline} strokeWidth="1.6" /><Path d="M10 11 H28 M10 18 H28 M10 25 H28 M10 35 H28" stroke={colors.primaryBorder} strokeWidth="1.6" strokeLinecap="round" /><Path d="M8 32 L11 35 L16 29" fill="none" stroke={colors.secondary} strokeWidth="2" strokeLinecap="round" /></Svg>;
    case 'sending':
      return null;
  }
});

const EnvelopeFlap = memo(function EnvelopeFlap() {
  return <Svg width="100%" height="100%" viewBox="0 0 32 13"><Path d="M1 11 L16 1 L31 11" fill={mint} stroke={outline} strokeWidth="1.4" strokeLinejoin="round" /></Svg>;
});
const Heart = memo(function Heart() {
  return <Svg width="100%" height="100%" viewBox="0 0 18 17"><Path d="M9 16 C3 11 0 8 2 4 C4 1 8 2 9 5 C11 1 16 1 17 5 C18 9 14 12 9 16 Z" fill={ochre} /></Svg>;
});
const Tail = memo(function Tail() {
  return <Svg width="100%" height="100%" viewBox="0 0 30 33"><Path d="M0 28 Q26 26 23 4 Q18 1 16 11 Q15 24 0 28 Z" fill={coatDark} /></Svg>;
});
const Pen = memo(function Pen() {
  return <Svg width="100%" height="100%" viewBox="0 0 22 26"><Path d="M3 23 L18 3 L21 6 L6 25 Z" fill={ochre} stroke={outline} strokeWidth="1.3" /><Path d="M3 23 L6 25" stroke={eye} strokeWidth="2" /></Svg>;
});
const Plane = memo(function Plane() {
  return <Svg width="100%" height="100%" viewBox="0 0 28 22"><Path d="M2 10 L26 2 L16 20 L12 13 Z" fill={colors.white} stroke={outline} strokeWidth="1.5" strokeLinejoin="round" /><Path d="M12 13 L26 2" stroke={colors.primaryBorder} strokeWidth="1.3" /></Svg>;
});
const Stamp = memo(function Stamp() {
  return <Svg width="100%" height="100%" viewBox="0 0 25 27"><Rect x="9" y="2" width="8" height="13" rx="3" fill={ochre} /><Rect x="3" y="14" width="20" height="9" rx="3" fill={outline} /><Path d="M5 23 H21" stroke={colors.primaryDark} strokeWidth="3" /></Svg>;
});
const PawMark = memo(function PawMark() {
  return <Svg width="100%" height="100%" viewBox="0 0 20 20"><Ellipse cx="10" cy="13" rx="5" ry="3.5" fill={colors.secondary} /><Circle cx="4" cy="7" r="1.6" fill={colors.secondary} /><Circle cx="8" cy="5" r="1.6" fill={colors.secondary} /><Circle cx="13" cy="5" r="1.6" fill={colors.secondary} /><Circle cx="17" cy="7" r="1.6" fill={colors.secondary} /></Svg>;
});

type Placement = { x: number; y: number; width: number; height: number };
const placements: Record<SetupBantayPose, Placement> = {
  letter: { x: 47, y: 73, width: 32, height: 25 },
  self: { x: 71, y: 72, width: 38, height: 23 },
  family: { x: 43, y: 58, width: 35, height: 37 },
  professional: { x: 25, y: 70, width: 28, height: 40 },
  waiting: { x: 106, y: 62, width: 37, height: 46 },
  writing: { x: 52, y: 74, width: 36, height: 29 },
  sending: { x: 74, y: 61, width: 26, height: 22 },
  stamp: { x: 73, y: 66, width: 38, height: 47 },
};

function PoseScene({ pose, size, compact, reactionKey, reduceMotion }: Omit<Props, 'accessibilityLabel'> & { size: number; compact: boolean; reduceMotion: boolean }) {
  const unit = size / 120;
  const offsetY = compact ? 10 : 0;
  const prop = placements[pose];
  const enter = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const detail = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const loop = useRef(new Animated.Value(0)).current;
  const reaction = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const reload = useRef(new Animated.Value(1)).current;
  const previousReaction = useRef(reactionKey);
  const wasReduced = useRef(reduceMotion);
  const box = (placement: Placement) => ({ position: 'absolute' as const, left: placement.x * unit, top: (placement.y - offsetY - (compact ? 10 : 0)) * unit, width: placement.width * unit, height: placement.height * unit });

  useEffect(() => {
    enter.stopAnimation();
    detail.stopAnimation();
    loop.stopAnimation();
    if (reduceMotion) {
      enter.setValue(1);
      detail.setValue(1);
      loop.setValue(0);
      return;
    }
    enter.setValue(0);
    detail.setValue(0);
    const entrance = Animated.parallel([
      Animated.spring(enter, { toValue: 1, ...springs.snappySpring, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(65),
        Animated.timing(detail, { toValue: 1, duration: durations.stateChange, easing: ease, useNativeDriver: true }),
      ]),
    ]);
    entrance.start(({ finished }) => {
      if (!finished) return;
      // The loops are ambient and intentionally don't lift/float the dog.
      const loopAnimation = Animated.loop(Animated.sequence([
        Animated.timing(loop, { toValue: 1, duration: pose === 'waiting' ? 1200 : 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(loop, { toValue: 0, duration: pose === 'waiting' ? 1200 : 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      loopAnimation.start();
    });
    return () => { entrance.stop(); loop.stopAnimation(); };
  }, [pose, reduceMotion, enter, detail, loop]);

  useEffect(() => {
    if (pose !== 'writing' && pose !== 'sending') return;
    const motionChanged = wasReduced.current !== reduceMotion;
    wasReduced.current = reduceMotion;
    if (reduceMotion) {
      reaction.stopAnimation();
      reaction.setValue(1);
      previousReaction.current = reactionKey;
      return;
    }
    if (motionChanged) {
      reaction.setValue(0);
      return;
    }
    if (previousReaction.current === reactionKey) return;
    previousReaction.current = reactionKey;
    if (reactionKey === undefined) return;
    reaction.stopAnimation();
    reaction.setValue(0);
    reload.setValue(1);
    const action = Animated.timing(reaction, { toValue: 1, duration: durations.stateChange, easing: ease, useNativeDriver: true });
    action.start(({ finished }) => {
      if (!finished || pose !== 'sending') return;
      // A fresh plane fades into the paw, ready for the next invitation.
      reload.setValue(0);
      reaction.setValue(0);
      Animated.timing(reload, { toValue: 1, duration: durations.feedback, easing: ease, useNativeDriver: true }).start();
    });
    return () => action.stop();
  }, [reactionKey, pose, reduceMotion, reaction, reload]);

  const enterScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });
  const detailY = detail.interpolate({ inputRange: [0, 1], outputRange: [pose === 'stamp' ? -10 * unit : 7 * unit, 0] });
  const letterHeartY = detail.interpolate({ inputRange: [0, 1], outputRange: [4 * unit, -26 * unit] });
  const sway = loop.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '4deg'] });
  const gentleTilt = loop.interpolate({ inputRange: [0, 1], outputRange: ['-2deg', '2deg'] });
  const peek = loop.interpolate({ inputRange: [0, 1], outputRange: [0, 2 * unit] });
  const penX = reaction.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 5 * unit, 0] });
  const penY = reaction.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 2 * unit, 0] });
  const planeX = reaction.interpolate({ inputRange: [0, 1], outputRange: [0, 46 * unit] });
  const planeY = reaction.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -19 * unit, -31 * unit] });
  const planeOpacity = reaction.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, reduceMotion ? 1 : 0] });
  const markOpacity = detail.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0, 0, 1] });

  return (
    <View style={{ width: size * 1.25, height: size * (compact ? 88 / 120 : 1), overflow: 'hidden' }}>
      {pose === 'waiting' && !compact && <Animated.View style={[box({ x: 79, y: 62, width: 29, height: 33 }), { transform: [{ rotate: sway }] }]}><Tail /></Animated.View>}
      <Animated.View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: size * 1.25, height: size, top: -offsetY * unit, transform: [{ translateX: pose === 'waiting' ? peek : 0 }, { scale: enterScale }] }}><Dog pose={pose} size={size} /></Animated.View>
      {pose === 'letter' && <Animated.View style={[box({ x: 84, y: 74, width: 14, height: 14 }), { opacity: detail, transform: [{ translateY: letterHeartY }, { rotate: gentleTilt }] }]}><Heart /></Animated.View>}
      {pose !== 'sending' && <Animated.View style={[box(prop), { opacity: enter, transform: [{ translateY: detailY }, { scale: enter.interpolate({ inputRange: [0, 1], outputRange: compact ? [0.78, 0.85] : [0.92, 1] }) }, { rotate: pose === 'waiting' ? '0deg' : gentleTilt }] }]}><Prop pose={pose} /></Animated.View>}
      {pose === 'letter' && <Animated.View style={[box({ x: 48, y: 75, width: 30, height: 12 }), { transform: [{ rotateX: detail.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '65deg'] }) }] }]}><EnvelopeFlap /></Animated.View>}
      {pose === 'writing' && <Animated.View style={[box({ x: 69, y: 76, width: 20, height: 24 }), { transform: [{ translateX: penX }, { translateY: penY }, { rotate: gentleTilt }] }]}><Pen /></Animated.View>}
      {pose === 'sending' && <Animated.View style={[box(prop), { transform: [{ rotate: gentleTilt }] }]}><Animated.View style={{ width: '100%', height: '100%', opacity: Animated.multiply(Animated.multiply(enter, planeOpacity), reload), transform: [{ translateX: planeX }, { translateY: planeY }, { rotate: reaction.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '20deg'] }) }, { scale: enterScale }] }}><Plane /></Animated.View></Animated.View>}
      {pose === 'stamp' && <>
        <Animated.View style={[box({ x: 82, y: 85, width: 18, height: 18 }), { opacity: markOpacity }]}><PawMark /></Animated.View>
        <Animated.View style={[box({ x: 78, y: 58, width: 24, height: 26 }), { transform: [{ translateY: detailY }, { rotate: gentleTilt }] }]}><Stamp /></Animated.View>
      </>}
    </View>
  );
}

export function SetupBantay({ pose, size = 160, compact = false, reactionKey, accessibilityLabel }: Props): React.JSX.Element {
  const [reduced, setReduced] = useState(true);
  const [shownPose, setShownPose] = useState(pose);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReduced(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  // One effect owns the crossfade. Two competing effects let a reduce-motion update cancel the fade-out and strand the old pose.
  useEffect(() => {
    const duration = reduced ? durations.feedback / 2 : durations.stateChange / 2;
    if (pose === shownPose) {
      const settle = Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true });
      settle.start();
      return () => settle.stop();
    }
    const fadeOut = Animated.timing(opacity, { toValue: 0, duration, useNativeDriver: true });
    fadeOut.start(({ finished }) => { if (finished) setShownPose(pose); });
    return () => fadeOut.stop();
  }, [pose, shownPose, reduced, opacity]);

  return (
    <View accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ width: size * 1.25, height: size * (compact ? 88 / 120 : 1) }}>
      <Animated.View style={{ opacity }}><PoseScene key={shownPose} pose={shownPose} size={size} compact={compact} reactionKey={reactionKey} reduceMotion={reduced} /></Animated.View>
    </View>
  );
}
