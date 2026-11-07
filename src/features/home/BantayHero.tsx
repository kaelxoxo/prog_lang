import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppIcon } from '../../components/AppIcon';
import { PressableScale } from '../../components/PressableScale';
import { reflow } from '../../lib/motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { radii, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import fullSheet from '../../../assets/bantay/full.json';
import { AssistantMascot } from '../assistant/AssistantMascot';
import { useLocale } from '../settings/LocaleProvider';
import { heroCopy, type HomeHero } from './careInsights';
import { formatTime } from './HomeSections';

/** One full play of Bantay's celebrate animation; after it he settles back to idle. */
const CELEBRATE_MS = fullSheet.animations.celebrate.frames.reduce((total, frame) => total + frame.duration, 0);

const BANTAY_SIZE = 120;
const COMPACT_BANTAY_SIZE = 88;
const LARGE_TEXT_BANTAY_SIZE = 80;
/** Bantay stands this far past the box's left and bottom edges. */
const BANTAY_OVERHANG = spacing.sm;
/** The narra margin line, and where text starts to its right. */
const MARGIN_LINE_X = 20;
const CONTENT_X = 36;

type Props = {
  hero: HomeHero;
  /** Bantay's welcome to the signed-in caregiver, e.g. "Good afternoon, Maya!". */
  welcome: string;
  /** The Patient's display name; ignored for a Self Profile. */
  patientName: string;
  isSelf: boolean;
  onOpenAssistant: () => void;
};

/**
 * Home's "notebook margin" hero: Bantay welcomes the caregiver, says the day's most urgent fact for the active
 * Patient, and offers the chat box. Shrinks once everything is recorded: the box, its contents and Bantay glide to
 * their compact frames over 200 ms (strong ease-out, UI thread); with reduced motion they snap.
 * Remount it per Patient (`key`) so Bantay celebrates once for each person whose day is done.
 */
export function BantayHero({ hero, isSelf, onOpenAssistant, patientName, welcome }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  const { fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const largeText = fontScale > 1.3;
  const compact = hero.kind === 'allRecorded';
  const [celebrated, setCelebrated] = useState(false);
  const layout = reducedMotion ? undefined : reflow;

  useEffect(() => {
    if (!compact) {
      setCelebrated(false);
      return;
    }
    const timer = setTimeout(() => setCelebrated(true), CELEBRATE_MS);
    return () => clearTimeout(timer);
  }, [compact]);

  const copy = heroCopy(hero, {
    t,
    formatTime: (iso) => formatTime(iso, localeTag),
    patient: patientName,
    isSelf,
  });
  const emphasisAt = copy.title.indexOf(copy.emphasis);
  const [before, after] =
    emphasisAt < 0 ? [copy.title, ''] : [copy.title.slice(0, emphasisAt), copy.title.slice(emphasisAt + copy.emphasis.length)];
  const bantaySize = largeText ? LARGE_TEXT_BANTAY_SIZE : compact ? COMPACT_BANTAY_SIZE : BANTAY_SIZE;
  // Room left of the chat box for Bantay when he stands inside the box.
  const besideBantay = largeText ? null : { marginLeft: bantaySize - BANTAY_OVERHANG + spacing.sm - CONTENT_X };

  const bantay = (
    <Animated.View layout={layout} style={largeText ? styles.bantayAbove : styles.bantayStanding}>
      <AssistantMascot
        accessible={false}
        expression={celebrated ? 'idle' : hero.expression}
        onPress={onOpenAssistant}
        size={bantaySize}
        variant="full"
      />
    </Animated.View>
  );

  return (
    <Animated.View layout={layout} style={[styles.hero, !largeText && styles.heroWithOverhang]}>
      {largeText ? bantay : null}
      <Animated.View
        layout={layout}
        style={[styles.box, compact && styles.boxCompact, !largeText && { minHeight: bantaySize - BANTAY_OVERHANG }]}
      >
        {/* The margin line ends where Bantay's head begins, so he stands at the foot of the margin. */}
        <Animated.View layout={layout} style={[styles.marginLine, !largeText && { bottom: bantaySize - BANTAY_OVERHANG }]} />
        <Animated.Text accessibilityRole="header" layout={layout} style={styles.welcome}>
          {welcome}
        </Animated.Text>
        <Animated.View
          accessibilityLabel={[copy.title, copy.detail].join('. ')}
          accessible
          layout={layout}
          style={styles.summary}
        >
          <Text style={styles.status}>
            {before}
            <Text style={styles.emphasis}>{copy.emphasis}</Text>
            {after}
          </Text>
          <Text style={styles.detail}>{copy.detail}</Text>
        </Animated.View>
        {/* Everything beside Bantay sits in one column at least as tall as the part of him inside the box,
            so he never stands in front of text. */}
        <Animated.View
          layout={layout}
          style={[styles.besideColumn, besideBantay, !largeText && { minHeight: bantaySize - BANTAY_OVERHANG - spacing.md }]}
        >
          {copy.progress ? <Text style={styles.progress}>{copy.progress}</Text> : null}
          <PressableScale
            accessibilityHint={t('home.heroAskHint')}
            accessibilityLabel={isSelf ? t('home.heroAskSelfA11y') : t('home.heroAskA11y', { patient: patientName })}
            accessibilityRole="button"
            onPress={onOpenAssistant}
            style={styles.chatBox}
            targetScale={0.98}
          >
            <AppIcon color={colors.muted} name="message-circle" size={18} />
            <Text numberOfLines={2} style={styles.chatBoxLabel}>
              {copy.ask}
            </Text>
          </PressableScale>
        </Animated.View>
      </Animated.View>
      {largeText ? null : bantay}
    </Animated.View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    hero: {
      gap: spacing.xs,
    },
    heroWithOverhang: {
      paddingBottom: BANTAY_OVERHANG,
    },
    box: {
      gap: spacing.md,
      paddingTop: spacing.md,
      paddingRight: spacing.md,
      paddingBottom: spacing.md,
      paddingLeft: CONTENT_X,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    boxCompact: {
      gap: spacing.sm,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
    },
    marginLine: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: MARGIN_LINE_X,
      width: 2,
      backgroundColor: colors.primary,
    },
    welcome: {
      ...typography.title1,
      color: colors.ink,
    },
    summary: {
      gap: 2,
    },
    besideColumn: {
      justifyContent: 'flex-end',
      gap: spacing.sm,
    },
    status: {
      ...typography.headline,
      color: colors.ink,
    },
    emphasis: {
      color: colors.primary,
    },
    detail: {
      ...typography.body,
      color: colors.ink,
    },
    progress: {
      ...typography.caption,
      color: colors.muted,
    },
    chatBox: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderWidth: 1,
      borderColor: colors.controlBorder,
      borderRadius: radii.lg,
      backgroundColor: colors.canvas,
    },
    chatBoxLabel: {
      ...typography.body,
      color: colors.muted,
      flex: 1,
    },
    bantayStanding: {
      position: 'absolute',
      left: -BANTAY_OVERHANG,
      bottom: 0,
    },
    bantayAbove: {
      alignSelf: 'flex-start',
    },
  });
