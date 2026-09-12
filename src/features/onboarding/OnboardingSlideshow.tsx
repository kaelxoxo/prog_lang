import { useRef, useState } from 'react';
import {
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
    tag: 'MEET BANTAY',
    titleKey: 'onboarding.slide1Title',
    defaultTitle: 'Your gentle care companion',
    descKey: 'onboarding.slide1Desc',
    defaultDesc:
      'A warm, faithful friend here to help you and your family manage daily medicines with calm reassurance and complete peace of mind.',
    accentKey: 'sun',
  },
  {
    id: 'slide-1',
    tag: 'GENTLE MEDICINES',
    titleKey: 'onboarding.slide2Title',
    defaultTitle: 'Clear schedules with zero confusion',
    descKey: 'onboarding.slide2Desc',
    defaultDesc:
      'Keep track of exact doses, meal timings, and thoughtful reminders. Designed to feel supportive, simple, and never alarmist.',
    accentKey: 'success',
  },
  {
    id: 'slide-2',
    tag: 'FAMILY & PRIVACY',
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

  const handleDotPress = (index: number) => {
    flatListRef.current?.scrollToIndex({ animated: true, index });
    setActiveIndex(index);
  };

  const isLastSlide = activeIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
        {/* Top Header with Brand and Skip */}
        <View style={styles.header}>
          <View style={styles.brandGroup}>
            <Text style={styles.brandTitle}>Alaga</Text>
            <View style={styles.brandBadge}>
              <Text style={styles.brandBadgeText}>CARE SPACE</Text>
            </View>
          </View>

          <Pressable
            accessibilityHint="Skips the welcome introduction and goes directly to account setup"
            accessibilityLabel="Skip welcome walkthrough"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onComplete}
            style={({ pressed }) => [styles.skipButton, pressed && styles.skipPressed]}
          >
            <Text style={styles.skipText}>Skip</Text>
            <AppIcon color={colors.muted} name="chevron-right" size={16} />
          </Pressable>
        </View>

        {/* Paging Content */}
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
                {/* Mascot Animated Stage */}
                <View style={styles.stageWrapper}>
                  <OnboardingMascotStage size={120} slideIndex={index} />
                </View>

                {/* Editorial Content Card */}
                <View style={styles.card}>
                  <View
                    style={[
                      styles.tagPill,
                      {
                        backgroundColor:
                          index === 0
                            ? 'rgba(232, 184, 93, 0.18)'
                            : index === 1
                              ? 'rgba(71, 112, 100, 0.16)'
                              : 'rgba(156, 79, 53, 0.16)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tagText,
                        {
                          color:
                            index === 0
                              ? colors.sun
                              : index === 1
                                ? colors.successDark
                                : colors.primary,
                        },
                      ]}
                    >
                      {item.tag}
                    </Text>
                  </View>

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

        {/* Bottom Navigation & Indicator Bar */}
        <View style={styles.footer}>
          {/* Animated Pagination Dots */}
          <View accessibilityLabel={`Slide ${activeIndex + 1} of ${SLIDES.length}`} accessibilityRole="tablist" style={styles.pagination}>
            {SLIDES.map((slide, idx) => {
              const active = idx === activeIndex;
              return (
                <Pressable
                  accessibilityLabel={`Go to slide ${idx + 1}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  hitSlop={8}
                  key={slide.id}
                  onPress={() => handleDotPress(idx)}
                  style={[
                    styles.dot,
                    active && styles.dotActive,
                    active && {
                      backgroundColor:
                        activeIndex === 0
                          ? colors.sun
                          : activeIndex === 1
                            ? colors.success
                            : colors.primary,
                    },
                  ]}
                />
              );
            })}
          </View>

          {/* Primary Action Button */}
          <Pressable
            accessibilityLabel={isLastSlide ? 'Get started and create account' : 'Next slide'}
            accessibilityRole="button"
            onPress={handleNext}
            style={({ pressed }) => [
              styles.primaryButton,
              isLastSlide && styles.getStartedButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {isLastSlide ? 'Get Started' : 'Next'}
            </Text>
            <AppIcon
              color={colors.white}
              name={isLastSlide ? 'sparkles' : 'arrow-right'}
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
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      zIndex: 10,
    },
    brandGroup: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    brandTitle: {
      color: colors.primaryDark,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    brandBadge: {
      backgroundColor: colors.mist,
      borderColor: colors.line,
      borderRadius: radii.full,
      borderWidth: 1,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
    },
    brandBadgeText: {
      color: colors.muted,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.6,
    },
    skipButton: {
      alignItems: 'center',
      borderRadius: radii.full,
      flexDirection: 'row',
      gap: 2,
      justifyContent: 'center',
      minHeight: 44,
      minWidth: 60,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    skipPressed: {
      opacity: 0.6,
    },
    skipText: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: '600',
    },
    flatList: {
      flex: 1,
    },
    slide: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    stageWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
      width: '100%',
    },
    card: {
      alignItems: 'center',
      backgroundColor: colors.white,
      borderColor: colors.line,
      borderRadius: radii.xl,
      borderWidth: 1,
      elevation: 3,
      maxWidth: 420,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      width: '100%',
    },
    tagPill: {
      borderRadius: radii.full,
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
    },
    tagText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
    },
    slideTitle: {
      color: colors.ink,
      fontSize: 20,
      fontWeight: '800',
      lineHeight: 26,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    slideDescription: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    footer: {
      alignItems: 'center',
      flexDirection: 'column',
      gap: spacing.sm,
      paddingBottom: spacing.lg,
      paddingHorizontal: spacing.lg,
    },
    pagination: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
      justifyContent: 'center',
      paddingVertical: spacing.xs,
    },
    dot: {
      backgroundColor: colors.line,
      borderRadius: radii.full,
      height: 8,
      width: 8,
    },
    dotActive: {
      width: 26,
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: colors.primaryDark,
      borderRadius: radii.full,
      elevation: 3,
      flexDirection: 'row',
      gap: spacing.xs,
      justifyContent: 'center',
      minHeight: 52,
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.14,
      shadowRadius: 6,
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
      fontSize: 15,
      fontWeight: '800',
    },
  });
