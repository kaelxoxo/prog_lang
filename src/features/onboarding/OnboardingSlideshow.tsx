import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { PressableScale } from '../../components/PressableScale';
import { radii, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';
import type { CopyKey } from '../settings/translations';
import { OnboardingMascotStage } from './OnboardingMascotStage';

type Props = {
  onComplete: () => void;
};

type SlideData = {
  id: string;
  tag: string;
  titleKey: CopyKey;
  defaultTitle: string;
  descKey: CopyKey;
  defaultDesc: string;
  accentKey: 'sun' | 'success' | 'primary';
};

const SLIDES: SlideData[] = [
  {
    id: 'slide-0',
    tag: 'Meet Bantay',
    titleKey: 'onboarding.slide1Title',
    defaultTitle: 'Your gentle care companion',
    descKey: 'onboarding.slide1Desc',
    defaultDesc:
      'A warm, faithful friend here to help you and your family manage daily medicines with calm reassurance and complete peace of mind.',
    accentKey: 'sun',
  },
  {
    id: 'slide-1',
    tag: 'Gentle Medicine Care',
    titleKey: 'onboarding.slide2Title',
    defaultTitle: 'Clear schedules with zero confusion',
    descKey: 'onboarding.slide2Desc',
    defaultDesc:
      'Keep track of exact doses, meal timings, and thoughtful reminders. Designed to feel supportive, simple, and never alarmist.',
    accentKey: 'success',
  },
  {
    id: 'slide-2',
    tag: 'Shared Care Circle',
    titleKey: 'onboarding.slide3Title',
    defaultTitle: 'Cared for together, 100% private',
    descKey: 'onboarding.slide3Desc',
    defaultDesc:
      'Coordinate with family caregivers in one shared circle. All your health data remains strictly encrypted on your device.',
    accentKey: 'primary',
  },
];

export function OnboardingSlideshow({ onComplete }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const { width: windowWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<SlideData>>(null);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const nextIndex = Math.round(offsetX / windowWidth);
    if (nextIndex >= 0 && nextIndex < SLIDES.length && nextIndex !== activeIndex) {
      setActiveIndex(nextIndex);
    }
  };

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      const next = activeIndex + 1;
      flatListRef.current?.scrollToIndex({ animated: true, index: next });
      setActiveIndex(next);
    } else {
      onComplete();
    }
  };

  useEffect(() => {
    // Back steps to the previous slide; on the first slide it leaves the story like Skip, never trapping the user.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeIndex === 0) {
        onComplete();
        return true;
      }
      const previous = activeIndex - 1;
      flatListRef.current?.scrollToIndex({ animated: true, index: previous });
      setActiveIndex(previous);
      return true;
    });
    return () => subscription.remove();
  }, [activeIndex, onComplete]);

  const isLastSlide = activeIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      {/* Sleek Segmented Story Progress Bars (Top) */}
      <View
        accessibilityLabel={`Step ${activeIndex + 1} of ${SLIDES.length}`}
        accessibilityRole="progressbar"
        style={styles.storyBarsContainer}
      >
        {SLIDES.map((slide, idx) => (
          <View key={slide.id} style={styles.storyBarTrack}>
            <View style={[styles.storyBarFill, idx <= activeIndex && styles.storyBarFilled]} />
          </View>
        ))}
      </View>

      {/* Accessible Header with Brand and Skip */}
      <View style={styles.header}>
        <Text style={styles.brandTitle}>Alaga</Text>

        <Pressable
          accessibilityHint="Skips the welcome introduction and goes directly to account setup"
          accessibilityLabel={t('onboarding.skip')}
          accessibilityRole="button"
          hitSlop={12}
          onPress={onComplete}
          style={({ pressed }) => [styles.skipButton, pressed && styles.skipPressed]}
        >
          <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
          <AppIcon color={colors.muted} name="chevron-right" size={16} />
        </Pressable>
      </View>

      {/* Paging Content: Full-Bleed Minimalist Editorial Layout */}
      <FlatList
        bounces={false}
        data={SLIDES}
        decelerationRate="fast"
        horizontal
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={handleScroll}
        pagingEnabled
        ref={flatListRef}
        renderItem={({ item, index }) => {
          const slideTitle = t(item.titleKey) || item.defaultTitle;
          const slideDesc = t(item.descKey) || item.defaultDesc;
          return (
            <View style={[styles.slide, { width: windowWidth }]}>
              {/* Mascot Animated Stage: Open Crisp Canvas with Contact Shadow */}
              <View style={styles.stageWrapper}>
                <OnboardingMascotStage size={220} slideIndex={index} />
              </View>

              {/* Direct Canvas Typography: No Cards, No Bubbles */}
              <View style={styles.textBlock}>
                <Text style={styles.categoryEyebrow}>
                  {item.tag}
                </Text>

                <Text accessibilityRole="header" style={styles.slideTitle}>
                  {slideTitle}
                </Text>

                <Text style={styles.slideDescription}>{slideDesc}</Text>
              </View>
            </View>
          );
        }}
        showsHorizontalScrollIndicator={false}
        style={styles.flatList}
      />

      {/* Docked Bottom Action Bar */}
      <View style={styles.footer}>
        <PressableScale
          accessibilityLabel={
            isLastSlide
              ? t('onboarding.getStarted')
              : t('onboarding.next')
          }
          accessibilityRole="button"
          onPress={handleNext}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            {isLastSlide ? t('onboarding.getStarted') : t('onboarding.next')}
          </Text>
          <AppIcon
            color={colors.white}
            name={isLastSlide ? 'check' : 'arrow-right'}
            size={18}
          />
        </PressableScale>
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.canvas,
      flex: 1,
      justifyContent: 'space-between',
    },
    storyBarsContainer: {
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
    },
    storyBarTrack: {
      backgroundColor: colors.line,
      borderRadius: 2,
      flex: 1,
      height: 3,
      overflow: 'hidden',
    },
    storyBarFill: {
      backgroundColor: 'transparent',
      borderRadius: 2,
      height: '100%',
      width: '0%',
    },
    storyBarFilled: {
      backgroundColor: colors.primary,
      width: '100%',
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      zIndex: 10,
    },
    brandTitle: {
      ...typography.hero,
      fontSize: 22,
      lineHeight: 28,
      color: colors.ink,
    },
    skipButton: {
      alignItems: 'center',
      borderRadius: radii.full,
      flexDirection: 'row',
      gap: 2,
      justifyContent: 'center',
      minHeight: 48,
      minWidth: 48,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    skipPressed: {
      opacity: 0.6,
    },
    skipText: {
      ...typography.bodyEmphasis,
      fontSize: 14,
      color: colors.muted,
    },
    flatList: {
      flex: 1,
    },
    slide: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    stageWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
      width: '100%',
    },
    textBlock: {
      alignItems: 'center',
      maxWidth: 360,
      paddingHorizontal: spacing.md,
      width: '100%',
    },
    categoryEyebrow: {
      ...typography.caption,
      color: colors.muted,
      marginBottom: spacing.xs,
    },
    slideTitle: {
      ...typography.title1,
      color: colors.ink,
      marginBottom: spacing.sm,
      textAlign: 'center',
    },
    slideDescription: {
      ...typography.body,
      color: colors.muted,
      lineHeight: 23,
      textAlign: 'center',
    },
    footer: {
      alignItems: 'center',
      paddingBottom: spacing.lg,
      paddingHorizontal: spacing.lg,
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      flexDirection: 'row',
      gap: spacing.xs,
      justifyContent: 'center',
      minHeight: 52,
      width: '100%',
    },
    primaryButtonText: {
      ...typography.headline,
      color: colors.white,
    },
  });
