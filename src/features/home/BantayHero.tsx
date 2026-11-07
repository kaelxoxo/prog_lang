import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { PressableScale } from '../../components/PressableScale';
import { radii, sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import fullSheet from '../../../assets/bantay/full.json';
import { AssistantMascot } from '../assistant/AssistantMascot';
import { useLocale } from '../settings/LocaleProvider';
import { heroCopy, type HomeHero } from './careInsights';
import { formatTime } from './HomeSections';

/** One full play of Bantay's celebrate animation; after it he settles back to idle. */
const CELEBRATE_MS = fullSheet.animations.celebrate.frames.reduce((total, frame) => total + frame.duration, 0);

const BANTAY_SIZE = 104;
const LARGE_TEXT_BANTAY_SIZE = 72;
const TAIL = 12;

type Props = {
  hero: HomeHero;
  /** Bantay's greeting to the signed-in caregiver, e.g. "Good evening, Maya!". */
  welcome: string;
  /** The Patient's display name; ignored for a Self Profile. */
  patientName: string;
  isSelf: boolean;
  onOpenAssistant: () => void;
};

/**
 * Bantay greets the caregiver in a speech bubble: the greeting plus one short line about the active Patient's day.
 * The chat box below makes it clear he can be talked to. Remount per Patient (`key`) so he celebrates once for
 * each person whose day is done.
 */
export function BantayHero({ hero, isSelf, onOpenAssistant, patientName, welcome }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  const { fontScale } = useWindowDimensions();
  const [celebrated, setCelebrated] = useState(false);
  const celebrating = hero.kind === 'allRecorded';

  useEffect(() => {
    if (!celebrating) {
      setCelebrated(false);
      return;
    }
    const timer = setTimeout(() => setCelebrated(true), CELEBRATE_MS);
    return () => clearTimeout(timer);
  }, [celebrating]);

  const { line, emphasis } = heroCopy(hero, {
    t,
    formatTime: (iso) => formatTime(iso, localeTag),
    patient: patientName,
    isSelf,
  });
  const emphasisAt = emphasis ? line.indexOf(emphasis) : -1;
  const lineText =
    emphasis && emphasisAt >= 0 ? (
      <>
        {line.slice(0, emphasisAt)}
        <Text style={styles.emphasis}>{emphasis}</Text>
        {line.slice(emphasisAt + emphasis.length)}
      </>
    ) : (
      line
    );

  return (
    <View style={styles.hero}>
      <View style={styles.speakerRow}>
        <AssistantMascot
          accessible={false}
          expression={celebrated ? 'idle' : hero.expression}
          onPress={onOpenAssistant}
          size={fontScale > 1.3 ? LARGE_TEXT_BANTAY_SIZE : BANTAY_SIZE}
          variant="full"
        />
        {/* Bantay's speech: the tail points at him, so the words read as his. */}
        <View accessibilityLabel={`${welcome} ${line}`} accessible style={styles.bubble}>
          <View style={styles.tail} />
          <Text accessibilityRole="header" style={styles.greeting}>
            {welcome}
          </Text>
          <Text style={styles.line}>{lineText}</Text>
        </View>
      </View>

      <PressableScale
        accessibilityHint={t('home.heroAskHint')}
        accessibilityLabel={isSelf ? t('home.heroAskSelfA11y') : t('home.heroAskA11y', { patient: patientName })}
        accessibilityRole="button"
        onPress={onOpenAssistant}
        style={styles.chatBox}
        targetScale={0.98}
      >
        <AppIcon color={colors.muted} name="message-circle" size={18} />
        <Text numberOfLines={1} style={styles.chatBoxLabel}>
          {t('home.heroAsk')}
        </Text>
      </PressableScale>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    hero: {
      gap: spacing.md,
    },
    speakerRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm + TAIL / 2,
    },
    bubble: {
      flex: 1,
      gap: spacing.xs,
      padding: spacing.md,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
    },
    // A square turned 45° and half-hidden behind the bubble's left edge, bordered on its outer two sides.
    tail: {
      position: 'absolute',
      left: -TAIL / 2 - 1,
      bottom: spacing.lg,
      width: TAIL,
      height: TAIL,
      backgroundColor: colors.surface,
      borderLeftWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.line,
      transform: [{ rotate: '45deg' }],
    },
    greeting: {
      ...sectionTitle,
      color: colors.ink,
    },
    line: {
      ...typography.body,
      color: colors.ink,
    },
    emphasis: {
      color: colors.primary,
      fontWeight: '700',
    },
    chatBox: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.controlBorder,
      borderRadius: radii.full,
      backgroundColor: colors.surface,
    },
    chatBoxLabel: {
      ...typography.body,
      color: colors.muted,
      flex: 1,
    },
  });
