import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIconName } from '@react-native-vector-icons/lucide';

import { AppIcon } from '../../components/AppIcon';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';

export type QuickActionDrawerProps = {
  visible: boolean;
  onClose: () => void;
  onLogDose: () => void;
  onAddMed: () => void;
  onScanRx: () => void;
  onAskBantay: () => void;
};

type ActionItemProps = {
  description: string;
  icon: LucideIconName;
  iconBg: string;
  iconColor: string;
  onPress: () => void;
  title: string;
};

function DrawerActionItem({
  description,
  icon,
  iconBg,
  iconColor,
  onPress,
  title,
}: ActionItemProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scale, {
      duration: 100,
      easing: Easing.out(Easing.quad),
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      tension: 140,
      friction: 7,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.actionPressable}
    >
      <Animated.View style={[styles.actionRow, { transform: [{ scale }] }]}>
        <View style={[styles.actionIconWrap, { backgroundColor: iconBg }]}>
          <AppIcon color={iconColor} name={icon} size={22} />
        </View>
        <View style={styles.actionTextWrap}>
          <Text style={styles.actionTitle}>{title}</Text>
          <Text numberOfLines={1} style={styles.actionDescription}>
            {description}
          </Text>
        </View>
        <View style={styles.actionChevron}>
          <AppIcon color={colors.muted} name="chevron-right" size={18} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function QuickActionDrawer({
  onAddMed,
  onAskBantay,
  onClose,
  onLogDose,
  onScanRx,
  visible,
}: QuickActionDrawerProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { t } = useLocale();
  const insets = useSafeAreaInsets();

  const [rendered, setRendered] = useState(visible);
  const translateY = useRef(new Animated.Value(360)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const isClosing = useRef(false);

  // Handle entrance and exit transitions (sub-300ms ease-out)
  useEffect(() => {
    let active = true;

    if (visible) {
      isClosing.current = false;
      setRendered(true);

      AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
        if (!active) return;
        if (reduceMotion) {
          translateY.setValue(0);
          opacity.setValue(1);
          return;
        }

        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 240,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else if (rendered && !isClosing.current) {
      isClosing.current = true;
      AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
        if (!active) return;
        if (reduceMotion) {
          setRendered(false);
          return;
        }

        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 160,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 360,
            duration: 180,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (active) {
            setRendered(false);
          }
        });
      });
    }

    return () => {
      active = false;
    };
  }, [visible, rendered, opacity, translateY]);

  // Smooth close triggering exit animation before calling onClose
  const handleSmoothClose = () => {
    if (isClosing.current) return;
    isClosing.current = true;

    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (reduceMotion) {
        onClose();
        setRendered(false);
        return;
      }

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 160,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 360,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        onClose();
        setRendered(false);
      });
    });
  };

  // Hardware back press handling
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleSmoothClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible]);

  if (!rendered) return null;

  // Dark/light mode tinted icon colors
  const eucalyptusBg = isDark ? '#1D332A' : '#EAF2EC';
  const eucalyptusColor = isDark ? '#8DC2A7' : '#2D5A46';
  const terracottaBg = isDark ? '#382119' : '#F9EDE6';
  const terracottaColor = isDark ? '#E07D5A' : '#BC4F27';
  const sunBg = isDark ? '#382B14' : '#FEF6E4';
  const sunColor = isDark ? '#F3C562' : '#9E6700';

  return (
    <Modal
      animationType="none"
      onRequestClose={handleSmoothClose}
      statusBarTranslucent
      transparent
      visible={rendered}
    >
      <View style={styles.overlayContainer}>
        {/* Backdrop Scrim */}
        <Animated.View style={[styles.backdrop, { opacity }]}>
          <Pressable
            accessibilityHint="Dismisses the quick action menu"
            accessibilityLabel="Close quick actions drawer"
            accessibilityRole="button"
            onPress={handleSmoothClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* Slide-up Drawer Container */}
        <Animated.View
          style={[
            styles.drawerSheet,
            {
              paddingBottom: Math.max(insets.bottom, 20),
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Top Drag Handle Indicator */}
          <View style={styles.dragHandle} />

          {/* Drawer Header */}
          <View style={styles.drawerHeader}>
            <View style={styles.headerTextColumn}>
              <Text accessibilityRole="header" style={styles.drawerTitle}>
                {t('home.quickActionsTitle') || 'Quick Actions'}
              </Text>
              <Text style={styles.drawerSubtitle}>
                Record doses, manage prescriptions, or ask Bantay
              </Text>
            </View>
            <Pressable
              accessibilityHint="Closes quick action menu"
              accessibilityLabel="Close"
              accessibilityRole="button"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={handleSmoothClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            >
              <AppIcon color={colors.ink} name="x" size={18} />
            </Pressable>
          </View>

          {/* 4 Quick Actions List */}
          <View style={styles.actionsList}>
            {/* 1. Log Dose */}
            <DrawerActionItem
              description="Record dose as taken or review today's schedule"
              icon="circle-check"
              iconBg={eucalyptusBg}
              iconColor={eucalyptusColor}
              onPress={() => {
                handleSmoothClose();
                onLogDose();
              }}
              title={t('home.actionLogDose') || 'Log Dose'}
            />

            {/* 2. Add Med */}
            <DrawerActionItem
              description="Set up a new medication, strength, and schedule"
              icon="plus"
              iconBg={terracottaBg}
              iconColor={terracottaColor}
              onPress={() => {
                handleSmoothClose();
                onAddMed();
              }}
              title={t('home.actionAddMedicine') || 'Add Medicine'}
            />

            {/* 3. Scan Rx */}
            <DrawerActionItem
              description="Capture prescription or medicine label via OCR camera"
              icon="camera"
              iconBg={sunBg}
              iconColor={sunColor}
              onPress={() => {
                handleSmoothClose();
                onScanRx();
              }}
              title={t('home.actionScanRx') || 'Scan Rx'}
            />

            {/* 4. Ask Bantay */}
            <DrawerActionItem
              description="Consult your AI health companion about medicines"
              icon="sparkles"
              iconBg={eucalyptusBg}
              iconColor={eucalyptusColor}
              onPress={() => {
                handleSmoothClose();
                onAskBantay();
              }}
              title="Ask Bantay"
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    overlayContainer: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.overlay,
    },
    drawerSheet: {
      width: '100%',
      maxWidth: 540,
      alignSelf: 'center',
      backgroundColor: colors.white,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
      elevation: 16,
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
    },
    dragHandle: {
      width: 40,
      height: 4,
      borderRadius: radii.full,
      backgroundColor: colors.controlBorder,
      alignSelf: 'center',
      marginTop: 8,
      marginBottom: 10,
    },
    drawerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xs,
      paddingBottom: spacing.sm,
      marginBottom: spacing.xs,
    },
    headerTextColumn: {
      flex: 1,
      gap: 2,
    },
    drawerTitle: {
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '800',
      color: colors.ink,
      letterSpacing: -0.3,
    },
    drawerSubtitle: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      color: colors.muted,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.mist,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: spacing.sm,
    },
    closeButtonPressed: {
      opacity: 0.75,
    },
    actionsList: {
      gap: spacing.xs,
      paddingTop: spacing.xs,
    },
    actionPressable: {
      minHeight: 56,
      borderRadius: radii.squircle,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated || colors.white,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.squircle,
      paddingVertical: 10,
      paddingHorizontal: spacing.sm,
      minHeight: 56,
    },
    actionIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    actionTextWrap: {
      flex: 1,
      justifyContent: 'center',
      gap: 2,
    },
    actionTitle: {
      fontSize: 15,
      lineHeight: 19,
      fontWeight: '700',
      color: colors.ink,
    },
    actionDescription: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      color: colors.muted,
    },
    actionChevron: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: spacing.xs,
    },
  });
