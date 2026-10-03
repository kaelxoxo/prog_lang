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
import { radii, spacing, type AppColors } from '../../theme/tokens';
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
        {SLIDES.map((slide, idx) => {
          const isPassed = idx < activeIndex;
          const isActive = idx === activeIndex;
          const barColor =
            activeIndex === 0
              ? colors.sun
              : activeIndex === 1
                ? colors.success
                : colors.primary;

          return (
            <View key={slide.id} style={styles.storyBarTrack}>
              <View
                style={[
                  styles.storyBarFill,
                  (isPassed || isActive) && {
                    backgroundColor: isPassed ? colors.primaryDark : barColor,
                    width: '100%',
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      {/* Accessible Header with Brand and Skip */}
      <View style={styles.header}>
        <View style={styles.brandGroup}>
          <View style={styles.brandDot} />
          <Text style={styles.brandTitle}>Alaga</Text>
        </View>

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
          const accentColor =
            index === 0
              ? colors.sun
              : index === 1
                ? colors.successDark
                : colors.primary;

          return (
            <View style={[styles.slide, { width: windowWidth }]}>
              {/* Mascot Animated Stage: Open Crisp Canvas with Contact Shadow */}
              <View style={styles.stageWrapper}>
                <OnboardingMascotStage size={220} slideIndex={index} />
              </View>

              {/* Direct Canvas Typography: No Cards, No Bubbles */}
              <View style={styles.textBlock}>
                <Text style={[styles.categoryEyebrow, { color: accentColor }]}>
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
        <Pressable
          accessibilityLabel={
            isLastSlide
              ? t('onboarding.getStarted')
              : t('onboarding.next')
          }
          accessibilityRole="button"
          onPress={handleNext}
          style={({ pressed }) => [
            styles.primaryButton,
            isLastSlide && styles.getStartedButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {isLastSlide ? t('onboarding.getStarted') : t('onboarding.next')}
          </Text>
          <AppIcon
            color={colors.white}
            name={isLastSlide ? 'check' : 'arrow-right'}
            size={18}
          />
        </Pressable>
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
      backgroundColor: 'rgba(0, 0, 0, 0.08)',
      borderRadius: 2,
      flex: 1,
      height: 4,
      overflow: 'hidden',
    },
    storyBarFill: {
      backgroundColor: 'transparent',
      borderRadius: 2,
      height: '100%',
      width: '0%',
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      zIndex: 10,
    },
    brandGroup: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    brandDot: {
      backgroundColor: colors.sun,
      borderRadius: 4,
      height: 8,
      width: 8,
    },
    brandTitle: {
      color: colors.ink,
      fontSize: 22,
      fontWeight: '900',
      letterSpacing: -0.6,
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
      color: colors.muted,
      fontSize: 14,
      fontWeight: '700',
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
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.2,
      marginBottom: spacing.xs,
      textTransform: 'uppercase',
    },
    slideTitle: {
      color: colors.ink,
      fontSize: 26,
      fontWeight: '900',
      letterSpacing: -0.8,
      lineHeight: 34,
      marginBottom: spacing.sm,
      textAlign: 'center',
    },
    slideDescription: {
      color: colors.muted,
      fontSize: 15,
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
      backgroundColor: colors.primaryDark,
      borderRadius: radii.full,
      flexDirection: 'row',
      gap: spacing.xs,
      justifyContent: 'center',
      minHeight: 54,
      width: '100%',
    },
    getStartedButton: {
      backgroundColor: colors.primary,
    },
    buttonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.985 }],
    },
    primaryButtonText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
  });
